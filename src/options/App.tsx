import { useEffect, useState } from "react";

import { DEFAULT_REPOSITORY_URL, DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/constants";
import {
  getGlobalSettings,
  getRepositoryUrl,
  setRepositoryUrl,
} from "../shared/storage";
import { getColorSchemeForBackground } from "../shared/settings";
import type { GlobalSettings } from "../shared/types";

interface OptionsState {
  settings: GlobalSettings;
  repositoryUrl: string;
}

type OptionsNoticeTone = "neutral" | "positive" | "warning";

interface OptionsNotice {
  message: string;
  tone: OptionsNoticeTone;
}

async function loadState(): Promise<OptionsState> {
  const [settings, repositoryUrl] = await Promise.all([getGlobalSettings(), getRepositoryUrl()]);

  return {
    settings,
    repositoryUrl,
  };
}

function formatLastFetchedTime(timestamp?: number): string {
  return typeof timestamp === "number" ? new Date(timestamp).toLocaleString() : "Never";
}

export function App() {
  const [state, setState] = useState<OptionsState | null>(null);
  const [status, setStatus] = useState<OptionsNotice | null>({
    message: "Loading settings...",
    tone: "neutral",
  });
  const [isRefetching, setIsRefetching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadState().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
        setStatus(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const backgroundColor = state?.settings.backgroundColor ?? DEFAULT_SETTINGS.backgroundColor;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--options-background-color", backgroundColor);
    rootStyle.colorScheme = getColorSchemeForBackground(backgroundColor);
  }, [state?.settings.backgroundColor]);

  async function saveRepositoryUrl(): Promise<void> {
    if (!state) {
      return;
    }

    await setRepositoryUrl(state.repositoryUrl.trim() || DEFAULT_REPOSITORY_URL);
    setStatus({ message: "Repository source saved.", tone: "positive" });
  }

  async function saveBackgroundColor(): Promise<void> {
    if (!state) {
      return;
    }

    const settings = {
      ...state.settings,
      backgroundColor: state.settings.backgroundColor,
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
    await chrome.runtime.sendMessage({ type: "worker/refresh-active-tab" });
    setStatus({ message: "Background color saved.", tone: "positive" });
  }

  async function updateSettings(patch: Partial<GlobalSettings>, statusText: string): Promise<void> {
    if (!state) {
      return;
    }

    const settings = {
      ...state.settings,
      ...patch,
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });

    if (patch.autoUpdate !== undefined) {
      await chrome.runtime.sendMessage({ type: "worker/update-auto-update", enabled: patch.autoUpdate });
    }

    await chrome.runtime.sendMessage({ type: "worker/refresh-active-tab" });
    setState((current) => (current ? { ...current, settings } : current));
    setStatus({ message: statusText, tone: "positive" });
  }

  async function resetRepository(): Promise<void> {
    await setRepositoryUrl(DEFAULT_REPOSITORY_URL);
    setState((current) => (current ? { ...current, repositoryUrl: DEFAULT_REPOSITORY_URL } : current));
    setStatus({ message: "Repository source reset to default.", tone: "neutral" });
  }

  async function refetchStyles(): Promise<void> {
    setIsRefetching(true);
    setStatus({ message: "Refreshing styles from the repository...", tone: "neutral" });
    const response = await chrome.runtime.sendMessage({ type: "worker/refetch-styles" });
    setIsRefetching(false);

    if (response.ok) {
      const nextState = await loadState();
      setState(nextState);
      setStatus({ message: "Styles refreshed from the repository.", tone: "positive" });
      return;
    }

    setStatus({ message: response.error, tone: "warning" });
  }

  if (!state) {
    return <main className="options-root">Loading...</main>;
  }

  const lastFetchedTime = formatLastFetchedTime(state.settings.lastFetchedTime);
  const repositorySource = state.repositoryUrl.trim() || DEFAULT_REPOSITORY_URL;

  return (
    <main className="options-root">
      <header className="header">
        <div className="header-copy">
          <p className="eyebrow">Zenium</p>
          <h1>Settings</h1>
          <p className="subtitle">Global behavior and source controls for the browsing layer running behind the popup.</p>
        </div>
        { status ? (
          <div className="header-status">
            <span className="status-label">System notice</span>
            <p className={`status ${status.tone}`}>{status.message}</p>
          </div>
        ) : null }

      </header>

      <section className="options-layout">
        <section className="options-section emphasis">
          <div className="section-intro">
            <p className="section-kicker">Behavior</p>
            <h2>How Zenium behaves across sites</h2>
            <p>Keep the extension running globally, and decide whether repository updates should happen on a schedule.</p>
          </div>
          <div className="option-list">
            <SettingRow
              title="Global styling"
              detail="Master switch for styling on every supported website."
              checked={state.settings.enableStyling}
              onChange={(checked) => void updateSettings({ enableStyling: checked }, "Global styling saved.")}
            />
            <SettingRow
              title="Auto update"
              detail="Fetch the repository every two hours so new mappings and styles land automatically."
              checked={state.settings.autoUpdate}
              onChange={(checked) => void updateSettings({ autoUpdate: checked }, "Auto update saved.")}
            />
          </div>
        </section>

        <section className="options-section palette-section">
          <div className="section-intro compact">
            <p className="section-kicker">Appearance</p>
            <h2>Fallback background</h2>
            <p>Transparent shells in imported styles are rewritten to this solid background before injection.</p>
          </div>
          <div className="palette-panel">
            <div className="color-preview" style={{ ["--preview-color" as string]: state.settings.backgroundColor }}>
              <span>Canvas</span>
              <strong>{state.settings.backgroundColor}</strong>
            </div>
            <div className="palette-controls">
              <input
                type="color"
                value={state.settings.backgroundColor}
                aria-label="Background color"
                onChange={(event) => setState({ ...state, settings: { ...state.settings, backgroundColor: event.target.value } })}
              />
              <button onClick={() => void saveBackgroundColor()}>Save background</button>
            </div>
          </div>
        </section>

        <section className="options-section source-section">
          <div className="section-intro">
            <p className="section-kicker">Source</p>
            <h2>Repository and manual refresh</h2>
            <p>Use this when you want to inspect or override where Zenium pulls styles from.</p>
          </div>

          <div className="source-grid">
            <label className="source-field">
              <span>Repository URL</span>
              <input
                value={state.repositoryUrl}
                onChange={(event) => setState({ ...state, repositoryUrl: event.target.value })}
                placeholder={DEFAULT_REPOSITORY_URL}
              />
            </label>
            <div className="source-actions">
              <button onClick={() => void saveRepositoryUrl()}>Save source</button>
              <button className="secondary" onClick={() => void resetRepository()}>
                Use default
              </button>
            </div>
          </div>

          <div className="sync-strip">
            <div>
              <span className="status-label">Active source</span>
              <p className="source-value">{repositorySource}</p>
            </div>
            <div>
              <span className="status-label">Last refresh</span>
              <p className="source-value">{lastFetchedTime}</p>
            </div>
            <button onClick={() => void refetchStyles()} disabled={isRefetching}>
              {isRefetching ? "Refreshing..." : "Refetch styles"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

interface SettingRowProps {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SettingRow({ title, detail, checked, onChange }: SettingRowProps) {
  return (
    <label className="setting-row">
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
