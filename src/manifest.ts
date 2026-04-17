import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Zenium",
  version: "0.1.0",
  description: "Zenium brings cleaner, content-focused website styling to Chrome, inspired by Zen Internet.",
  icons: {
    48: "icons/logo_48.png",
    96: "icons/logo_96.png",
  },
  permissions: ["activeTab", "alarms", "storage", "tabs", "webNavigation"],
  host_permissions: ["<all_urls>"],
  action: {
    default_popup: "popup.html",
    default_title: "Zenium",
    default_icon: {
      48: "icons/logo_48.png",
      96: "icons/logo_96.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  options_page: "options.html",
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_start",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["icons/*"],
      matches: ["<all_urls>"],
    },
  ],
  commands: {
    "toggle-current-site": {
      suggested_key: {
        default: "Alt+Shift+U",
      },
      description: "Toggle styling for the current website",
    },
    "toggle-global-styling": {
      suggested_key: {
        default: "Alt+Shift+G",
      },
      description: "Toggle global styling",
    },
    "toggle-global-transparency": {
      suggested_key: {
        default: "Alt+Shift+O",
      },
      description: "Toggle background effect styling",
    },
  },
});
