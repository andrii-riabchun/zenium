import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Zenium",
  version: "1.0.0",
  description: "Zenium brings cleaner, content-focused website styling to Chrome, inspired by Zen Internet.",
  icons: {
    16: "icons/icon-on-16.png",
    32: "icons/icon-on-32.png",
    48: "icons/icon-on-48.png",
    128: "icons/icon-on-128.png",
  },
  permissions: ["alarms", "storage", "tabs", "unlimitedStorage", "webNavigation"],
  host_permissions: ["<all_urls>"],
  action: {
    default_popup: "popup.html",
    default_title: "Zenium",
    default_icon: {
      16: "icons/icon-on-16.png",
      32: "icons/icon-on-32.png",
      48: "icons/icon-on-48.png",
      128: "icons/icon-on-128.png",
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
});
