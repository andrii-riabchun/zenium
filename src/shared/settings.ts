import { DEFAULT_SETTINGS, MAX_BACKGROUND_IMAGE_BLUR_PX, MAX_BACKGROUND_IMAGE_TINT_OPACITY } from "./constants";
import type { BackgroundImageMode, GlobalSettings } from "./types";

export function normalizeHostname(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function normalizeSitePattern(pattern: string): string {
  const trimmed = pattern.trim();
  const prefix = trimmed.startsWith("+") || trimmed.startsWith("-") ? trimmed[0] : "";
  const hostname = prefix ? trimmed.slice(1) : trimmed;
  const normalized = normalizeHostname(hostname);
  return prefix ? `${prefix}${normalized}` : normalized;
}

export function withDefaultSettings(settings?: Partial<GlobalSettings>): GlobalSettings {
  const next: GlobalSettings = {
    enableStyling: settings?.enableStyling ?? DEFAULT_SETTINGS.enableStyling,
    autoUpdate: settings?.autoUpdate ?? DEFAULT_SETTINGS.autoUpdate,
    backgroundColor: settings?.backgroundColor ?? DEFAULT_SETTINGS.backgroundColor,
    backgroundImageMode: normalizeBackgroundImageMode(settings?.backgroundImageMode),
    backgroundImageTintOpacity: normalizeBackgroundImageTintOpacity(settings?.backgroundImageTintOpacity),
    backgroundImageBlurPx: normalizeBackgroundImageBlurPx(settings?.backgroundImageBlurPx),
  };

  if (typeof settings?.backgroundImageName === "string" && settings.backgroundImageName.trim()) {
    next.backgroundImageName = settings.backgroundImageName;
  }

  if (typeof settings?.backgroundImageMimeType === "string" && settings.backgroundImageMimeType.trim()) {
    next.backgroundImageMimeType = settings.backgroundImageMimeType;
  }

  if (typeof settings?.backgroundImageSizeBytes === "number" && Number.isFinite(settings.backgroundImageSizeBytes) && settings.backgroundImageSizeBytes > 0) {
    next.backgroundImageSizeBytes = settings.backgroundImageSizeBytes;
  }

  if (typeof settings?.lastFetchedTime === "number") {
    next.lastFetchedTime = settings.lastFetchedTime;
  }

  return next;
}

function parseHexColor(color: string): [number, number, number] | null {
  const value = color.trim();
  const shortHexMatch = value.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split("").map((channel) => Number.parseInt(`${channel}${channel}`, 16));
    return [r, g, b];
  }

  const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
  if (!hexMatch) {
    return null;
  }

  return [
    Number.parseInt(hexMatch[1].slice(0, 2), 16),
    Number.parseInt(hexMatch[1].slice(2, 4), 16),
    Number.parseInt(hexMatch[1].slice(4, 6), 16),
  ];
}

export function getColorSchemeForBackground(backgroundColor: string): "light" | "dark" {
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) {
    return "dark";
  }

  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "light" : "dark";
}

export function normalizeBackgroundImageMode(mode?: string): BackgroundImageMode {
  switch (mode) {
    case "stretch":
    case "tile":
    case "fill":
    case "fit":
    case "center":
      return mode;
    default:
      return DEFAULT_SETTINGS.backgroundImageMode;
  }
}

export function getBackgroundImagePresentation(mode: BackgroundImageMode): {
  size: string;
  repeat: string;
  position: string;
} {
  switch (mode) {
    case "stretch":
      return { size: "100% 100%", repeat: "no-repeat", position: "center center" };
    case "tile":
      return { size: "auto", repeat: "repeat", position: "0 0" };
    case "fit":
      return { size: "contain", repeat: "no-repeat", position: "center center" };
    case "center":
      return { size: "auto", repeat: "no-repeat", position: "center center" };
    case "fill":
    default:
      return { size: "cover", repeat: "no-repeat", position: "center center" };
  }
}

export function normalizeBackgroundImageTintOpacity(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.backgroundImageTintOpacity;
  }

  return Math.min(MAX_BACKGROUND_IMAGE_TINT_OPACITY, Math.max(0, Math.round(value)));
}

export function normalizeBackgroundImageBlurPx(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.backgroundImageBlurPx;
  }

  return Math.min(MAX_BACKGROUND_IMAGE_BLUR_PX, Math.max(0, Math.round(value)));
}

export function getBackgroundImageScaleForBlur(blurPx: number): number {
  return blurPx > 0 ? 1 + blurPx / 300 : 1;
}

export function getCssColorWithOpacity(backgroundColor: string, opacityPercent: number): string {
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) {
    return "transparent";
  }

  const [r, g, b] = rgb;
  const alpha = Math.min(1, Math.max(0, opacityPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hasConfiguredBackgroundImage(settings?: Pick<GlobalSettings, "backgroundImageName"> | null): boolean {
  return Boolean(settings?.backgroundImageName?.trim());
}

export function isHttpUrl(url?: string): url is string {
  return Boolean(url && /^https?:/i.test(url));
}
