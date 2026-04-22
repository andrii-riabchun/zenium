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
  forceStyling: false,
  backgroundColor: "#08101d",
};

export const ICONS = {
  on: {
    48: "icons/logo_48.png",
    96: "icons/logo_96.png",
  },
  off: {
    48: "icons/logo-off_48.png",
    96: "icons/logo-off_96.png",
  },
} as const;
