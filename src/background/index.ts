import { AUTO_UPDATE_ALARM, ICONS, STORAGE_KEYS } from "../shared/constants";
import { isRuntimeRequest } from "../shared/messages";
import { refreshStylesFromRepository } from "../shared/repo";
import { isHttpUrl, normalizeHostname } from "../shared/settings";
import { ensureStorageDefaults, getGlobalSettings, getSiteSettings, getSnapshot, patchGlobalSettings } from "../shared/storage";
import { buildCssForHostname } from "../shared/style-engine";
import type { ContentMessage, RuntimeResponse } from "../shared/types";

const iconStateByTab = new Map<number, boolean>();

async function sendContentMessage(tabId: number, message: ContentMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Ignore tabs without a ready content script.
  }
}

async function getTabUrl(tabId: number): Promise<string | undefined> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url;
  } catch {
    return undefined;
  }
}

async function setTabIcon(tabId: number, enabled: boolean): Promise<void> {
  if (iconStateByTab.get(tabId) === enabled) {
    return;
  }

  await chrome.action.setIcon({
    tabId,
    path: enabled ? ICONS.on : ICONS.off,
  });

  iconStateByTab.set(tabId, enabled);
}

async function updateTabStyling(tabId: number, url?: string): Promise<void> {
  const nextUrl = url ?? (await getTabUrl(tabId));
  if (!isHttpUrl(nextUrl)) {
    await setTabIcon(tabId, false);
    return;
  }

  const safeUrl = nextUrl;
  const hostname = normalizeHostname(new URL(safeUrl).hostname);
  const snapshot = await getSnapshot();
  const siteSettings = await getSiteSettings(hostname);
  const css = buildCssForHostname(hostname, snapshot, siteSettings);

  if (css) {
    await sendContentMessage(tabId, { type: "content/apply-styles", css });
    await setTabIcon(tabId, true);
    return;
  }

  await sendContentMessage(tabId, { type: "content/remove-styles" });
  await setTabIcon(tabId, false);
}

async function refreshAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => typeof tab.id === "number" && typeof tab.url === "string" && isHttpUrl(tab.url))
      .map((tab) => updateTabStyling(tab.id, tab.url)),
  );
}

async function getActiveHttpTab(): Promise<(chrome.tabs.Tab & { id: number; url: string }) | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number" || !isHttpUrl(tab.url)) {
    return null;
  }
  return tab as chrome.tabs.Tab & { id: number; url: string };
}

async function syncAutoUpdateAlarm(): Promise<void> {
  const settings = await getGlobalSettings();
  if (settings.autoUpdate) {
    await chrome.alarms.create(AUTO_UPDATE_ALARM, { periodInMinutes: 120 });
    return;
  }

  await chrome.alarms.clear(AUTO_UPDATE_ALARM);
}

async function handleRefetch(): Promise<void> {
  await refreshStylesFromRepository();
  await refreshAllTabs();
}

async function initialize(): Promise<void> {
  const snapshot = await ensureStorageDefaults();

  if (!snapshot.styles) {
    try {
      await refreshStylesFromRepository();
    } catch (error) {
      console.warn("Failed to bootstrap styles", error);
    }
  }

  await syncAutoUpdateAlarm();
  await refreshAllTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRuntimeRequest(message)) {
    return false;
  }

  const respond = (response: RuntimeResponse) => sendResponse(response);

  void (async () => {
    try {
      if (message.type === "content/ready") {
        if (sender.tab?.id && sender.tab.url) {
          await updateTabStyling(sender.tab.id, sender.tab.url);
        }
        respond({ ok: true });
        return;
      }

      if (message.type === "worker/refetch-styles") {
        await handleRefetch();
        respond({ ok: true, stylesUpdated: true });
        return;
      }

      if (message.type === "worker/refresh-active-tab") {
        const tab = await getActiveHttpTab();
        if (tab) {
          await updateTabStyling(tab.id, tab.url);
        }
        respond({ ok: true });
        return;
      }

      if (message.type === "worker/update-auto-update") {
        await patchGlobalSettings({ autoUpdate: message.enabled });
        await syncAutoUpdateAlarm();
        respond({ ok: true });
        return;
      }
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "Unknown error";
      respond({ ok: false, error: nextError });
    }
  })();

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_UPDATE_ALARM) {
    return;
  }

  void handleRefetch();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isHttpUrl(tab.url)) {
    void updateTabStyling(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void updateTabStyling(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  iconStateByTab.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    void updateTabStyling(details.tabId, details.url);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  const shouldRefresh =
    STORAGE_KEYS.settings in changes ||
    STORAGE_KEYS.styles in changes ||
    STORAGE_KEYS.stylesMapping in changes ||
    Object.keys(changes).some((key) => key.startsWith(`${STORAGE_KEYS.settings}.`));

  if (shouldRefresh) {
    void refreshAllTabs();
  }
});

void initialize();
