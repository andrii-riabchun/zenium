import { useEffect, useId, useRef, useState } from "react";

import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/constants";
import { getColorSchemeForBackground, hasConfiguredBackgroundImage, normalizeHostname } from "../shared/settings";
import {
  getGlobalSettings,
  getSiteSettings,
  getSnapshot,
  setSiteSettings,
} from "../shared/storage";
import { getSiteStyleInfo, isSiteBackgroundImageEnabled, isSiteStylingEnabled } from "../shared/style-engine";
import {
  SITE_BACKGROUND_IMAGE_ENABLED_KEY,
  SITE_STYLING_ENABLED_KEY,
  type GlobalSettings,
  type RuntimeResponse,
  type SiteFeatureSettings,
  type SiteStyleInfo,
} from "../shared/types";

interface PopupState {
  hostname: string | null;
  settings: GlobalSettings | null;
  siteStyleInfo: SiteStyleInfo | null;
  siteSettings: SiteFeatureSettings;
}

type PopupStateTone = "active" | "muted" | "attention";

interface PopupStatusSummary {
  label: string;
  detail: string;
  tone: PopupStateTone;
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
    siteStyleInfo: null,
    siteSettings: {},
  });
  const [status, setStatus] = useState<string>("Loading...");
  const [expandedFeatureInfo, setExpandedFeatureInfo] = useState<string | null>(null);
  const featureListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [hostname, settings, snapshot] = await Promise.all([
        getActiveHostname(),
        getGlobalSettings(),
        getSnapshot(),
      ]);

      const siteSettings = hostname ? await getSiteSettings(hostname) : {};
      const siteStyleInfo = hostname ? getSiteStyleInfo(hostname, snapshot) : null;

      if (!cancelled) {
        setState({ hostname, settings, siteStyleInfo, siteSettings });
        setStatus("");
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

  useEffect(() => {
    const backgroundColor = state.settings?.backgroundColor ?? DEFAULT_SETTINGS.backgroundColor;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--popup-background-color", backgroundColor);
    rootStyle.colorScheme = getColorSchemeForBackground(backgroundColor);
  }, [state.settings?.backgroundColor]);

  async function updateSettings(patch: Partial<GlobalSettings>): Promise<void> {
    if (!state.settings) {
      return;
    }

    const next = { ...state.settings, ...patch };
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({ ...current, settings: next }));
  }

  async function toggleWebsiteStyling(checked: boolean): Promise<void> {
    if (!state.hostname) {
      return;
    }

    const nextSiteSettings = {
      ...state.siteSettings,
      [SITE_STYLING_ENABLED_KEY]: checked,
    };

    await setSiteSettings(state.hostname, nextSiteSettings);
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({
      ...current,
      siteSettings: nextSiteSettings,
    }));
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
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({
      ...current,
      siteSettings: nextSiteSettings,
    }));
  }

  async function toggleSiteBackgroundImage(checked: boolean): Promise<void> {
    if (!state.hostname) {
      return;
    }

    const nextSiteSettings = {
      ...state.siteSettings,
      [SITE_BACKGROUND_IMAGE_ENABLED_KEY]: checked,
    };

    await setSiteSettings(state.hostname, nextSiteSettings);
    await sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => ({
      ...current,
      siteSettings: nextSiteSettings,
    }));
  }

  function openOptions(): void {
    void chrome.runtime.openOptionsPage();
  }

  const websiteStylingEnabled = isSiteStylingEnabled(state.siteSettings);
  const backgroundImageAvailable = hasConfiguredBackgroundImage(state.settings);
  const siteBackgroundImageEnabled = isSiteBackgroundImageEnabled(state.siteSettings);
  const summary = getPopupStatusSummary(state, websiteStylingEnabled);
  const matchedStyle = state.siteStyleInfo?.styleKey ?? null;
  const featureControlsDisabled = !state.hostname || !state.settings?.enableStyling || !websiteStylingEnabled;
  return (
    <main className="popup-root">
      <header className="hero">
        <div className="hero-topline">
          <p className="eyebrow">Zenium</p>
          <span className={`state-badge ${summary.tone}`} title={summary.detail}>
            {summary.label}
          </span>
        </div>
        <Toggle
          label="Global styling"
          detail="Master switch across all supported websites."
          checked={state.settings?.enableStyling ?? false}
          disabled={!state.settings}
          onChange={(checked) => void updateSettings({ enableStyling: checked })}
        />
      </header>
        <section className="module feature-module">
          <span className="section-kicker">Current website</span>
          <h1 className="hero-title">{state.hostname ?? "Unsupported page"}</h1>

          <Toggle
            label="Website styling"
            detail="Pause or resume Zenium for this website only."
            checked={websiteStylingEnabled}
            disabled={!state.hostname}
            onChange={(checked) => void toggleWebsiteStyling(checked)}
          />
          <Toggle
            label="Background image"
            detail={backgroundImageAvailable ? "Use the global fallback image on this website only." : "Upload a fallback image in full settings first."}
            checked={siteBackgroundImageEnabled}
            disabled={!state.hostname || !backgroundImageAvailable}
            onChange={(checked) => void toggleSiteBackgroundImage(checked)}
          />
          {matchedStyle ? (
            state.siteStyleInfo?.features.length ? (
              <div className="toggle-list" ref={featureListRef}>
                {state.siteStyleInfo.features.map((feature) => (
                  <Toggle
                    key={feature.name}
                    label={feature.name}
                    checked={state.siteSettings[feature.name] !== false}
                    disabled={featureControlsDisabled}
                    compact
                    infoExpanded={expandedFeatureInfo === feature.name}
                    onInfoToggle={() => setExpandedFeatureInfo((current) => (current === feature.name ? null : feature.name))}
                    onChange={(checked) => void toggleFeature(feature.name, checked)}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-copy">This style currently ships as one complete treatment without individual feature switches.</p>
            )
          ) : null }
        </section>

      <footer className="popup-footer">
        <div className="status-line">{status}</div>
        <button className="ghost-button" onClick={openOptions}>
          Open full settings
        </button>
      </footer>
    </main>
  );
}

function getPopupStatusSummary(state: PopupState, websiteStylingEnabled: boolean): PopupStatusSummary {
  if (!state.hostname) {
    return {
      label: "Unsupported page",
      detail: "Open a standard website tab to inspect Zenium for the current page.",
      tone: "muted",
    };
  }

  if (!state.settings?.enableStyling) {
    return {
      label: "Global off",
      detail: "Zenium is paused everywhere until Global styling is turned back on.",
      tone: "muted",
    };
  }

  if (!state.siteStyleInfo?.styleKey) {
    return {
      label: "No style",
      detail: "This website does not currently match a repository style.",
      tone: "attention",
    };
  }

  if (!websiteStylingEnabled) {
    return {
      label: "Site off",
      detail: "A style is available, but Zenium is paused for this website.",
      tone: "muted",
    };
  }

  return {
    label: "Active",
    detail: "Zenium is applying the matched style to this website.",
    tone: "active",
  };
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
  compact?: boolean;
  infoExpanded?: boolean;
  onInfoToggle?: () => void;
  onChange: (checked: boolean) => void;
}

function Toggle({
  label,
  detail,
  checked,
  disabled,
  compact,
  infoExpanded,
  onInfoToggle,
  onChange,
}: ToggleProps) {
  const inputId = useId();
  const formatted = formatFeatureLabel(label);
  const secondary = detail;
  const hasInfo = compact && Boolean(formatted.caption);
  const expandedInfo = hasInfo && infoExpanded ? formatted.caption : null;

  return (
    <div className={`toggle ${compact ? "compact" : ""} ${disabled ? "disabled" : ""} ${expandedInfo ? "expanded" : ""}`}>
      <div className="toggle-row">
        <div className="toggle-content">
          <label className="toggle-copy" htmlFor={inputId}>
            <span className={formatted.caption ? "toggle-title has-tooltip" : "toggle-title"}>{formatted.title}</span>
            {secondary ? <small className="toggle-detail">{secondary}</small> : null}
          </label>
          {hasInfo ? (
            <button
              type="button"
              className={`toggle-info ${expandedInfo ? "expanded" : ""}`}
              aria-label={expandedInfo ? `Hide details for ${formatted.title}` : `Show details for ${formatted.title}`}
              aria-expanded={Boolean(expandedInfo)}
              onClick={onInfoToggle}
            >
              i
            </button>
          ) : null}
        </div>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label className="switch-hit" htmlFor={inputId} aria-hidden="true">
          <span className="switch" />
        </label>
      </div>
      {expandedInfo ? <p className="toggle-note">{expandedInfo}</p> : null}
    </div>
  );
}
