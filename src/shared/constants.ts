import type { GlobalSettings } from "./types";

export const STORAGE_KEYS = {
  settings: "transparentZenSettings",
  styles: "styles",
  stylesMapping: "stylesMapping",
  stylesRepositoryUrl: "stylesRepositoryUrl",
} as const;

export const DEFAULT_REPOSITORY_URL =
  "https://sameerasw.github.io/my-internet/styles.json";

export const AUTO_UPDATE_ALARM = "styles-auto-update";

export const DEFAULT_SETTINGS: GlobalSettings = {
  enableStyling: true,
  autoUpdate: true,
  backgroundColor: "#08101d",
};

export const ICONS = {
  on: {
    16: "icons/icon-on-16.png",
    32: "icons/icon-on-32.png",
    48: "icons/icon-on-48.png",
    128: "icons/icon-on-128.png",
  },
  off: {
    16: "icons/icon-off-16.png",
    32: "icons/icon-off-32.png",
    48: "icons/icon-off-48.png",
    128: "icons/icon-off-128.png",
  },
} as const;
