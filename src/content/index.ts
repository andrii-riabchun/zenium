import { isContentMessage } from "../shared/messages";
import { STORAGE_KEYS } from "../shared/constants";
import {
  getBackgroundImagePresentation,
  getBackgroundImageScaleForBlur,
  getCssColorWithOpacity,
  normalizeBackgroundImageBlurPx,
  normalizeBackgroundImageMode,
  normalizeBackgroundImageTintOpacity,
  withDefaultSettings,
} from "../shared/settings";
import { SITE_BACKGROUND_IMAGE_ENABLED_KEY, SITE_STYLING_ENABLED_KEY, type GlobalSettings } from "../shared/types";

const STYLE_ID = "zenium-page-styles";
const PAGE_BACKGROUND_STYLE_ID = "zenium-page-background";
const TOAST_ID = "zenium-toast";
const PAGE_BACKGROUND_ROOT_CLASS = "zenium-has-page-background";

function getPageBackgroundStyleElement(): HTMLStyleElement {
  let styleElement = document.getElementById(PAGE_BACKGROUND_STYLE_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = PAGE_BACKGROUND_STYLE_ID;
  }
  return styleElement;
}

function attachPageBackgroundStyleElement(): HTMLStyleElement {
  const target = document.head ?? document.documentElement;
  const styleElement = getPageBackgroundStyleElement();
  if (target.lastChild !== styleElement) {
    target.appendChild(styleElement);
  }
  return styleElement;
}

function getSiteSettingsStorageKey(): string {
  const hostname = window.location.hostname.replace(/^www\./i, "");
  return `${STORAGE_KEYS.settings}.${hostname}`;
}

async function syncPageBackgroundImage(): Promise<void> {
  const siteSettingsKey = getSiteSettingsStorageKey();
  const [globalState, imageState, siteState] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEYS.settings),
    chrome.storage.local.get(STORAGE_KEYS.backgroundImageDataUrl),
    chrome.storage.local.get(siteSettingsKey),
  ]);

  const settings = withDefaultSettings(globalState[STORAGE_KEYS.settings] as Partial<GlobalSettings> | undefined);
  const backgroundImageDataUrl = typeof imageState[STORAGE_KEYS.backgroundImageDataUrl] === "string"
    ? imageState[STORAGE_KEYS.backgroundImageDataUrl] as string
    : null;
  const siteSettings = siteState[siteSettingsKey] && typeof siteState[siteSettingsKey] === "object"
    ? siteState[siteSettingsKey] as Record<string, boolean>
    : {};

  const shouldShowBackgroundImage =
    settings.enableStyling &&
    siteSettings[SITE_STYLING_ENABLED_KEY] !== false &&
    siteSettings[SITE_BACKGROUND_IMAGE_ENABLED_KEY] !== false &&
    Boolean(backgroundImageDataUrl && settings.backgroundImageName);

  const styleElement = getPageBackgroundStyleElement();

  if (!shouldShowBackgroundImage || !backgroundImageDataUrl) {
    styleElement.textContent = "";
    document.documentElement.classList.remove(PAGE_BACKGROUND_ROOT_CLASS);
    return;
  }

  const presentation = getBackgroundImagePresentation(normalizeBackgroundImageMode(settings.backgroundImageMode));
  const blurPx = normalizeBackgroundImageBlurPx(settings.backgroundImageBlurPx);
  const tintOpacity = normalizeBackgroundImageTintOpacity(settings.backgroundImageTintOpacity);
  const tintColor = getCssColorWithOpacity(settings.backgroundColor, tintOpacity);
  const blurScale = getBackgroundImageScaleForBlur(blurPx);
  const attachedStyleElement = attachPageBackgroundStyleElement();
  document.documentElement.classList.add(PAGE_BACKGROUND_ROOT_CLASS);
  attachedStyleElement.textContent = [
    `html.${PAGE_BACKGROUND_ROOT_CLASS}::before,`,
    `html.${PAGE_BACKGROUND_ROOT_CLASS}::after {`,
    "  content: \"\" !important;",
    "  position: fixed !important;",
    "  inset: 0 !important;",
    "  pointer-events: none !important;",
    "  z-index: -2147483647 !important;",
    "}",
    `html.${PAGE_BACKGROUND_ROOT_CLASS}::before {`,
    `  background-image: url(\"${backgroundImageDataUrl}\") !important;`,
    `  background-position: ${presentation.position} !important;`,
    `  background-repeat: ${presentation.repeat} !important;`,
    `  background-size: ${presentation.size} !important;`,
    "  background-attachment: fixed !important;",
    `  filter: blur(${blurPx}px) !important;`,
    `  transform: scale(${blurScale}) !important;`,
    "  transform-origin: center center !important;",
    "}",
    `html.${PAGE_BACKGROUND_ROOT_CLASS}::after {`,
    `  background: ${tintColor} !important;`,
    "}",
  ].join("\n");
}

function getStyleElement(): HTMLStyleElement {
  let styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
  }
  return styleElement;
}

function attachStyleElement(): HTMLStyleElement {
  const target = document.head ?? document.documentElement;
  const styleElement = getStyleElement();
  if (target.lastChild !== styleElement) {
    target.appendChild(styleElement);
  }
  return styleElement;
}

function applyStyles(css: string): void {
  const styleElement = attachStyleElement();
  styleElement.textContent = css;
  void syncPageBackgroundImage();
}

function removeStyles(): void {
  const styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (styleElement) {
    styleElement.textContent = "";
  }

  const backgroundStyleElement = document.getElementById(PAGE_BACKGROUND_STYLE_ID) as HTMLStyleElement | null;
  if (backgroundStyleElement) {
    backgroundStyleElement.textContent = "";
  }

  document.documentElement.classList.remove(PAGE_BACKGROUND_ROOT_CLASS);
}

function showToast(text: string, isEnabled: boolean): void {
  document.getElementById(TOAST_ID)?.remove();

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.textContent = `${text}: ${isEnabled ? "On" : "Off"}`;

  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "2147483647",
    padding: "12px 16px",
    borderRadius: "14px",
    background: isEnabled ? "rgba(89, 135, 241, 0.95)" : "rgba(31, 41, 55, 0.92)",
    color: "#fff",
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.28)",
    backdropFilter: "blur(12px)",
    transform: "translateY(-8px)",
    opacity: "0",
    transition: "opacity 160ms ease, transform 160ms ease",
  });

  document.documentElement.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    window.setTimeout(() => toast.remove(), 180);
  }, 2200);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isContentMessage(message)) {
    return false;
  }

  if (message.type === "content/apply-styles") {
    applyStyles(message.css);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "content/remove-styles") {
    removeStyles();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "content/show-toast") {
    showToast(message.text, message.isEnabled);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

void chrome.runtime.sendMessage({
  type: "content/ready",
});
