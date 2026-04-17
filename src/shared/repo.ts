import { STORAGE_KEYS } from "./constants";
import { getRepositoryUrl, getStoredMapping, patchGlobalSettings, setStoredMapping, setStylesPayload } from "./storage";
import type { StoredMapping, StylesPayload } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeStylesPayload(payload: unknown): StylesPayload {
  if (!isRecord(payload)) {
    throw new Error("Styles payload is not an object");
  }

  const website = isRecord(payload.website)
    ? (payload.website as Record<string, Record<string, string>>)
    : {};
  const mapping = isRecord(payload.mapping)
    ? Object.fromEntries(
        Object.entries(payload.mapping).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [],
        ]),
      )
    : undefined;

  return { website, mapping };
}

function getNextStoredMapping(styles: StylesPayload, existing: StoredMapping): StoredMapping {
  if (styles.mapping && Object.keys(styles.mapping).length > 0) {
    return { mapping: styles.mapping };
  }

  return existing;
}

export async function refreshStylesFromRepository(): Promise<StylesPayload> {
  const repositoryUrl = await getRepositoryUrl();
  const response = await fetch(repositoryUrl, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch styles: ${response.status}`);
  }

  const styles = sanitizeStylesPayload(await response.json());
  const existingMapping = await getStoredMapping(STORAGE_KEYS.stylesMapping);
  const nextMapping = getNextStoredMapping(styles, existingMapping);

  await Promise.all([
    setStylesPayload(styles),
    setStoredMapping(STORAGE_KEYS.stylesMapping, nextMapping),
    patchGlobalSettings({ lastFetchedTime: Date.now() }),
  ]);

  return styles;
}
