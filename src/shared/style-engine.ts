import { rewriteChromeBackgroundCss } from "./css-background";
import { normalizeHostname, normalizeSitePattern } from "./settings";
import type {
  ExtensionSnapshot,
  SiteFeatureSettings,
  SiteStyleInfo,
  StyleDecision,
  StylesPayload,
  WebsiteFeatureMap,
} from "./types";
import { SITE_STYLING_ENABLED_KEY } from "./types";

function getWebsiteStyles(styles: StylesPayload | null): Record<string, WebsiteFeatureMap> {
  return styles?.website ?? {};
}

function getHostnamePatternMatchLength(hostname: string, pattern: string, allowImplicitSubdomainMatch: boolean): number {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedPattern = normalizeSitePattern(pattern);

  if (!normalizedPattern.startsWith("+") && !normalizedPattern.startsWith("-") && normalizedHostname === normalizedPattern) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (normalizedPattern.startsWith("+")) {
    const baseSite = normalizeHostname(normalizedPattern.slice(1));
    return normalizedHostname === baseSite || normalizedHostname.endsWith(`.${baseSite}`) ? baseSite.length : -1;
  }

  if (normalizedPattern.startsWith("-")) {
    const baseSite = normalizeHostname(normalizedPattern.slice(1));
    const cachedDomain = baseSite.split(".").slice(0, -1).join(".");
    const hostDomain = normalizedHostname.split(".").slice(0, -1).join(".");
    return cachedDomain && cachedDomain === hostDomain ? cachedDomain.length : -1;
  }

  return allowImplicitSubdomainMatch && normalizedHostname !== normalizedPattern && normalizedHostname.endsWith(`.${normalizedPattern}`)
    ? normalizedPattern.length
    : -1;
}

export function getAvailableStyleKeys(snapshot: ExtensionSnapshot): string[] {
  return Object.keys(getWebsiteStyles(snapshot.styles)).sort();
}

function resolveDirectStyleKey(hostname: string, styles: Record<string, WebsiteFeatureMap>): string | null {
  let bestMatch: string | null = null;
  let bestLength = -1;

  for (const styleKey of Object.keys(styles)) {
    const matchLength = getHostnamePatternMatchLength(hostname, styleKey.replace(/\.css$/, ""), true);
    if (matchLength > bestLength) {
      bestMatch = styleKey;
      bestLength = matchLength;
    }
  }

  return bestMatch;
}

function resolveMappedStyleKey(
  hostname: string,
  styles: Record<string, WebsiteFeatureMap>,
  mergedMapping: Record<string, string[]>,
): string | null {
  let bestMatch: string | null = null;
  let bestLength = -1;

  for (const [sourceStyle, targets] of Object.entries(mergedMapping)) {
    if (!styles[sourceStyle]) {
      continue;
    }

    for (const target of targets) {
      const matchLength = getHostnamePatternMatchLength(hostname, target, false);
      if (matchLength > bestLength) {
        bestMatch = sourceStyle;
        bestLength = matchLength;
      }
    }
  }

  return bestMatch;
}

export function resolveStyleKey(hostname: string, snapshot: ExtensionSnapshot): string | null {
  const styles = getWebsiteStyles(snapshot.styles);
  const directMatch = resolveDirectStyleKey(hostname, styles);
  if (directMatch) {
    return directMatch;
  }

  return resolveMappedStyleKey(hostname, styles, snapshot.stylesMapping.mapping);
}

export function getSiteStyleInfo(hostname: string, snapshot: ExtensionSnapshot): SiteStyleInfo {
  const normalizedHostname = normalizeHostname(hostname);
  const decision = getStyleDecision(normalizedHostname, snapshot);
  const styleKey = decision.shouldApply ? decision.styleKey : null;
  const styles = getWebsiteStyles(snapshot.styles);
  const featureNames = styleKey && styles[styleKey] ? Object.keys(styles[styleKey]).sort() : [];

  return {
    hostname: normalizedHostname,
    styleKey,
    features: featureNames.map((name) => ({ name })),
  };
}

export function getStyleDecision(hostname: string, snapshot: ExtensionSnapshot): StyleDecision {
  const styleKey = resolveStyleKey(hostname, snapshot);

  if (!snapshot.settings.enableStyling) {
    return {
      shouldApply: false,
      reason: "globally_disabled",
      styleKey,
    };
  }

  if (styleKey) {
    return {
      shouldApply: true,
      reason: "style_matched",
      styleKey,
    };
  }

  return {
    shouldApply: false,
    reason: "no_rules",
    styleKey: null,
  };
}

function isFeatureEnabled(
  featureName: string,
  siteSettings: SiteFeatureSettings,
): boolean {
  if (featureName === SITE_STYLING_ENABLED_KEY) {
    return false;
  }

  if (siteSettings[featureName] === false) {
    return false;
  }

  return true;
}

export function isSiteStylingEnabled(siteSettings: SiteFeatureSettings): boolean {
  return siteSettings[SITE_STYLING_ENABLED_KEY] !== false;
}

export function buildCssForHostname(
  hostname: string,
  snapshot: ExtensionSnapshot,
  siteSettings: SiteFeatureSettings,
): string | null {
  const styles = getWebsiteStyles(snapshot.styles);
  const decision = getStyleDecision(hostname, snapshot);
  const styleKey = decision.styleKey;

  if (!decision.shouldApply) {
    return null;
  }

  if (!isSiteStylingEnabled(siteSettings)) {
    return null;
  }

  let combinedCss = "";
  if (decision.shouldApply && styleKey && styles[styleKey]) {
    for (const [featureName, css] of Object.entries(styles[styleKey])) {
      if (isFeatureEnabled(featureName, siteSettings)) {
        const rewrittenCss = rewriteChromeBackgroundCss(css, snapshot.settings.backgroundColor).trim();
        if (rewrittenCss) {
          combinedCss += `${rewrittenCss}\n`;
        }
      }
    }
  }

  return combinedCss.trim() ? combinedCss.trim() : null;
}
