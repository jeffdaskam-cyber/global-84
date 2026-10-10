/**
 * Reactive store for the browser's native install prompt.
 *
 * `beforeinstallprompt` can fire before React mounts or long after, at most
 * once per page in practice but with no guarantee either way, and only in
 * browsers that support it (mostly Chromium on Android and desktop). This
 * module starts listening as soon as it is imported from main.jsx and lets
 * components subscribe, so an Install button appears whenever a real event is
 * available and disappears once it is used or the app is installed.
 */

import { useSyncExternalStore } from "react";

let deferredEvent = null;
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's mini-infobar from appearing on its own; the guide
    // offers the prompt from a member's tap instead.
    event.preventDefault();
    deferredEvent = event;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredEvent = null;
    emit();
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNativeInstallAvailable() {
  return useSyncExternalStore(subscribe, () => deferredEvent !== null, () => false);
}

/**
 * Show the native prompt. Must be called from a user gesture. The event can
 * only be used once, so it is discarded whatever the outcome.
 * @returns {Promise<"accepted" | "dismissed" | "unavailable">}
 */
export async function promptNativeInstall() {
  const event = deferredEvent;
  if (!event) return "unavailable";
  deferredEvent = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}
