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

  async function resetRepository(): Promise<void> {
    await setRepositoryUrl(DEFAULT_REPOSITORY_URL);
    setState((current) => (current ? { ...current, repositoryUrl: DEFAULT_REPOSITORY_URL } : current));
    setStatus("Repository URL reset.");
  }

  if (!state) {
    return <main className="options-root">Loading...</main>;
  }

  return (
    <main className="options-root">
      <header className="header">
        <div>
          <p className="eyebrow">Zenium</p>
          <h1>Settings</h1>
          <p className="subtitle">Cleaner, content-focused website styling for Chrome, inspired by Zen Internet.</p>
        </div>
        <p className="status">{status}</p>
      </header>

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
