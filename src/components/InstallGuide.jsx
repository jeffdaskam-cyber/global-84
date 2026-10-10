import { useEffect, useId, useRef, useState } from "react";
import {
  CANONICAL_APP_URL,
  detectPlatform,
  isMobileOs,
  isStandalone,
  safeStorage,
} from "../lib/platform";
import { promptNativeInstall, useNativeInstallAvailable } from "../lib/installPrompt";

/**
 * Home Screen install help in three sizes:
 *   variant="signin"  compact help above the sign-in form, collapsible
 *   variant="banner"  post-setup nudge in a mobile browser, dismissible for 7 days
 *   variant="full"    accessible modal (from the banner or the Me page)
 *
 * Renders nothing in the installed app. Detection only picks which steps to
 * show first; members can always correct it, copy the link, or continue in
 * the browser.
 */

const CONTEXTS = [
  { id: "ios-safari", label: "iPhone or iPad: Safari" },
  { id: "ios-chrome", label: "iPhone or iPad: Chrome" },
  { id: "ios-other", label: "iPhone or iPad: Edge, Firefox, or another browser" },
  { id: "embedded", label: "Inside another app (Mail, Gmail, Outlook, WhatsApp)" },
  { id: "android-chrome", label: "Android: Chrome" },
  { id: "android-other", label: "Android: another browser" },
  { id: "desktop", label: "Computer" },
];

function contextFor(platform) {
  if (platform.browser === "embedded") return "embedded";
  if (platform.os === "ios") {
    if (platform.browser === "safari") return "ios-safari";
    if (platform.browser === "chrome") return "ios-chrome";
    return "ios-other";
  }
  if (platform.os === "android") return platform.browser === "chrome" ? "android-chrome" : "android-other";
  return "desktop";
}

const B = ({ children }) => <span className="font-semibold">{children}</span>;

function instructionsFor(contextId) {
  switch (contextId) {
    case "ios-safari":
      return {
        steps: [
          <>Tap the <B>Share</B> button. On newer iPhones it may be inside the <B>•••</B> menu next to the address bar.</>,
          <>Scroll down and tap <B>Add to Home Screen</B>. Not in the list? Tap <B>Edit Actions</B> at the bottom and add it.</>,
          <>If you see <B>Open as Web App</B>, leave it turned on.</>,
          <>Tap <B>Add</B>.</>,
        ],
      };
    case "ios-chrome":
      return {
        steps: [
          <>Tap the <B>Share</B> button in the address bar (a square with an arrow).</>,
          <>Tap <B>Add to Home Screen</B>. You may need to scroll or tap <B>More</B>.</>,
          <>Tap <B>Add</B>.</>,
        ],
        note: "If you don't see Add to Home Screen, copy the link below and open it in Safari.",
      };
    case "ios-other":
      return {
        steps: [
          <>Open the browser&apos;s <B>Share</B> menu (sometimes inside <B>•••</B>).</>,
          <>Look for <B>Add to Home Screen</B> and tap <B>Add</B>.</>,
        ],
        note: "If the option isn't there, copy the link below and open it in Safari.",
      };
    case "embedded":
      return {
        steps: [
          <>Look for a <B>Share</B> or <B>•••</B> menu and try <B>Add to Home Screen</B>.</>,
          <>If it isn&apos;t there, choose <B>Open in Safari</B> or <B>Open in Browser</B> when offered.</>,
          <>No such option? Copy the link below and paste it into Safari&apos;s address bar.</>,
        ],
        note: "If you don't see Add to Home Screen, open this page in Safari.",
      };
    case "android-chrome":
      return {
        steps: [
          <>Tap the <B>⋮</B> menu at the top right.</>,
          <>Tap <B>Add to Home screen</B> or <B>Install app</B>.</>,
          <>Tap <B>Install</B> or <B>Add</B>.</>,
        ],
      };
    case "android-other":
      return {
        steps: [
          <>Open the browser menu and look for <B>Add to Home screen</B> or <B>Install</B>.</>,
        ],
        note: "If it isn't there, copy the link below and open it in Chrome.",
      };
    default:
      return {
        steps: [
          <>Global 84 is made for your phone. Open the link below on your phone and add it to your Home Screen there.</>,
        ],
      };
  }
}

function CopyableLink() {
  const inputId = useId();
  const inputRef = useRef(null);
  const [copied, setCopied] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(CANONICAL_APP_URL);
      setCopied("Link copied.");
    } catch {
      inputRef.current?.select();
      setCopied("Press and hold the link to copy it.");
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor={inputId} className="block text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
        App link
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          ref={inputRef}
          readOnly
          value={CANONICAL_APP_URL}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-base text-ink-main dark:text-ink-onDark"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-du-crimson px-3 py-2 text-sm font-semibold text-du-crimson min-h-[44px]"
        >
          Copy
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
        {copied}
      </div>
    </div>
  );
}

