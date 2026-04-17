import { isContentMessage } from "../shared/messages";

const STYLE_ID = "zenium-page-styles";
const TOAST_ID = "zenium-toast";

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
}

function removeStyles(): void {
  const styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (styleElement) {
    styleElement.textContent = "";
  }
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
  hostname: window.location.hostname,
});
