import { useEffect, useMemo, useState } from "react";

import { STORAGE_KEYS } from "../shared/constants";
import { normalizeHostname } from "../shared/settings";
import {
  getGlobalSettings,
  getSiteFeatureMetadata,
  getSiteSettings,
  getSnapshot,
  patchSiteFeatureMetadata,
  getStringList,
  setSiteSettings,
  toggleHostnameInList,
} from "../shared/storage";
import { getSiteStyleInfo, withFeatureMetadata } from "../shared/style-engine";
import type {
  GlobalSettings,
  RuntimeResponse,
  SiteFeatureMetadataMap,
  SiteFeatureSettings,
  SiteStyleInfo,
} from "../shared/types";

interface PopupState {
  hostname: string | null;
  settings: GlobalSettings | null;
  skipThemingList: string[];
  siteStyleInfo: SiteStyleInfo | null;
  siteSettings: SiteFeatureSettings;
  siteFeatureMetadata: SiteFeatureMetadataMap;
}

async function sendMessage<T extends object>(message: T): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}

async function getActiveHostname(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    return null;
  }
  return normalizeHostname(new URL(tab.url).hostname);
}

export function App() {
  const [state, setState] = useState<PopupState>({
    hostname: null,
    settings: null,
    skipThemingList: [],
    siteStyleInfo: null,
    siteSettings: {},
    siteFeatureMetadata: {},
  });
  const [status, setStatus] = useState<string>("Loading...");
  const [isRefetching, setIsRefetching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [hostname, settings, skipThemingList, snapshot] = await Promise.all([
        getActiveHostname(),
        getGlobalSettings(),
        getStringList(STORAGE_KEYS.skipThemingList),
        getSnapshot(),
      ]);

      const [siteSettings, siteFeatureMetadata] = hostname
        ? await Promise.all([getSiteSettings(hostname), getSiteFeatureMetadata(hostname)])
        : [{}, {}];
      const siteStyleInfo = hostname
        ? withFeatureMetadata(getSiteStyleInfo(hostname, snapshot), siteFeatureMetadata)
        : null;

      if (!cancelled) {
        setState({ hostname, settings, skipThemingList, siteStyleInfo, siteSettings, siteFeatureMetadata });
        setStatus(hostname ? "Ready" : "Open any website to use controls.");
      }
    }

    void load();

    const listener = () => {
      void load();
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const siteStylingEnabled = useMemo(() => {
    if (!state.hostname || !state.settings) {
      return false;
    }

    const listed = state.skipThemingList.includes(state.hostname);
    return state.settings.whitelistStyleMode ? listed : !listed;
  }, [state.hostname, state.settings, state.skipThemingList]);

  async function updateSettings(patch: Partial<GlobalSettings>): Promise<void> {
    if (!state.settings) {
      return;
    }

    const next = { ...state.settings, ...patch };
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
    if (patch.autoUpdate !== undefined) {
      await sendMessage({ type: "worker/update-auto-update", enabled: patch.autoUpdate });
    }
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({ ...current, settings: next }));
  }

  async function toggleSiteStyling(): Promise<void> {
    if (!state.hostname) {
      return;
    }

    const nextList = await toggleHostnameInList(STORAGE_KEYS.skipThemingList, state.hostname);
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({ ...current, skipThemingList: nextList }));
  }

  async function toggleFeature(featureName: string, checked: boolean): Promise<void> {
    if (!state.hostname) {
      return;
    }

    const nextSiteSettings = {
      ...state.siteSettings,
      [featureName]: checked,
    };

    await setSiteSettings(state.hostname, nextSiteSettings);
    const nextSiteFeatureMetadata = await patchSiteFeatureMetadata(state.hostname, {
      [featureName]: {
        touched: true,
        autoDisabledForChrome: false,
      },
    });
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({
      ...current,
      siteSettings: nextSiteSettings,
      siteFeatureMetadata: nextSiteFeatureMetadata,
      siteStyleInfo: current.siteStyleInfo
        ? withFeatureMetadata(current.siteStyleInfo, nextSiteFeatureMetadata)
        : current.siteStyleInfo,
    }));
  }

  async function refetchStyles(): Promise<void> {
    setIsRefetching(true);
    setStatus("Fetching latest styles...");
    const response = await sendMessage({ type: "worker/refetch-styles" });
    setIsRefetching(false);
    setStatus(response.ok ? "Styles updated." : response.error);
  }

  function openOptions(): void {
    void chrome.runtime.openOptionsPage();
  }

  return (
    <main className="popup-root">
      <header className="hero">
        <p className="eyebrow">Zenium</p>
        <h1>Chrome Reimplementation</h1>
        <p className="subtitle">Typed MV3 core, fresh architecture, original untouched.</p>
      </header>

      <section className="panel">
        <div className="row stack">
          <span className="label">Current site</span>
          <strong className="hostname">{state.hostname ?? "No supported page"}</strong>
        </div>
      </section>

      <section className="panel toggles">
        <Toggle
          label="Global styling"
          checked={state.settings?.enableStyling ?? false}
          disabled={!state.settings}
          onChange={(checked) => void updateSettings({ enableStyling: checked })}
        />
        <Toggle
          label={state.settings?.whitelistStyleMode ? "Enable styling on this site" : "Disable styling on this site"}
          checked={siteStylingEnabled}
          disabled={!state.hostname || !state.settings}
          onChange={() => void toggleSiteStyling()}
        />
        <Toggle
          label="Force styling"
          checked={state.settings?.forceStyling ?? false}
          disabled={!state.settings}
          onChange={(checked) => void updateSettings({ forceStyling: checked })}
        />
        <Toggle
          label="Auto update"
          checked={state.settings?.autoUpdate ?? false}
          disabled={!state.settings}
          onChange={(checked) => void updateSettings({ autoUpdate: checked })}
        />
      </section>

      {state.siteStyleInfo?.features.length ? (
        <section className="panel toggles">
          <div className="row stack">
            <span className="label">Matched style</span>
            <strong className="hostname">{state.siteStyleInfo.styleKey}</strong>
          </div>
          {state.siteStyleInfo.features.map((feature) => (
            <Toggle
              key={feature.name}
              label={feature.name}
              detail={feature.autoDisabledForChrome ? "With limited support" : undefined}
              checked={state.siteSettings[feature.name] !== false}
              disabled={!state.hostname}
              onChange={(checked) => void toggleFeature(feature.name, checked)}
            />
          ))}
        </section>
      ) : null}

      <section className="actions">
        <button className="primary" disabled={isRefetching} onClick={() => void refetchStyles()}>
          {isRefetching ? "Fetching..." : "Refetch styles"}
        </button>
        <button className="secondary" onClick={openOptions}>
          Advanced settings
        </button>
      </section>

      <footer className="status">{status}</footer>
    </main>
  );
}

function formatFeatureLabel(featureName: string): { title: string; caption?: string } {
  let title = featureName.includes("-") ? featureName.split("-").slice(1).join("-").trim() : featureName.trim();
  let caption: string | undefined;

  if (title.includes("$")) {
    const parts = title.split("$");
    title = parts[0].trim();
    caption = parts.slice(1).join("$").trim() || undefined;
  }

  return { title, caption };
}

interface ToggleProps {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, detail, checked, disabled, onChange }: ToggleProps) {
  const formatted = formatFeatureLabel(label);
  const secondary = [detail, formatted.caption].filter(Boolean).join(" · ");

  return (
    <label className={`toggle ${disabled ? "disabled" : ""}`}>
      <span title={formatted.caption}>
        <span className={formatted.caption ? "toggle-title has-tooltip" : "toggle-title"}>{formatted.title}</span>
        {secondary ? <small className="toggle-detail">{secondary}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
