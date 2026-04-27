import {
  DEFAULT_REPOSITORY_URL,
  STORAGE_KEYS,
} from "./constants";
import { normalizeHostname, normalizeSitePattern, withDefaultSettings } from "./settings";
import type {
  ExtensionSnapshot,
  GlobalSettings,
  SiteFeatureSettings,
  StoredMapping,
  StylesPayload,
} from "./types";

function ensureMapping(value: unknown): StoredMapping {
  if (!value || typeof value !== "object" || !("mapping" in value)) {
    return { mapping: {} };
  }

  const mapping = (value as StoredMapping).mapping;
  if (!mapping || typeof mapping !== "object") {
    return { mapping: {} };
  }

  return {
    mapping: Object.fromEntries(
      Object.entries(mapping).map(([source, targets]) => [
        source,
        Array.isArray(targets)
          ? [...new Set(targets.filter((target): target is string => typeof target === "string").map(normalizeSitePattern))].sort()
          : [],
      ]),
    ),
  };
}

export function getSiteStorageKey(hostname: string): string {
  return `${STORAGE_KEYS.settings}.${normalizeHostname(hostname)}`;
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return withDefaultSettings(result[STORAGE_KEYS.settings] as Partial<GlobalSettings> | undefined);
}

export async function getBackgroundImageDataUrl(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.backgroundImageDataUrl);
  const value = result[STORAGE_KEYS.backgroundImageDataUrl];
  return typeof value === "string" && value ? value : null;
}

export async function setBackgroundImageDataUrl(dataUrl: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.backgroundImageDataUrl]: dataUrl });
}

export async function removeBackgroundImageDataUrl(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.backgroundImageDataUrl);
}

export async function setGlobalSettings(settings: GlobalSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function patchGlobalSettings(
  patch: Partial<GlobalSettings>,
): Promise<GlobalSettings> {
  const current = await getGlobalSettings();
  const next = withDefaultSettings({ ...current, ...patch });
  await setGlobalSettings(next);
  return next;
}

export async function getSiteSettings(hostname: string): Promise<SiteFeatureSettings> {
  const key = getSiteStorageKey(hostname);
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return value && typeof value === "object" ? (value as SiteFeatureSettings) : {};
}

export async function setSiteSettings(hostname: string, settings: SiteFeatureSettings): Promise<void> {
  const key = getSiteStorageKey(hostname);
  await chrome.storage.local.set({ [key]: settings });
}

export async function patchSiteSettings(
  hostname: string,
  patch: SiteFeatureSettings,
): Promise<SiteFeatureSettings> {
  const current = await getSiteSettings(hostname);
  const next = { ...current, ...patch };
  await setSiteSettings(hostname, next);
  return next;
}

export async function getStylesPayload(): Promise<StylesPayload | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.styles);
  const value = result[STORAGE_KEYS.styles];
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as StylesPayload;
}

export async function setStylesPayload(styles: StylesPayload): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.styles]: styles });
}

export async function getStoredMapping(key: string): Promise<StoredMapping> {
  const result = await chrome.storage.local.get(key);
  return ensureMapping(result[key]);
}

export async function setStoredMapping(key: string, mapping: StoredMapping): Promise<void> {
  await chrome.storage.local.set({ [key]: mapping });
}

export async function getRepositoryUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.stylesRepositoryUrl);
  const repositoryUrl = result[STORAGE_KEYS.stylesRepositoryUrl];
  return typeof repositoryUrl === "string" && repositoryUrl ? repositoryUrl : DEFAULT_REPOSITORY_URL;
}

export async function setRepositoryUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.stylesRepositoryUrl]: url });
}

export async function ensureStorageDefaults(): Promise<ExtensionSnapshot> {
  const [settings, styles, stylesMapping, repositoryUrl, backgroundImageDataUrl] =
    await Promise.all([
      getGlobalSettings(),
      getStylesPayload(),
      getStoredMapping(STORAGE_KEYS.stylesMapping),
      getRepositoryUrl(),
      getBackgroundImageDataUrl(),
    ]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.stylesMapping]: stylesMapping,
    [STORAGE_KEYS.stylesRepositoryUrl]: repositoryUrl,
  });

  return {
    settings,
    styles,
    stylesMapping,
    repositoryUrl,
    backgroundImageDataUrl,
  };
}

export async function getSnapshot(): Promise<ExtensionSnapshot> {
  const snapshot = await ensureStorageDefaults();
  return {
    ...snapshot,
    settings: withDefaultSettings(snapshot.settings),
  };
}
