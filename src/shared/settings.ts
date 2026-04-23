import { DEFAULT_SETTINGS } from "./constants";
import type { GlobalSettings } from "./types";

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
  };

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

export function isHttpUrl(url?: string): url is string {
  return Boolean(url && /^https?:/i.test(url));
}
