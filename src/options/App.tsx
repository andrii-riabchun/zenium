import { useEffect, useState } from "react";

import {
  DEFAULT_REPOSITORY_URL,
  DEFAULT_SETTINGS,
  MAX_BACKGROUND_IMAGE_BLUR_PX,
  MAX_BACKGROUND_IMAGE_TINT_OPACITY,
  STORAGE_KEYS,
} from "../shared/constants";
import {
  getBackgroundImageDataUrl,
  getGlobalSettings,
  getRepositoryUrl,
  removeBackgroundImageDataUrl,
  setRepositoryUrl,
  setBackgroundImageDataUrl,
} from "../shared/storage";
import {
  getBackgroundImageScaleForBlur,
  getColorSchemeForBackground,
  getCssColorWithOpacity,
  normalizeBackgroundImageBlurPx,
  normalizeBackgroundImageTintOpacity,
} from "../shared/settings";
import type { BackgroundImageMode, GlobalSettings } from "../shared/types";

interface OptionsState {
  settings: GlobalSettings;
  repositoryUrl: string;
  backgroundImageDataUrl: string | null;
}

type OptionsNoticeTone = "neutral" | "positive" | "warning";

interface OptionsNotice {
  message: string;
  tone: OptionsNoticeTone;
}

async function loadState(): Promise<OptionsState> {
  const [settings, repositoryUrl, backgroundImageDataUrl] = await Promise.all([
    getGlobalSettings(),
    getRepositoryUrl(),
    getBackgroundImageDataUrl(),
  ]);

  return {
    settings,
    repositoryUrl,
    backgroundImageDataUrl,
  };
}

function formatLastFetchedTime(timestamp?: number): string {
  return typeof timestamp === "number" ? new Date(timestamp).toLocaleString() : "Never";
}

