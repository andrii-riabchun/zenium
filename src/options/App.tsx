import { useEffect, useState } from "react";

import { DEFAULT_REPOSITORY_URL, STORAGE_KEYS } from "../shared/constants";
import {
  getGlobalSettings,
  getRepositoryUrl,
  setRepositoryUrl,
} from "../shared/storage";
import type { GlobalSettings } from "../shared/types";

interface OptionsState {
  settings: GlobalSettings;
  repositoryUrl: string;
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
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    let cancelled = false;

    void loadState().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
        setStatus("Ready");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveRepositoryUrl(): Promise<void> {
    if (!state) {
      return;
    }

    await setRepositoryUrl(state.repositoryUrl.trim() || DEFAULT_REPOSITORY_URL);
    setStatus("Repository URL saved.");
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
    setStatus("Background color saved.");
  }

  async function resetRepository(): Promise<void> {
    await setRepositoryUrl(DEFAULT_REPOSITORY_URL);
    setState((current) => (current ? { ...current, repositoryUrl: DEFAULT_REPOSITORY_URL } : current));
    setStatus("Repository URL reset.");
  }

  if (!state) {
    return <main className="options-root">Loading...</main>;
  }

  return (
    <main className="options-root" style={{ ["--options-background-color" as string]: state.settings.backgroundColor }}>
      <header className="header">
        <div>
          <p className="eyebrow">Zenium</p>
          <h1>Settings</h1>
          <p className="subtitle">Cleaner, content-focused website styling for Chrome, inspired by Zen Internet.</p>
        </div>
        <p className="status">{status}</p>
      </header>

      <section className="card">
        <h2>Background</h2>
        <p className="muted">Transparent site backgrounds are replaced with this solid color in Chrome.</p>
        <div className="actions row wrap">
          <input
            type="color"
            value={state.settings.backgroundColor}
            onChange={(event) => setState({ ...state, settings: { ...state.settings, backgroundColor: event.target.value } })}
          />
          <button onClick={() => void saveBackgroundColor()}>Save color</button>
        </div>
      </section>

      <section className="card">
        <h2>Repository</h2>
        <div className="actions">
          <input
            value={state.repositoryUrl}
            onChange={(event) => setState({ ...state, repositoryUrl: event.target.value })}
            placeholder={DEFAULT_REPOSITORY_URL}
          />
        </div>
        <div className="actions">
          <button onClick={() => void saveRepositoryUrl()}>Save URL</button>
          <button className="secondary" onClick={() => void resetRepository()}>
            Reset default
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Status</h2>
        <p className="muted">Last fetched: {formatLastFetchedTime(state.settings.lastFetchedTime)}</p>
      </section>
    </main>
  );
}
