import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_BACKGROUND_IMAGE_EFFECT_LEVEL,
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
  setRepositoryUrl,
} from "../shared/storage";
import {
  getBackgroundImagePresentation,
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

interface AppearanceDraft {
  backgroundColor: string;
  backgroundImageMode: BackgroundImageMode;
  backgroundImageTintOpacity: number;
  backgroundImageBlurPx: number;
  backgroundImageDataUrl: string | null;
  backgroundImageName?: string;
  backgroundImageMimeType?: string;
  backgroundImageSizeBytes?: number;
}

type OptionsNoticeTone = "neutral" | "positive" | "warning";

interface OptionsNotice {
  message: string;
  tone: OptionsNoticeTone;
}

const OPTIONS_BACKGROUND_PREVIEW_STYLE_ID = "zenium-options-background-preview";
const TINT_SLIDER_STEP_COUNT = MAX_BACKGROUND_IMAGE_BLUR_PX;

function getTintSliderValue(opacityPercent: number): number {
  return Math.round((normalizeBackgroundImageTintOpacity(opacityPercent) / MAX_BACKGROUND_IMAGE_TINT_OPACITY) * TINT_SLIDER_STEP_COUNT);
}

function getTintOpacityFromSliderValue(sliderValue: number): number {
  return Math.round((Math.min(TINT_SLIDER_STEP_COUNT, Math.max(0, sliderValue)) / TINT_SLIDER_STEP_COUNT) * MAX_BACKGROUND_IMAGE_TINT_OPACITY);
}

function getOptionsBackgroundPreviewStyleElement(): HTMLStyleElement {
  let styleElement = document.getElementById(OPTIONS_BACKGROUND_PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = OPTIONS_BACKGROUND_PREVIEW_STYLE_ID;
  }
  return styleElement;
}

function attachOptionsBackgroundPreviewStyleElement(): HTMLStyleElement {
  const target = document.head ?? document.documentElement;
  const styleElement = getOptionsBackgroundPreviewStyleElement();
  if (target.lastChild !== styleElement) {
    target.appendChild(styleElement);
  }
  return styleElement;
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

function createAppearanceDraft(state: OptionsState): AppearanceDraft {
  return {
    backgroundColor: state.settings.backgroundColor,
    backgroundImageMode: state.settings.backgroundImageMode,
    backgroundImageTintOpacity: state.settings.backgroundImageTintOpacity,
    backgroundImageBlurPx: state.settings.backgroundImageBlurPx,
    backgroundImageDataUrl: state.backgroundImageDataUrl,
    backgroundImageName: state.settings.backgroundImageName,
    backgroundImageMimeType: state.settings.backgroundImageMimeType,
    backgroundImageSizeBytes: state.settings.backgroundImageSizeBytes,
  };
}

function hasDraftBackgroundImage(draft: AppearanceDraft | null): boolean {
  return Boolean(draft?.backgroundImageDataUrl && draft.backgroundImageName);
}

function isAppearanceDraftDirty(state: OptionsState, draft: AppearanceDraft | null): boolean {
  if (!draft) {
    return false;
  }

  return (
    draft.backgroundColor !== state.settings.backgroundColor ||
    draft.backgroundImageMode !== state.settings.backgroundImageMode ||
    normalizeBackgroundImageTintOpacity(draft.backgroundImageTintOpacity) !== state.settings.backgroundImageTintOpacity ||
    normalizeBackgroundImageBlurPx(draft.backgroundImageBlurPx) !== state.settings.backgroundImageBlurPx ||
    draft.backgroundImageDataUrl !== state.backgroundImageDataUrl ||
    (draft.backgroundImageName ?? undefined) !== (state.settings.backgroundImageName ?? undefined) ||
    (draft.backgroundImageMimeType ?? undefined) !== (state.settings.backgroundImageMimeType ?? undefined) ||
    (draft.backgroundImageSizeBytes ?? undefined) !== (state.settings.backgroundImageSizeBytes ?? undefined)
  );
}

function applyAppearanceDraft(settings: GlobalSettings, draft: AppearanceDraft): GlobalSettings {
  const nextSettings: GlobalSettings = {
    ...settings,
    backgroundColor: draft.backgroundColor,
    backgroundImageMode: draft.backgroundImageMode,
    backgroundImageTintOpacity: normalizeBackgroundImageTintOpacity(draft.backgroundImageTintOpacity),
    backgroundImageBlurPx: normalizeBackgroundImageBlurPx(draft.backgroundImageBlurPx),
  };

  if (hasDraftBackgroundImage(draft)) {
    nextSettings.backgroundImageName = draft.backgroundImageName;
    nextSettings.backgroundImageMimeType = draft.backgroundImageMimeType;
    nextSettings.backgroundImageSizeBytes = draft.backgroundImageSizeBytes;
    return nextSettings;
  }

  delete nextSettings.backgroundImageName;
  delete nextSettings.backgroundImageMimeType;
  delete nextSettings.backgroundImageSizeBytes;
  return nextSettings;
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
  const [appearanceDraft, setAppearanceDraft] = useState<AppearanceDraft | null>(null);
  const [status, setStatus] = useState<OptionsNotice | null>({
    message: "Loading settings...",
    tone: "neutral",
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const [isSavingBackgroundImage, setIsSavingBackgroundImage] = useState(false);
  const stateRef = useRef<OptionsState | null>(null);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  function syncState(nextState: OptionsState | null): void {
    stateRef.current = nextState;
    setState(nextState);
  }

  function queueSettingsWrite(write: () => Promise<void>): Promise<void> {
    const queuedWrite = settingsSaveQueueRef.current.catch(() => undefined).then(write);
    settingsSaveQueueRef.current = queuedWrite;
    return queuedWrite;
  }

  useEffect(() => {
    let cancelled = false;

    void loadState().then((nextState) => {
      if (!cancelled) {
        syncState(nextState);
        setAppearanceDraft(createAppearanceDraft(nextState));
        setStatus(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    const previewColor = appearanceDraft?.backgroundColor ?? DEFAULT_SETTINGS.backgroundColor;
    const previewImageBlurPx = appearanceDraft
      ? normalizeBackgroundImageBlurPx(appearanceDraft.backgroundImageBlurPx)
      : normalizeBackgroundImageBlurPx(DEFAULT_SETTINGS.backgroundImageBlurPx);
    const previewImageTintOpacity = appearanceDraft
      ? normalizeBackgroundImageTintOpacity(appearanceDraft.backgroundImageTintOpacity)
      : normalizeBackgroundImageTintOpacity(DEFAULT_SETTINGS.backgroundImageTintOpacity);
    const previewImageScale = getBackgroundImageScaleForBlur(previewImageBlurPx);
    const backgroundImagePresentation = getBackgroundImagePresentation(appearanceDraft?.backgroundImageMode ?? DEFAULT_SETTINGS.backgroundImageMode);
    const hasBackgroundImage = hasDraftBackgroundImage(appearanceDraft);
    const backgroundPreviewStyleElement = attachOptionsBackgroundPreviewStyleElement();

    rootStyle.setProperty("--options-background-color", previewColor);
    rootStyle.colorScheme = getColorSchemeForBackground(previewColor);
    rootStyle.setProperty("--options-preview-tint", getCssColorWithOpacity(previewColor, previewImageTintOpacity));

    if (!hasBackgroundImage || !appearanceDraft?.backgroundImageDataUrl) {
      backgroundPreviewStyleElement.textContent = "";
      return;
    }

    backgroundPreviewStyleElement.textContent = [
      "body::before {",
      `  background-image: url(\"${appearanceDraft.backgroundImageDataUrl}\");`,
      `  background-position: ${backgroundImagePresentation.position};`,
      `  background-repeat: ${backgroundImagePresentation.repeat};`,
      `  background-size: ${backgroundImagePresentation.size};`,
      `  filter: blur(${previewImageBlurPx}px);`,
      `  transform: scale(${previewImageScale});`,
      "}",
    ].join("\n");
  }, [
    appearanceDraft?.backgroundColor,
    appearanceDraft?.backgroundImageBlurPx,
    appearanceDraft?.backgroundImageDataUrl,
    appearanceDraft?.backgroundImageMode,
    appearanceDraft?.backgroundImageName,
    appearanceDraft?.backgroundImageTintOpacity,
  ]);

  async function saveRepositoryUrl(): Promise<void> {
    const current = stateRef.current;
    if (!current) {
      return;
    }

    await setRepositoryUrl(current.repositoryUrl.trim() || DEFAULT_REPOSITORY_URL);
    setStatus({ message: "Repository source saved.", tone: "positive" });
  }

  async function saveAppearance(): Promise<void> {
    const current = stateRef.current;
    if (!current || !appearanceDraft) {
      return;
    }

    const settings = applyAppearanceDraft(current.settings, appearanceDraft);
    const nextState = {
      ...current,
      settings,
      backgroundImageDataUrl: appearanceDraft.backgroundImageDataUrl,
    };

    syncState(nextState);
    setAppearanceDraft(createAppearanceDraft(nextState));

    await queueSettingsWrite(async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: settings,
        [STORAGE_KEYS.backgroundImageDataUrl]: appearanceDraft.backgroundImageDataUrl,
      });
      setStatus({ message: "Appearance saved.", tone: "positive" });
    });
  }

  async function uploadBackgroundImage(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus({ message: "Select a valid image file.", tone: "warning" });
      return;
    }

    setIsSavingBackgroundImage(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAppearanceDraft((currentDraft) => {
        if (!currentDraft) {
          return currentDraft;
        }

        return {
          ...currentDraft,
          backgroundImageDataUrl: dataUrl,
          backgroundImageName: file.name,
          backgroundImageMimeType: file.type,
          backgroundImageSizeBytes: file.size,
          backgroundImageTintOpacity: getTintOpacityFromSliderValue(DEFAULT_BACKGROUND_IMAGE_EFFECT_LEVEL),
          backgroundImageBlurPx: DEFAULT_BACKGROUND_IMAGE_EFFECT_LEVEL,
        };
      });
      setStatus({ message: "Background image ready to save.", tone: "neutral" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the background image.";
      setStatus({ message, tone: "warning" });
    } finally {
      setIsSavingBackgroundImage(false);
    }
  }

  async function removeBackgroundImage(): Promise<void> {
    setAppearanceDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        backgroundImageDataUrl: null,
        backgroundImageName: undefined,
        backgroundImageMimeType: undefined,
        backgroundImageSizeBytes: undefined,
      };
    });
    setStatus({ message: "Background image removal ready to save.", tone: "neutral" });
  }

  async function updateSettings(patch: Partial<GlobalSettings>, statusText?: string): Promise<void> {
    const current = stateRef.current;
    if (!current) {
      return;
    }

    const settings = {
      ...current.settings,
      ...patch,
    };

    syncState({ ...current, settings });

    await queueSettingsWrite(async () => {
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });

      if (statusText) {
        setStatus({ message: statusText, tone: "positive" });
      }
    });
  }

  async function resetRepository(): Promise<void> {
    await setRepositoryUrl(DEFAULT_REPOSITORY_URL);
    const current = stateRef.current;
    if (current) {
      syncState({ ...current, repositoryUrl: DEFAULT_REPOSITORY_URL });
    }
    setStatus({ message: "Repository source reset to default.", tone: "neutral" });
  }

  async function refetchStyles(): Promise<void> {
    setIsRefetching(true);
    setStatus({ message: "Refreshing styles from the repository...", tone: "neutral" });
    const response = await chrome.runtime.sendMessage({ type: "worker/refetch-styles" });
    setIsRefetching(false);

    if (response.ok) {
      const nextState = await loadState();
      syncState(nextState);
      setStatus({ message: "Styles refreshed from the repository.", tone: "positive" });
      return;
    }

    setStatus({ message: response.error, tone: "warning" });
  }

  if (!state || !appearanceDraft) {
    return <main className="options-root">Loading...</main>;
  }

  const lastFetchedTime = formatLastFetchedTime(state.settings.lastFetchedTime);
  const repositorySource = state.repositoryUrl.trim() || DEFAULT_REPOSITORY_URL;
  const hasBackgroundImage = hasDraftBackgroundImage(appearanceDraft);
  const isAppearanceDirty = isAppearanceDraftDirty(state, appearanceDraft);
  const backgroundImageMeta = [appearanceDraft.backgroundImageName, formatFileSize(appearanceDraft.backgroundImageSizeBytes)]
    .filter((value): value is string => Boolean(value))
    .join(" • ");

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
            <div className="palette-controls">
              <label className="image-color-field">
                <span>Background color</span>
                <input
                  type="color"
                  value={appearanceDraft.backgroundColor}
                  aria-label="Background color"
                  onChange={(event) => setAppearanceDraft({ ...appearanceDraft, backgroundColor: event.target.value })}
                />
              </label>
            </div>
            <div className="image-controls">
              <label className="image-upload-field">
                <span>Background image</span>
                <div className="image-upload-control">
                  <span className={`image-upload-button${isSavingBackgroundImage ? " disabled" : ""}`}>Upload image</span>
                  {backgroundImageMeta ? <span className="image-upload-meta">{backgroundImageMeta}</span> : null}
                  <input
                    className="image-upload-input"
                    type="file"
                    accept="image/*"
                    disabled={isSavingBackgroundImage}
                    onChange={(event) => {
                      const [file] = Array.from(event.target.files ?? []);
                      void uploadBackgroundImage(file ?? null);
                      event.target.value = "";
                    }}
                  />
                </div>
              </label>
              <label className="image-mode-field">
                <span>Image mode</span>
                <select
                  value={appearanceDraft.backgroundImageMode}
                  disabled={!hasBackgroundImage}
                  onChange={(event) => setAppearanceDraft({
                    ...appearanceDraft,
                    backgroundImageMode: event.target.value as BackgroundImageMode,
                  })}
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
                    max={`${TINT_SLIDER_STEP_COUNT}`}
                    step="1"
                    value={getTintSliderValue(appearanceDraft.backgroundImageTintOpacity)}
                    disabled={!hasBackgroundImage}
                    onChange={(event) => setAppearanceDraft({
                      ...appearanceDraft,
                      backgroundImageTintOpacity: getTintOpacityFromSliderValue(Number.parseInt(event.target.value, 10)),
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
                    value={appearanceDraft.backgroundImageBlurPx}
                    disabled={!hasBackgroundImage}
                    onChange={(event) => setAppearanceDraft({
                      ...appearanceDraft,
                      backgroundImageBlurPx: normalizeBackgroundImageBlurPx(Number.parseInt(event.target.value, 10)),
                    })}
                  />
                </label>
              </div>
              <div className="image-actions">
                <button disabled={!isAppearanceDirty || isSavingBackgroundImage} onClick={() => void saveAppearance()}>
                  Save
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
                onChange={(event) => syncState({ ...state, repositoryUrl: event.target.value })}
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