function formatFileSize(size?: number): string | null {
  if (!size || !Number.isFinite(size) || size <= 0) {
    return null;
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function getModeLabel(mode: BackgroundImageMode): string {
  switch (mode) {
    case "stretch":
      return "Stretch";
    case "tile":
      return "Tile";
    case "fit":
      return "Fit";
    case "center":
      return "Center";
    case "fill":
    default:
      return "Fill";
  }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read the selected image."));
    };
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [state, setState] = useState<OptionsState | null>(null);
  const [status, setStatus] = useState<OptionsNotice | null>({
    message: "Loading settings...",
    tone: "neutral",
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const [isSavingBackgroundImage, setIsSavingBackgroundImage] = useState(false);

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

  async function saveBackgroundMode(mode: BackgroundImageMode): Promise<void> {
    await updateSettings({ backgroundImageMode: mode }, "Background image mode saved.");
  }

  async function saveBackgroundImageEffects(): Promise<void> {
    if (!state) {
      return;
    }

    await updateSettings(
      {
        backgroundImageTintOpacity: normalizeBackgroundImageTintOpacity(state.settings.backgroundImageTintOpacity),
        backgroundImageBlurPx: normalizeBackgroundImageBlurPx(state.settings.backgroundImageBlurPx),
      },
      "Background image effects saved.",
    );
  }

  async function uploadBackgroundImage(file: File | null): Promise<void> {
    if (!state || !file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus({ message: "Select a valid image file.", tone: "warning" });
      return;
    }

    setIsSavingBackgroundImage(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);

      const settings = {
        ...state.settings,
        backgroundImageName: file.name,
        backgroundImageMimeType: file.type,
        backgroundImageSizeBytes: file.size,
      };

      await Promise.all([
        setBackgroundImageDataUrl(dataUrl),
        chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings }),
      ]);
      await chrome.runtime.sendMessage({ type: "worker/refresh-active-tab" });

      setState((current) => (current ? { ...current, settings, backgroundImageDataUrl: dataUrl } : current));
      setStatus({ message: "Background image saved.", tone: "positive" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the background image.";
      setStatus({ message, tone: "warning" });
    } finally {
      setIsSavingBackgroundImage(false);
    }
  }

  async function removeBackgroundImage(): Promise<void> {
    if (!state) {
      return;
    }

    const settings = {
      ...state.settings,
    };
    delete settings.backgroundImageName;
    delete settings.backgroundImageMimeType;
    delete settings.backgroundImageSizeBytes;

    await Promise.all([
      removeBackgroundImageDataUrl(),
      chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings }),
    ]);
    await chrome.runtime.sendMessage({ type: "worker/refresh-active-tab" });

    setState((current) => (current ? { ...current, settings, backgroundImageDataUrl: null } : current));
    setStatus({ message: "Background image removed.", tone: "neutral" });
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
  const backgroundImageFileSize = formatFileSize(state.settings.backgroundImageSizeBytes);
  const hasBackgroundImage = Boolean(state.backgroundImageDataUrl && state.settings.backgroundImageName);
  const previewImageBlurPx = normalizeBackgroundImageBlurPx(state.settings.backgroundImageBlurPx);
  const previewImageTintOpacity = normalizeBackgroundImageTintOpacity(state.settings.backgroundImageTintOpacity);
  const previewImageScale = getBackgroundImageScaleForBlur(previewImageBlurPx);
  const previewTintColor = getCssColorWithOpacity(state.settings.backgroundColor, previewImageTintOpacity);

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
            <p>Transparent shells fall back to this background. Uploaded images sit over the solid color so uncovered areas still render cleanly.</p>
          </div>
          <div className="palette-panel">
            <div
              className="color-preview"
              style={{
                ["--preview-color" as string]: state.settings.backgroundColor,
                ["--preview-image" as string]: hasBackgroundImage ? `url("${state.backgroundImageDataUrl}")` : "none",
                ["--preview-size" as string]: state.settings.backgroundImageMode === "stretch"
                  ? "100% 100%"
                  : state.settings.backgroundImageMode === "tile"
                    ? "auto"
                    : state.settings.backgroundImageMode === "fit"
                      ? "contain"
                      : state.settings.backgroundImageMode === "center"
                        ? "auto"
                        : "cover",
                ["--preview-repeat" as string]: state.settings.backgroundImageMode === "tile" ? "repeat" : "no-repeat",
                ["--preview-position" as string]: state.settings.backgroundImageMode === "tile" ? "0 0" : "center center",
                ["--preview-blur" as string]: `${previewImageBlurPx}px`,
                ["--preview-scale" as string]: `${previewImageScale}`,
                ["--preview-tint" as string]: previewTintColor,
              }}
            >
              <span>Canvas</span>
              <strong>{hasBackgroundImage ? state.settings.backgroundImageName : state.settings.backgroundColor}</strong>
              {backgroundImageFileSize ? <small>{backgroundImageFileSize}</small> : null}
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
            <div className="image-controls">
              <label className="image-upload-field">
                <span>Background image</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isSavingBackgroundImage}
                  onChange={(event) => {
                    const [file] = Array.from(event.target.files ?? []);
                    void uploadBackgroundImage(file ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className="image-mode-field">
                <span>Image mode</span>
                <select
                  value={state.settings.backgroundImageMode}
                  disabled={!hasBackgroundImage}
                  onChange={(event) => void saveBackgroundMode(event.target.value as BackgroundImageMode)}
                >
                  {(["fill", "fit", "center", "stretch", "tile"] as BackgroundImageMode[]).map((mode) => (
                    <option key={mode} value={mode}>{getModeLabel(mode)}</option>
                  ))}
                </select>
              </label>
              <div className="image-effects-grid">
                <label className="image-slider-field">
                  <span>Tint</span>
                  <input
                    type="range"
                    min="0"
                    max={`${MAX_BACKGROUND_IMAGE_TINT_OPACITY}`}
                    step="1"
                    value={state.settings.backgroundImageTintOpacity}
                    disabled={!hasBackgroundImage}
                    onChange={(event) => setState({
                      ...state,
                      settings: {
                        ...state.settings,
                        backgroundImageTintOpacity: Number.parseInt(event.target.value, 10),
                      },
                    })}
                  />
                </label>
                <label className="image-slider-field">
                  <span>Blur</span>
                  <input
                    type="range"
                    min="0"
                    max={`${MAX_BACKGROUND_IMAGE_BLUR_PX}`}
                    step="1"
                    value={state.settings.backgroundImageBlurPx}
                    disabled={!hasBackgroundImage}
                    onChange={(event) => setState({
                      ...state,
                      settings: {
                        ...state.settings,
                        backgroundImageBlurPx: Number.parseInt(event.target.value, 10),
                      },
                    })}
                  />
                </label>
              </div>
              <div className="image-actions">
                <button disabled={!hasBackgroundImage} onClick={() => void saveBackgroundImageEffects()}>
                  Save image effects
                </button>
                <button className="secondary" disabled={!hasBackgroundImage} onClick={() => void removeBackgroundImage()}>
                  Remove image
                </button>
                {isSavingBackgroundImage ? <span className="image-saving">Saving image...</span> : null}
              </div>
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
