/**
 * Best-effort platform and browser detection for install guidance.
 *
 * Every answer here is a hint for choosing which instructions to show first.
 * None of it gates access: the guide always offers manual browser selection,
 * a copyable link, and "Continue in browser". Detection that cannot tell is
 * reported as `confident: false` so the copy can say so.
 */

export const CANONICAL_APP_URL = "https://global-84.vercel.app";

/**
 * True when running as the installed Home Screen app. False means "this page
 * is in a browser", not "the app is not installed".
 */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {
    // Older engines without display-mode support.
  }
  return window.navigator?.standalone === true;
}

// In-app viewers that announce themselves in the user agent. Checked before
// the broad "iOS without Safari/" heuristic so a known token always wins.
const EMBEDDED_TOKENS = [
  { re: /\bGSA\//, app: "google" },
  { re: /\bFBAN|FBAV|FB_IAB/, app: "facebook" },
  { re: /\bInstagram\b/, app: "instagram" },
  { re: /\bWhatsApp\b/i, app: "whatsapp" },
  { re: /\bLinkedInApp\b/, app: "linkedin" },
  { re: /\bLine\//, app: "line" },
  { re: /\bMicroMessenger\b/, app: "wechat" },
  { re: /\bOutlook-iOS|\bOutlook-Android/, app: "outlook" },
  { re: /\bGmail\b/, app: "gmail" },
];

/**
 * @returns {{
 *   os: "ios" | "android" | "desktop",
 *   browser: "safari" | "chrome" | "edge" | "firefox" | "samsung" | "embedded" | "other",
 *   embeddedApp: string | null,
 *   confident: boolean,
 * }}
 */
export function detectPlatform(nav = typeof navigator !== "undefined" ? navigator : {}) {
  const ua = nav.userAgent || "";
  // iPadOS 13+ reports a desktop Mac user agent; touch support gives it away.
  const isIPadDesktopUa = /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
  const isIos = /iPhone|iPad|iPod/.test(ua) || isIPadDesktopUa;
  const isAndroid = /Android/.test(ua);
  const os = isIos ? "ios" : isAndroid ? "android" : "desktop";

  const embedded = EMBEDDED_TOKENS.find((t) => t.re.test(ua));
  if (embedded) {
    return { os, browser: "embedded", embeddedApp: embedded.app, confident: true };
  }

  if (isIos) {
    if (/CriOS\//.test(ua)) return { os, browser: "chrome", embeddedApp: null, confident: true };
    if (/EdgiOS\//.test(ua)) return { os, browser: "edge", embeddedApp: null, confident: true };
    if (/FxiOS\//.test(ua)) return { os, browser: "firefox", embeddedApp: null, confident: true };
    // Real Safari includes "Safari/". Many in-app viewers omit it, but not all
    // do, and some that omit it can still install, so this is only a guess.
    if (/Safari\//.test(ua)) return { os, browser: "safari", embeddedApp: null, confident: !isIPadDesktopUa };
    return { os, browser: "embedded", embeddedApp: null, confident: false };
  }

  if (isAndroid) {
    if (/SamsungBrowser\//.test(ua)) return { os, browser: "samsung", embeddedApp: null, confident: true };
    if (/EdgA\//.test(ua)) return { os, browser: "edge", embeddedApp: null, confident: true };
    if (/Firefox\//.test(ua)) return { os, browser: "firefox", embeddedApp: null, confident: true };
    // Android WebViews mark themselves with "; wv)".
    if (/; wv\)/.test(ua)) return { os, browser: "embedded", embeddedApp: null, confident: false };
    if (/Chrome\//.test(ua)) return { os, browser: "chrome", embeddedApp: null, confident: true };
    return { os, browser: "other", embeddedApp: null, confident: false };
  }

  if (/Edg\//.test(ua)) return { os, browser: "edge", embeddedApp: null, confident: true };
  if (/Firefox\//.test(ua)) return { os, browser: "firefox", embeddedApp: null, confident: true };
  if (/Chrome\//.test(ua)) return { os, browser: "chrome", embeddedApp: null, confident: true };
  if (/Safari\//.test(ua)) return { os, browser: "safari", embeddedApp: null, confident: true };
  return { os, browser: "other", embeddedApp: null, confident: false };
}

export function isMobileOs(platform = detectPlatform()) {
  return platform.os === "ios" || platform.os === "android";
}

/** Guarded localStorage: private windows and blocked storage must not throw. */
export const safeStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage unavailable: the preference simply is not remembered.
    }
  },
};
