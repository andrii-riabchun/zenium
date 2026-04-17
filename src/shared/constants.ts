import type { GlobalSettings } from "./types";

export const STORAGE_KEYS = {
  settings: "transparentZenSettings",
  settingsMeta: "transparentZenSettingsMeta",
  skipThemingList: "skipThemingList",
  skipForceThemingList: "skipForceThemingList",
  fallbackBackgroundList: "fallbackBackgroundList",
  styles: "styles",
  stylesMapping: "stylesMapping",
  userStylesMapping: "userStylesMapping",
  stylesRepositoryUrl: "stylesRepositoryUrl",
  liveChatPosition: "liveChatPosition",
  liveChatOpacity: "liveChatOpacity",
} as const;

export const CHROME_COMPAT_MIGRATION_VERSION = 1;

export const DEFAULT_REPOSITORY_URL =
  "https://sameerasw.github.io/my-internet/styles.json";

export const AUTO_UPDATE_ALARM = "styles-auto-update";

export const DEFAULT_SETTINGS: GlobalSettings = {
  enableStyling: true,
  autoUpdate: true,
  forceStyling: false,
  whitelistMode: false,
  whitelistStyleMode: false,
  disableTransparency: false,
  disableHover: false,
  disableFooter: false,
  disableDarkReader: false,
  enableLogs: false,
  welcomeShown: false,
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
