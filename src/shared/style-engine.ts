import { filterUnsupportedChromeCss, isFullyUnsupportedChromeCss } from "./css-compat";
import { normalizeHostname, normalizeSitePattern } from "./settings";
import type {
  ExtensionSnapshot,
  SiteFeatureMetadataMap,
  SiteFeatureSettings,
  SiteStyleFeatureInfo,
  SiteStyleInfo,
  StoredMapping,
  StyleDecision,
  StylesPayload,
  WebsiteFeatureMap,
} from "./types";

export function mergeMappings(base: StoredMapping, user: StoredMapping): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...base.mapping };

  for (const [source, targets] of Object.entries(user.mapping)) {
    const existing = new Set(merged[source] ?? []);
    for (const target of targets) {
      existing.add(normalizeSitePattern(target));
    }
    merged[source] = [...existing];
  }

  return merged;
}

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

  const mergedMapping = mergeMappings(snapshot.stylesMapping, snapshot.userStylesMapping);
  return resolveMappedStyleKey(hostname, styles, mergedMapping);
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
    features: featureNames.map((name) => ({
      name,
      autoDisabledForChrome: false,
    })),
  };
}

export function getAutoDisabledFeatures(
  hostname: string,
  snapshot: ExtensionSnapshot,
  siteFeatureMetadata: SiteFeatureMetadataMap,
): string[] {
  const normalizedHostname = normalizeHostname(hostname);
  const styleKey = resolveStyleKey(normalizedHostname, snapshot);
  const styles = getWebsiteStyles(snapshot.styles);

  if (!styleKey || !styles[styleKey]) {
    return [];
  }

  const disabledFeatures: string[] = [];
  for (const [featureName, css] of Object.entries(styles[styleKey])) {
    if (siteFeatureMetadata[featureName]?.touched) {
      continue;
    }

    if (isFullyUnsupportedChromeCss(css)) {
      disabledFeatures.push(featureName);
    }
  }

  return disabledFeatures;
}

export function withFeatureMetadata(
  siteStyleInfo: SiteStyleInfo,
  siteFeatureMetadata: SiteFeatureMetadataMap,
): SiteStyleInfo {
  const features: SiteStyleFeatureInfo[] = siteStyleInfo.features.map((feature) => ({
    ...feature,
    autoDisabledForChrome: siteFeatureMetadata[feature.name]?.autoDisabledForChrome === true,
  }));

  return {
    ...siteStyleInfo,
    features,
  };
}

export function getStyleDecision(hostname: string, snapshot: ExtensionSnapshot): StyleDecision {
  const normalizedHostname = normalizeHostname(hostname);
  const styleKey = resolveStyleKey(normalizedHostname, snapshot);
  const hasFallbackBackground = snapshot.fallbackBackgroundList.includes(normalizedHostname);

  if (!snapshot.settings.enableStyling) {
    return {
      shouldApply: false,
      reason: hasFallbackBackground ? "fallback_background" : "globally_disabled",
      styleKey,
      hasFallbackBackground,
    };
  }

  if (styleKey) {
    const listed = snapshot.skipThemingList.includes(normalizedHostname);
    if (snapshot.settings.whitelistStyleMode) {
      return {
        shouldApply: listed || hasFallbackBackground,
        reason: listed ? "style_whitelisted" : hasFallbackBackground ? "fallback_background" : "style_not_whitelisted",
        styleKey,
        hasFallbackBackground,
      };
    }

    return {
      shouldApply: !listed || hasFallbackBackground,
      reason: listed ? (hasFallbackBackground ? "fallback_background" : "style_blacklisted") : "style_whitelisted",
      styleKey,
      hasFallbackBackground,
    };
  }

  if (snapshot.settings.forceStyling) {
    const listed = snapshot.skipForceThemingList.includes(normalizedHostname);
    if (snapshot.settings.whitelistMode) {
      return {
        shouldApply: listed || hasFallbackBackground,
        reason: listed ? "force_whitelisted" : hasFallbackBackground ? "fallback_background" : "force_not_whitelisted",
        styleKey: listed ? "example.com.css" : hasFallbackBackground ? "example.com.css" : null,
        hasFallbackBackground,
      };
    }

    return {
      shouldApply: !listed || hasFallbackBackground,
      reason: listed ? (hasFallbackBackground ? "fallback_background" : "force_blacklisted") : "force_whitelisted",
      styleKey: !listed || hasFallbackBackground ? "example.com.css" : null,
      hasFallbackBackground,
    };
  }

  return {
    shouldApply: hasFallbackBackground,
    reason: hasFallbackBackground ? "fallback_background" : "no_rules",
    styleKey: null,
    hasFallbackBackground,
  };
}

function isFeatureEnabled(
  featureName: string,
  css: string,
  snapshot: ExtensionSnapshot,
  siteSettings: SiteFeatureSettings,
  hasFallbackBackground: boolean,
): boolean {
  const lowerFeature = featureName.toLowerCase();
  const lowerCss = css.toLowerCase();
  const filteredCss = filterUnsupportedChromeCss(css).css.trim();

  if (siteSettings[featureName] === false) {
    return false;
  }

  if (!filteredCss) {
    return false;
  }

  if (lowerFeature.includes("transparency") && (snapshot.settings.disableTransparency || hasFallbackBackground)) {
    return false;
  }

  if (lowerFeature.includes("hover") && snapshot.settings.disableHover) {
    return false;
  }

  if (lowerFeature.includes("footer") && snapshot.settings.disableFooter) {
    return false;
  }

  if ((lowerFeature.includes("darkreader") || lowerCss.includes("darkreader")) && snapshot.settings.disableDarkReader) {
    return false;
  }

  return true;
}

export function buildCssForHostname(
  hostname: string,
  snapshot: ExtensionSnapshot,
  siteSettings: SiteFeatureSettings,
): string | null {
  const styles = getWebsiteStyles(snapshot.styles);
  const decision = getStyleDecision(hostname, snapshot);
  const styleKey = decision.styleKey;

  if (!decision.shouldApply && !decision.hasFallbackBackground) {
    return null;
  }

  let combinedCss = "";
  if (decision.shouldApply && styleKey && styles[styleKey]) {
    for (const [featureName, css] of Object.entries(styles[styleKey])) {
      if (isFeatureEnabled(featureName, css, snapshot, siteSettings, decision.hasFallbackBackground)) {
        const filteredCss = filterUnsupportedChromeCss(css).css.trim();
        if (filteredCss) {
          combinedCss += `${filteredCss}\n`;
        }
      }
    }
  }

  if (decision.hasFallbackBackground) {
    combinedCss += "html{background-color: light-dark(#fff, #111);}\n";
  }

  return combinedCss.trim() ? combinedCss.trim() : decision.hasFallbackBackground ? combinedCss.trim() : null;
}
