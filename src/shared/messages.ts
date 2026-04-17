import type { ContentMessage, RuntimeRequest } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "content/ready":
    case "worker/refetch-styles":
    case "worker/refresh-active-tab":
      return true;
    case "worker/update-auto-update":
      return typeof value.enabled === "boolean";
    default:
      return false;
  }
}

export function isContentMessage(value: unknown): value is ContentMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "content/apply-styles":
      return typeof value.css === "string";
    case "content/remove-styles":
      return true;
    case "content/show-toast":
      return typeof value.text === "string" && typeof value.isEnabled === "boolean";
    default:
      return false;
  }
}
