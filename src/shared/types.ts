export interface GlobalSettings {
  enableStyling: boolean;
  autoUpdate: boolean;
  forceStyling: boolean;
  whitelistMode: boolean;
  whitelistStyleMode: boolean;
  disableTransparency: boolean;
  disableHover: boolean;
  disableFooter: boolean;
  disableDarkReader: boolean;
  enableLogs: boolean;
  welcomeShown: boolean;
  lastFetchedTime?: number;
}

export type SiteFeatureSettings = Record<string, boolean>;

export interface SiteFeatureMetadata {
  touched: boolean;
  autoDisabledForChrome?: boolean;
}

export type SiteFeatureMetadataMap = Record<string, SiteFeatureMetadata>;

export type WebsiteFeatureMap = Record<string, string>;

export interface StylesPayload {
  website?: Record<string, WebsiteFeatureMap>;
  mapping?: Record<string, string[]>;
}

export interface StoredMapping {
  mapping: Record<string, string[]>;
}

export interface ExtensionSnapshot {
  settings: GlobalSettings;
  skipThemingList: string[];
  skipForceThemingList: string[];
  fallbackBackgroundList: string[];
  styles: StylesPayload | null;
  stylesMapping: StoredMapping;
  userStylesMapping: StoredMapping;
  repositoryUrl: string;
}

export interface SiteStyleInfo {
  hostname: string;
  styleKey: string | null;
  features: SiteStyleFeatureInfo[];
}

export interface SiteStyleFeatureInfo {
  name: string;
  autoDisabledForChrome: boolean;
}

export interface StyleDecision {
  shouldApply: boolean;
  reason:
    | "globally_disabled"
    | "style_whitelisted"
    | "style_blacklisted"
    | "style_not_whitelisted"
    | "force_whitelisted"
    | "force_blacklisted"
    | "force_not_whitelisted"
    | "fallback_background"
    | "no_rules";
  styleKey: string | null;
  hasFallbackBackground: boolean;
}

export type RuntimeRequest =
  | { type: "content/ready"; hostname: string }
  | { type: "worker/refetch-styles" }
  | { type: "worker/refresh-active-tab" }
  | { type: "worker/update-auto-update"; enabled: boolean };

export type RuntimeResponse =
  | { ok: true }
  | { ok: true; stylesUpdated: boolean }
  | { ok: false; error: string };

export type ContentMessage =
  | { type: "content/apply-styles"; css: string }
  | { type: "content/remove-styles" }
  | { type: "content/show-toast"; text: string; isEnabled: boolean };
