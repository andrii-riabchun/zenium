import { DEFAULT_SETTINGS } from "./constants";
import type { GlobalSettings } from "./types";

export function normalizeHostname(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function withDefaultSettings(settings?: Partial<GlobalSettings>): GlobalSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

export function isHttpUrl(url?: string): url is string {
  return Boolean(url && /^https?:/i.test(url));
}
