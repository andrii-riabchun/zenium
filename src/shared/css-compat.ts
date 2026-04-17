export interface CssCompatibilityResult {
  css: string;
  filtered: boolean;
}

const SHELL_IDS = new Set(["#root", "#__next", "#app", "#main", "#content", "#wrapper"]);
const SHELL_CLASSES = new Set([".app", ".app-root", ".AppContainer"]);
const SHELL_TAGS = new Set(["html", "body", "main", "section", "article", "app"]);
const GENERIC_WRAPPER_TAGS = new Set(["div", "span"]);

const FULLY_TRANSPARENT_BG_RE =
  /(?:^|;)\s*(?:background-color\s*:\s*(?:transparent|#00000000|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(?:\.0+)?\s*\))|background\s*:\s*(?:none|transparent|#00000000)|background-image\s*:\s*none)\s*!?important?/i;
const TRANSPARENT_BG_VAR_RE =
  /(?:^|;)\s*--[\w-]*(?:bg|background|surface|canvas|wash|overlay)[\w-]*\s*:\s*(?:transparent|#00000000|rgba?\([^;)]*,\s*0(?:\.0+)?\s*\))\s*!?important?/i;
const RESET_DECORATION_RE = /(?:^|;)\s*(?:border\s*:\s*none|box-shadow\s*:\s*none)\s*!?important?/i;
const BACKDROP_GLASS_RE = /(?:^|;)\s*backdrop-filter\s*:\s*(?!none\b)[^;]+/i;
const SEMI_TRANSPARENT_BG_RE =
  /(?:^|;)\s*(?:background|background-color)\s*:\s*(?:rgba?\([^;)]*,\s*(?:0?\.\d+|1|var\([^)]+\))\s*\)|hsla?\([^;)]*,\s*(?:0?\.\d+|1)\s*\)|#[0-9a-f]{4}\b|#[0-9a-f]{8}\b|light-dark\(|color-mix\(|var\(--backdrop-bg\))/i;

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let inString: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const previous = input[index - 1];

    if (inString) {
      current += char;
      if (char === inString && previous !== "\\") {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === separator && parenDepth === 0 && bracketDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function findMatchingBrace(css: string, openIndex: number): number {
  let depth = 0;
  let inString: string | null = null;

  for (let index = openIndex; index < css.length; index += 1) {
    const char = css[index];
    const previous = css[index - 1];

    if (inString) {
      if (char === inString && previous !== "\\") {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitSelectorSegments(selector: string): string[] {
  const segments: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let inString: string | null = null;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    const previous = selector[index - 1];

    if (inString) {
      current += char;
      if (char === inString && previous !== "\\") {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    const isTopLevelCombinator =
      parenDepth === 0 && bracketDepth === 0 && (char === ">" || char === "+" || char === "~" || char === " ");

    if (isTopLevelCombinator) {
      if (current.trim()) {
        segments.push(current.trim());
        current = "";
      }

      while (selector[index + 1] === " ") {
        index += 1;
      }
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

interface CompoundAnalysis {
  hasShellToken: boolean;
  hasComponentSignal: boolean;
  isAnonymousWrapper: boolean;
}

function analyzeCompound(compound: string): CompoundAnalysis {
  const ids = [...compound.matchAll(/#[\w-]+/g)].map(([value]) => value);
  const classes = [...compound.matchAll(/\.[\w-]+/g)].map(([value]) => value);
  const hasRootPseudo = /:root\b/.test(compound);
  const rawTag = compound.trim().match(/^[a-zA-Z][\w-]*/)?.[0] ?? null;
  const tag = rawTag?.toLowerCase() ?? null;
  const hasAttributes = /\[[^\]]+\]/.test(compound);
  const hasShellId = ids.some((value) => SHELL_IDS.has(value));
  const hasShellClass = classes.some((value) => SHELL_CLASSES.has(value));
  const hasShellTag = tag ? SHELL_TAGS.has(tag) : false;
  const hasShellToken = hasRootPseudo || hasShellId || hasShellClass || hasShellTag;

  const hasNonShellId = ids.some((value) => !SHELL_IDS.has(value));
  const hasNonShellClass = classes.some((value) => !SHELL_CLASSES.has(value));
  const hasCustomElement = Boolean(tag && tag.includes("-"));
  const hasSpecificTag = Boolean(tag && !SHELL_TAGS.has(tag) && !GENERIC_WRAPPER_TAGS.has(tag));
  const hasComponentSignal =
    hasNonShellId ||
    hasNonShellClass ||
    hasCustomElement ||
    hasSpecificTag ||
    (!hasShellToken && hasAttributes);

  const isAnonymousWrapper =
    !hasShellToken && !hasComponentSignal && !hasAttributes && Boolean(tag && GENERIC_WRAPPER_TAGS.has(tag));

  return {
    hasShellToken,
    hasComponentSignal,
    isAnonymousWrapper,
  };
}

function isShellTargetSelector(selector: string): boolean {
  const compounds = splitSelectorSegments(selector).map(analyzeCompound);
  if (compounds.length === 0) {
    return false;
  }

  const finalCompound = compounds[compounds.length - 1];
  if (finalCompound.hasShellToken) {
    return true;
  }

  if (finalCompound.hasComponentSignal) {
    return false;
  }

  return compounds[0].hasShellToken && compounds.slice(1).every((compound) => compound.hasShellToken || compound.isAnonymousWrapper);
}

function shouldDropSelector(selector: string, declarations: string): boolean {
  if (!isShellTargetSelector(selector)) {
    return false;
  }

  const hasFullTransparency = FULLY_TRANSPARENT_BG_RE.test(declarations);
  const hasTransparentVars = TRANSPARENT_BG_VAR_RE.test(declarations);
  const hasBackdropGlass = BACKDROP_GLASS_RE.test(declarations);
  const hasSemiTransparentBg = SEMI_TRANSPARENT_BG_RE.test(declarations);
  const hasDecorationReset = RESET_DECORATION_RE.test(declarations);

  if (hasBackdropGlass && hasSemiTransparentBg) {
    return false;
  }

  if (hasFullTransparency) {
    return true;
  }

  if (hasTransparentVars && !hasBackdropGlass && !hasSemiTransparentBg) {
    return true;
  }

  return false;
}

function filterStandardRule(rule: string): CssCompatibilityResult {
  const openIndex = rule.indexOf("{");
  const closeIndex = rule.lastIndexOf("}");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return { css: rule, filtered: false };
  }

  const selectorText = rule.slice(0, openIndex).trim();
  const declarations = rule.slice(openIndex + 1, closeIndex).trim();
  const selectors = splitTopLevel(selectorText, ",");
  const supportedSelectors = selectors.filter((selector) => !shouldDropSelector(selector, declarations));

  if (supportedSelectors.length === selectors.length) {
    return { css: rule, filtered: false };
  }

  if (supportedSelectors.length === 0) {
    return { css: "", filtered: true };
  }

  return {
    css: `${supportedSelectors.join(", ")} {${declarations}}`,
    filtered: true,
  };
}

function filterAtRule(rule: string): CssCompatibilityResult {
  const openIndex = rule.indexOf("{");
  const closeIndex = rule.lastIndexOf("}");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return { css: rule, filtered: false };
  }

  const prelude = rule.slice(0, openIndex).trim();
  const innerCss = rule.slice(openIndex + 1, closeIndex);
  const innerResult = filterUnsupportedChromeCss(innerCss);

  return {
    css: `${prelude} {${innerResult.css}}`,
    filtered: innerResult.filtered,
  };
}

export function filterUnsupportedChromeCss(css: string): CssCompatibilityResult {
  let filtered = false;
  let output = "";
  let cursor = 0;

  while (cursor < css.length) {
    const openIndex = css.indexOf("{", cursor);
    if (openIndex === -1) {
      output += css.slice(cursor);
      break;
    }

    const closeIndex = findMatchingBrace(css, openIndex);
    if (closeIndex === -1) {
      output += css.slice(cursor);
      break;
    }

    const prelude = css.slice(cursor, openIndex).trim();
    const rule = css.slice(cursor, closeIndex + 1);
    const result = prelude.startsWith("@") ? filterAtRule(rule) : filterStandardRule(rule);

    output += result.css;
    filtered ||= result.filtered;
    cursor = closeIndex + 1;
  }

  return {
    css: output.trim(),
    filtered,
  };
}

export function isFullyUnsupportedChromeCss(css: string): boolean {
  const result = filterUnsupportedChromeCss(css);
  return result.filtered && !result.css.trim();
}
