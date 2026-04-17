import { ChangeEvent, useEffect, useState } from "react";

import { DEFAULT_REPOSITORY_URL, STORAGE_KEYS } from "../shared/constants";
import { normalizeSitePattern } from "../shared/settings";
import {
  addUserStyleMapping,
  getGlobalSettings,
  getRepositoryUrl,
  getSnapshot,
  getStringList,
  removeUserStyleMapping,
  setRepositoryUrl,
  setStringList,
} from "../shared/storage";
import { getAvailableStyleKeys } from "../shared/style-engine";
import type { GlobalSettings, StoredMapping } from "../shared/types";

interface OptionsState {
  settings: GlobalSettings | null;
  repositoryUrl: string;
  skipThemingList: string[];
  skipForceThemingList: string[];
  fallbackBackgroundList: string[];
  userStylesMapping: StoredMapping;
  availableStyleKeys: string[];
}

async function loadState(): Promise<OptionsState> {
  const [settings, repositoryUrl, skipThemingList, skipForceThemingList, fallbackBackgroundList, snapshot] =
    await Promise.all([
      getGlobalSettings(),
      getRepositoryUrl(),
      getStringList(STORAGE_KEYS.skipThemingList),
      getStringList(STORAGE_KEYS.skipForceThemingList),
      getStringList(STORAGE_KEYS.fallbackBackgroundList),
      getSnapshot(),
    ]);

  return {
    settings,
    repositoryUrl,
    skipThemingList,
    skipForceThemingList,
    fallbackBackgroundList,
    userStylesMapping: snapshot.userStylesMapping,
    availableStyleKeys: getAvailableStyleKeys(snapshot),
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

  async function exportData(): Promise<void> {
    const allData = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zenium-settings-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Export complete.");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    await chrome.storage.local.set(parsed);
    setState(await loadState());
    setStatus("Import complete.");
  }

  async function updateList(key: string, value: string[]): Promise<void> {
    await setStringList(key, value);
    setState(await loadState());
  }

  async function updateSettings(patch: Partial<GlobalSettings>): Promise<void> {
    if (!state?.settings) {
      return;
    }

    const next = { ...state.settings, ...patch };
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
    setState((current) => (current ? { ...current, settings: next } : current));
    setStatus("Settings saved.");
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
        <h2>Advanced behavior</h2>
        <div className="setting-list">
          <SettingToggle
            label="Style whitelist mode"
            description="Only apply site-specific styles to hosts listed below."
            checked={state.settings?.whitelistStyleMode ?? false}
            onChange={(checked) => void updateSettings({ whitelistStyleMode: checked })}
          />
          <SettingToggle
            label="Force whitelist mode"
            description="Only apply forced fallback styling to hosts listed below."
            checked={state.settings?.whitelistMode ?? false}
            onChange={(checked) => void updateSettings({ whitelistMode: checked })}
          />
          <SettingToggle
            label="Disable transparency features"
            description="Turns off transparency-related style features everywhere."
            checked={state.settings?.disableTransparency ?? false}
            onChange={(checked) => void updateSettings({ disableTransparency: checked })}
          />
          <SettingToggle
            label="Disable hover features"
            description="Turns off hover-reveal style features everywhere."
            checked={state.settings?.disableHover ?? false}
            onChange={(checked) => void updateSettings({ disableHover: checked })}
          />
          <SettingToggle
            label="Disable footer features"
            description="Turns off footer-removal style features everywhere."
            checked={state.settings?.disableFooter ?? false}
            onChange={(checked) => void updateSettings({ disableFooter: checked })}
          />
          <SettingToggle
            label="Disable Dark Reader features"
            description="Turns off Dark Reader compatibility overrides everywhere."
            checked={state.settings?.disableDarkReader ?? false}
            onChange={(checked) => void updateSettings({ disableDarkReader: checked })}
          />
        </div>
      </section>

      <section className="card">
        <h2>Backup</h2>
        <div className="actions">
          <button onClick={() => void exportData()}>Export all data</button>
          <label className="file-input">
            <span>Import data</span>
            <input type="file" accept="application/json" onChange={(event) => void importData(event)} />
          </label>
        </div>
      </section>

      <EditableList
        title={state.settings?.whitelistStyleMode ? "Style whitelist" : "Skip styling list"}
        description={state.settings?.whitelistStyleMode ? "Hosts that should receive site-specific styles." : "Hosts that should skip site-specific styles."}
        items={state.skipThemingList}
        onChange={(items) => void updateList(STORAGE_KEYS.skipThemingList, items)}
      />
      <EditableList
        title={state.settings?.whitelistMode ? "Force whitelist" : "Force styling skip list"}
        description={state.settings?.whitelistMode ? "Hosts that should receive forced fallback styling." : "Hosts that should skip forced fallback styling."}
        items={state.skipForceThemingList}
        onChange={(items) => void updateList(STORAGE_KEYS.skipForceThemingList, items)}
      />
      <EditableList
        title="Fallback background list"
        description="Hosts that should always keep a plain page background fallback."
        items={state.fallbackBackgroundList}
        onChange={(items) => void updateList(STORAGE_KEYS.fallbackBackgroundList, items)}
      />

      <section className="card">
        <h2>Status</h2>
        <p className="muted">Last fetched: {formatLastFetchedTime(state.settings?.lastFetchedTime)}</p>
      </section>

      <MappingsCard
        availableStyleKeys={state.availableStyleKeys}
        mapping={state.userStylesMapping}
        onAdd={async (sourceStyle, targetSite) => {
          await addUserStyleMapping(sourceStyle, targetSite);
          setState(await loadState());
          setStatus("Mapping added.");
        }}
        onRemove={async (sourceStyle, targetSite) => {
          await removeUserStyleMapping(sourceStyle, targetSite);
          setState(await loadState());
          setStatus("Mapping removed.");
        }}
      />
    </main>
  );
}

interface EditableListProps {
  title: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
}

function EditableList({ title, description, items, onChange }: EditableListProps) {
  const [draft, setDraft] = useState("");

  return (
    <section className="card">
      <h2>{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
      <div className="actions row">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="example.com" />
        <button
          onClick={() => {
            if (!draft.trim()) {
              return;
            }
            onChange([...items, draft.trim()]);
            setDraft("");
          }}
        >
          Add
        </button>
      </div>
      <div className="chips">
        {items.length === 0 ? <p className="muted">No entries</p> : null}
        {items.map((item) => (
          <button key={item} className="chip" onClick={() => onChange(items.filter((entry) => entry !== item))}>
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

interface MappingsCardProps {
  availableStyleKeys: string[];
  mapping: StoredMapping;
  onAdd: (sourceStyle: string, targetSite: string) => Promise<void>;
  onRemove: (sourceStyle: string, targetSite: string) => Promise<void>;
}

function MappingsCard({ availableStyleKeys, mapping, onAdd, onRemove }: MappingsCardProps) {
  const [sourceStyle, setSourceStyle] = useState(availableStyleKeys[0] ?? "");
  const [targetSite, setTargetSite] = useState("");

  useEffect(() => {
    if (!sourceStyle && availableStyleKeys.length > 0) {
      setSourceStyle(availableStyleKeys[0]);
    }
  }, [availableStyleKeys, sourceStyle]);

  return (
    <section className="card">
      <h2>User style mappings</h2>
      <p className="muted">Targets support exact hosts plus `+domain.tld` and `-domain.tld` patterns.</p>
      <div className="actions row wrap">
        <select value={sourceStyle} onChange={(event) => setSourceStyle(event.target.value)}>
          <option value="">Select style</option>
          {availableStyleKeys.map((styleKey) => (
            <option key={styleKey} value={styleKey}>
              {styleKey}
            </option>
          ))}
        </select>
        <input
          value={targetSite}
          onChange={(event) => setTargetSite(normalizeSitePattern(event.target.value))}
          placeholder="target.example.com or -domain.tld"
        />
        <button
          onClick={() => {
            if (!sourceStyle || !targetSite.trim()) {
              return;
            }
            void onAdd(sourceStyle, targetSite.trim());
            setTargetSite("");
          }}
        >
          Add mapping
        </button>
      </div>
      <div className="mapping-list">
        {Object.keys(mapping.mapping).length === 0 ? <p className="muted">No custom mappings</p> : null}
        {Object.entries(mapping.mapping).map(([styleKey, targets]) => (
          <div key={styleKey} className="mapping-group">
            <strong>{styleKey}</strong>
            <div className="chips">
              {targets.map((target) => (
                <button key={`${styleKey}:${target}`} className="chip" onClick={() => void onRemove(styleKey, target)}>
                  {target}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SettingToggle({ label, description, checked, onChange }: SettingToggleProps) {
  return (
    <label className="setting-toggle">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
