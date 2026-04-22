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
    forceStyling: settings?.forceStyling ?? DEFAULT_SETTINGS.forceStyling,
  };

  if (typeof settings?.lastFetchedTime === "number") {
    next.lastFetchedTime = settings.lastFetchedTime;
  }

  return next;
}

export function isHttpUrl(url?: string): url is string {
  return Boolean(url && /^https?:/i.test(url));
}
