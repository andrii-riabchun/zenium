import { STORAGE_KEYS } from "./constants";
import { normalizeSitePattern } from "./settings";
import { getRepositoryUrl, patchGlobalSettings, setStoredMapping, setStylesPayload } from "./storage";
import type { StylesPayload } from "./types";

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
          Array.isArray(value)
            ? [...new Set(value.filter((entry): entry is string => typeof entry === "string").map(normalizeSitePattern))].sort()
            : [],
        ]),
      )
    : undefined;

  return { website, mapping };
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

  await Promise.all([
    setStylesPayload(styles),
    setStoredMapping(STORAGE_KEYS.stylesMapping, { mapping: styles.mapping ?? {} }),
    patchGlobalSettings({ lastFetchedTime: Date.now() }),
  ]);

  return styles;
}