function GuideBody({ initialContext, showExistingIcon = true }) {
  const platform = detectPlatform();
  const detected = initialContext || contextFor(platform);
  const [contextId, setContextId] = useState(detected);
  const [showPicker, setShowPicker] = useState(false);
  const nativeAvailable = useNativeInstallAvailable();
  const [nativeMsg, setNativeMsg] = useState("");
  const selectId = useId();
  const { steps, note } = instructionsFor(contextId);
  const uncertain = contextId === detected && !platform.confident;

  async function handleNativeInstall() {
    const outcome = await promptNativeInstall();
    if (outcome === "accepted") setNativeMsg("Installing. Open Global 84 from your Home Screen when it appears.");
    else if (outcome === "dismissed") setNativeMsg("No problem. You can use the steps below any time.");
  }

  return (
    <div className="text-sm text-ink-main dark:text-ink-onDark">
      {nativeAvailable && (
        <button
          type="button"
          onClick={handleNativeInstall}
          className="mb-3 w-full rounded-lg bg-du-crimson py-3 text-base font-semibold text-white min-h-[44px]"
        >
          Install Global 84
        </button>
      )}
      {nativeMsg && <p role="status" className="mb-2 text-ink-sub dark:text-ink-subOnDark">{nativeMsg}</p>}

      <ol className="space-y-1.5 list-decimal pl-5 leading-relaxed">
        {steps.map((step, i) => <li key={i}>{step}</li>)}
        <li>Then open Global 84 from your Home Screen and sign in there.</li>
      </ol>

      {(note || uncertain) && (
        <p className="mt-2 text-ink-sub dark:text-ink-subOnDark leading-relaxed">
          {uncertain ? "If you don't see Add to Home Screen, open this page in Safari." : note}
        </p>
      )}

      {showExistingIcon && (
        <p className="mt-3 leading-relaxed">
          <B>Already have the icon?</B> Open Global 84 from your Home Screen. No need to install again.
        </p>
      )}

      <div className="mt-3">
        <button
          type="button"
          aria-expanded={showPicker}
          onClick={() => setShowPicker((v) => !v)}
          className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark underline underline-offset-2 min-h-[32px]"
        >
          Instructions don&apos;t match?
        </button>
        {showPicker && (
          <div className="mt-2">
            <label htmlFor={selectId} className="block text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Where are you viewing this?
            </label>
            <select
              id={selectId}
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-base text-ink-main dark:text-ink-onDark"
            >
              {CONTEXTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <CopyableLink />
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

export function InstallGuideModal({ open, onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialogRef.current) {
        // Keep focus inside the dialog.
        const focusables = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card p-5"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 id={titleId} className="text-lg font-semibold text-ink-main dark:text-ink-onDark">
            Add Global 84 to your Home Screen
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full w-11 h-11 flex items-center justify-center text-ink-sub dark:text-ink-subOnDark hover:bg-surface-light dark:hover:bg-surface-dark"
          >
            ✕
          </button>
        </div>
        <GuideBody />
      </div>
    </div>
  );
}

// ── Variants ───────────────────────────────────────────────────────────────────

const SIGNIN_COLLAPSED_KEY = "global84_installHelpCollapsed";
const BANNER_DISMISSED_KEY = "global84_installBannerDismissedAt";
const BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function SigninGuide() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.sessionStorage.getItem(SIGNIN_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  function setAndRemember(value) {
    setCollapsed(value);
    try {
      window.sessionStorage.setItem(SIGNIN_COLLAPSED_KEY, value ? "1" : "0");
    } catch {
      // Not remembered for this visit; harmless.
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setAndRemember(false)}
        className="mb-4 w-full rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 py-2 text-sm font-semibold text-ink-sub dark:text-ink-subOnDark min-h-[44px]"
      >
        Show Home Screen setup steps
      </button>
    );
  }

  return (
    <section
      aria-labelledby="install-help-title"
      className="mb-5 rounded-xl border border-du-goldDeep/60 bg-du-goldSoft dark:bg-surface-dark dark:border-surface-darkBorder p-4"
    >
      <h2 id="install-help-title" className="text-base font-semibold text-ink-main dark:text-ink-onDark">
        Add Global 84 to your Home Screen
      </h2>
      <p className="mt-1 mb-3 text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">
        Install first, then sign in from the icon so you stay signed in there.
      </p>
      <GuideBody />
      <button
        type="button"
        onClick={() => setAndRemember(true)}
        className="mt-4 w-full rounded-lg border border-surface-border dark:border-surface-darkBorder py-2.5 text-sm font-semibold text-ink-main dark:text-ink-onDark min-h-[44px]"
      >
        Continue in browser
      </button>
    </section>
  );
}

function BannerGuide({ hidden }) {
  const [dismissed, setDismissed] = useState(() => {
    const at = Number(safeStorage.get(BANNER_DISMISSED_KEY) || 0);
    return at > 0 && Date.now() - at < BANNER_SNOOZE_MS;
  });
  const [modalOpen, setModalOpen] = useState(false);

  if (dismissed && !modalOpen) return null;

  return (
    <>
      {!dismissed && !hidden && !modalOpen && (
        <div className="fixed inset-x-0 z-40 flex justify-center px-4 lg:hidden" style={{ bottom: "76px" }}>
          <div className="w-full max-w-md rounded-xl border border-du-goldDeep/60 bg-surface-card dark:bg-surface-darkCard dark:border-surface-darkBorder shadow-card p-4">
            <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
              Get Global 84 on your Home Screen
            </div>
            <p className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark leading-relaxed">
              Opens faster and keeps you signed in. You may need to sign in again from the icon.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex-1 rounded-lg bg-du-crimson py-2.5 text-sm font-semibold text-white min-h-[44px]"
              >
                Show me how
              </button>
              <button
                type="button"
                onClick={() => {
                  safeStorage.set(BANNER_DISMISSED_KEY, String(Date.now()));
                  setDismissed(true);
                }}
                className="rounded-lg border border-surface-border dark:border-surface-darkBorder px-4 py-2.5 text-sm font-semibold text-ink-sub dark:text-ink-subOnDark min-h-[44px]"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      <InstallGuideModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

/**
 * @param {{ variant: "signin" | "banner", hidden?: boolean }} props
 *   `hidden` keeps the banner out of the way while another prompt is showing.
 */
export default function InstallGuide({ variant, hidden = false }) {
  if (isStandalone() || !isMobileOs()) return null;
  return variant === "banner" ? <BannerGuide hidden={hidden} /> : <SigninGuide />;
}
