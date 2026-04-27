export type BackgroundImageMode = "stretch" | "tile" | "fill" | "fit" | "center";

export interface GlobalSettings {
  enableStyling: boolean;
  autoUpdate: boolean;
  backgroundColor: string;
  backgroundImageMode: BackgroundImageMode;
  backgroundImageTintOpacity: number;
  backgroundImageBlurPx: number;
  backgroundImageName?: string;
  backgroundImageMimeType?: string;
  backgroundImageSizeBytes?: number;
  lastFetchedTime?: number;
}

export const SITE_STYLING_ENABLED_KEY = "__enabled";
export const SITE_BACKGROUND_IMAGE_ENABLED_KEY = "__backgroundImageEnabled";

export type SiteFeatureSettings = Record<string, boolean>;

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
  styles: StylesPayload | null;
  stylesMapping: StoredMapping;
  repositoryUrl: string;
  backgroundImageDataUrl: string | null;
}

export interface SiteStyleInfo {
  hostname: string;
  styleKey: string | null;
  features: SiteStyleFeatureInfo[];
}

export interface SiteStyleFeatureInfo {
  name: string;
}

export interface StyleDecision {
  shouldApply: boolean;
  reason: "globally_disabled" | "style_matched" | "no_rules";
  styleKey: string | null;
}

export type RuntimeRequest =
  | { type: "content/ready" }
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
