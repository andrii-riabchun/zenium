const TRANSPARENT_COLOR_RE = /^(?:transparent|#0000|#00000000|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(?:\.0+)?\s*\))$/i;
const TRANSPARENT_VAR_RE = /^(?:transparent|#0000|#00000000|rgba?\([^;)]*,\s*0(?:\.0+)?\s*\))$/i;

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

function rewriteDeclaration(declaration: string, backgroundColor: string, preserveTransparentBackground: boolean): string {
  const important = /\s*!important\s*$/i.test(declaration) ? " !important" : "";
  const match = declaration.match(/^\s*([^:]+):\s*(.*?)\s*(?:!important\s*)?$/i);
  if (!match) {
    return declaration;
  }

  const property = match[1].trim();
  const value = match[2].trim();
  const lowerProperty = property.toLowerCase();

  if (lowerProperty === "background-color" && TRANSPARENT_COLOR_RE.test(value)) {
    return preserveTransparentBackground ? declaration : `${property}: ${backgroundColor}${important}`;
  }

  if (lowerProperty === "background" && /^(?:none|transparent|#0000|#00000000)$/i.test(value)) {
    return preserveTransparentBackground ? declaration : `${property}: ${backgroundColor}${important}`;
  }

  if (/^--[\w-]*(?:bg|background|surface|canvas|wash|overlay)[\w-]*$/i.test(property) && TRANSPARENT_VAR_RE.test(value)) {
    return preserveTransparentBackground ? declaration : `${property}: ${backgroundColor}${important}`;
  }

  return declaration;
}

function rewriteDeclarations(declarations: string, backgroundColor: string, preserveTransparentBackground: boolean): string {
  const parts = splitTopLevel(declarations, ";");
  if (parts.length === 0) {
    return declarations;
  }

  return `${parts.map((part) => rewriteDeclaration(part, backgroundColor, preserveTransparentBackground)).join("; ")};`;
}

function rewriteRule(rule: string, backgroundColor: string, preserveTransparentBackground: boolean): string {
  const openIndex = rule.indexOf("{");
  const closeIndex = rule.lastIndexOf("}");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return rule;
  }

  const prelude = rule.slice(0, openIndex).trim();
  const body = rule.slice(openIndex + 1, closeIndex);

  if (prelude.startsWith("@")) {
    return `${prelude} {${rewriteChromeBackgroundCss(body, backgroundColor, preserveTransparentBackground)}}`;
  }

  return `${prelude} {${rewriteDeclarations(body, backgroundColor, preserveTransparentBackground)}}`;
}

export function rewriteChromeBackgroundCss(css: string, backgroundColor: string, preserveTransparentBackground = false): string {
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

    output += rewriteRule(css.slice(cursor, closeIndex + 1), backgroundColor, preserveTransparentBackground);
    cursor = closeIndex + 1;
  }

  return output.trim();
}
