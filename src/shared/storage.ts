import {
  DEFAULT_REPOSITORY_URL,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
} from "./constants";
import { normalizeHostname, withDefaultSettings } from "./settings";
import type {
  ExtensionSnapshot,
  GlobalSettings,
  SiteFeatureMetadataMap,
  SiteFeatureSettings,
  StoredMapping,
  StylesPayload,
} from "./types";

function ensureMapping(value: unknown): StoredMapping {
  if (!value || typeof value !== "object" || !("mapping" in value)) {
    return { mapping: {} };
  }

  const mapping = (value as StoredMapping).mapping;
  return { mapping: mapping ?? {} };
}

export function getSiteStorageKey(hostname: string): string {
  return `${STORAGE_KEYS.settings}.${normalizeHostname(hostname)}`;
}

export function getSiteMetadataStorageKey(hostname: string): string {
  return `${STORAGE_KEYS.settingsMeta}.${normalizeHostname(hostname)}`;
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return withDefaultSettings(result[STORAGE_KEYS.settings] as Partial<GlobalSettings> | undefined);
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

export async function getStringList(key: string): Promise<string[]> {
  const result = await chrome.storage.local.get(key);
  const list = result[key];
  return Array.isArray(list) ? list : [];
}

export async function setStringList(key: string, value: string[]): Promise<void> {
  await chrome.storage.local.set({ [key]: [...new Set(value.map(normalizeHostname))].sort() });
}

export async function toggleHostnameInList(key: string, hostname: string): Promise<string[]> {
  const normalized = normalizeHostname(hostname);
  const current = await getStringList(key);
  const exists = current.includes(normalized);
  const next = exists
    ? current.filter((entry) => entry !== normalized)
    : [...current, normalized];
  await setStringList(key, next);
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

export async function getSiteFeatureMetadata(hostname: string): Promise<SiteFeatureMetadataMap> {
  const key = getSiteMetadataStorageKey(hostname);
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return value && typeof value === "object" ? (value as SiteFeatureMetadataMap) : {};
}

export async function setSiteFeatureMetadata(
  hostname: string,
  metadata: SiteFeatureMetadataMap,
): Promise<void> {
  const key = getSiteMetadataStorageKey(hostname);
  await chrome.storage.local.set({ [key]: metadata });
}

export async function patchSiteFeatureMetadata(
  hostname: string,
  patch: SiteFeatureMetadataMap,
): Promise<SiteFeatureMetadataMap> {
  const current = await getSiteFeatureMetadata(hostname);
  const next = { ...current, ...patch };
  await setSiteFeatureMetadata(hostname, next);
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

export async function addUserStyleMapping(sourceStyle: string, targetSite: string): Promise<StoredMapping> {
  const current = await getStoredMapping(STORAGE_KEYS.userStylesMapping);
  const normalizedTarget = normalizeHostname(targetSite);
  const nextTargets = new Set(current.mapping[sourceStyle] ?? []);
  nextTargets.add(normalizedTarget);

  const next: StoredMapping = {
    mapping: {
      ...current.mapping,
      [sourceStyle]: [...nextTargets].sort(),
    },
  };

  await setStoredMapping(STORAGE_KEYS.userStylesMapping, next);
  return next;
}

export async function removeUserStyleMapping(sourceStyle: string, targetSite: string): Promise<StoredMapping> {
  const current = await getStoredMapping(STORAGE_KEYS.userStylesMapping);
  const normalizedTarget = normalizeHostname(targetSite);
  const nextTargets = (current.mapping[sourceStyle] ?? []).filter((entry) => entry !== normalizedTarget);
  const nextMapping = { ...current.mapping };

  if (nextTargets.length === 0) {
    delete nextMapping[sourceStyle];
  } else {
    nextMapping[sourceStyle] = nextTargets;
  }

  const next: StoredMapping = { mapping: nextMapping };
  await setStoredMapping(STORAGE_KEYS.userStylesMapping, next);
  return next;
}

export async function getRepositoryUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.stylesRepositoryUrl);
  return result[STORAGE_KEYS.stylesRepositoryUrl] || DEFAULT_REPOSITORY_URL;
}

export async function setRepositoryUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.stylesRepositoryUrl]: url });
}

export async function ensureStorageDefaults(): Promise<ExtensionSnapshot> {
  const [settings, skipThemingList, skipForceThemingList, fallbackBackgroundList, styles, stylesMapping, userStylesMapping, repositoryUrl] =
    await Promise.all([
      getGlobalSettings(),
      getStringList(STORAGE_KEYS.skipThemingList),
      getStringList(STORAGE_KEYS.skipForceThemingList),
      getStringList(STORAGE_KEYS.fallbackBackgroundList),
      getStylesPayload(),
      getStoredMapping(STORAGE_KEYS.stylesMapping),
      getStoredMapping(STORAGE_KEYS.userStylesMapping),
      getRepositoryUrl(),
    ]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.skipThemingList]: skipThemingList,
    [STORAGE_KEYS.skipForceThemingList]: skipForceThemingList,
    [STORAGE_KEYS.fallbackBackgroundList]: fallbackBackgroundList,
    [STORAGE_KEYS.stylesMapping]: stylesMapping,
    [STORAGE_KEYS.userStylesMapping]: userStylesMapping,
    [STORAGE_KEYS.stylesRepositoryUrl]: repositoryUrl,
  });

  return {
    settings,
    skipThemingList,
    skipForceThemingList,
    fallbackBackgroundList,
    styles,
    stylesMapping,
    userStylesMapping,
    repositoryUrl,
  };
}

export async function getSnapshot(): Promise<ExtensionSnapshot> {
  const snapshot = await ensureStorageDefaults();
  return {
    ...snapshot,
    settings: withDefaultSettings(snapshot.settings),
  };
}

export async function resetToDefaults(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.skipThemingList]: [],
    [STORAGE_KEYS.skipForceThemingList]: [],
    [STORAGE_KEYS.fallbackBackgroundList]: [],
    [STORAGE_KEYS.stylesMapping]: { mapping: {} },
    [STORAGE_KEYS.userStylesMapping]: { mapping: {} },
    [STORAGE_KEYS.stylesRepositoryUrl]: DEFAULT_REPOSITORY_URL,
  });
}
