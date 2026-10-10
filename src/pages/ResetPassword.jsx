import { useEffect, useId, useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../lib/firebase";
import {
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  sendDuPasswordReset,
  validateNewPassword,
} from "../lib/auth";
import { InstallGuideModal } from "../components/InstallGuide.jsx";

/**
 * Branded Firebase action page for password reset emails, served from the app's
 * own origin so password managers update the saved Global 84 credential.
 *
 * Configure it as the custom action URL in Firebase Console > Authentication >
 * Templates (https://global-84.vercel.app/reset-password). It renders outside
 * AuthGate and the splash, never signs anyone in, and sends the member back to
 * the Home Screen icon, where their next sign-in finishes any pending setup.
 *
 * The action code is read once, then stripped from the address bar; the page
 * sets no-referrer so it cannot leak through outbound requests.
 */

const inputClass =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2.5 text-base text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold";
const labelClass = "block text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1";
const primaryButton =
  "w-full rounded-lg bg-du-crimson text-white py-3 text-base font-semibold hover:bg-du-crimsonDark transition disabled:opacity-60 min-h-[44px]";

function readActionParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");

  // The custom action URL also receives email sign-in links while the
  // migration window keeps them (MIGRATION ONLY). Hand those to the app root,
  // where AuthGate completes them.
  if (mode === "signIn") {
    window.location.replace(`/${window.location.search}`);
    return { mode, oobCode: null, forwarding: true };
  }

  if (window.location.search) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  return { mode, oobCode, forwarding: false };
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-du-crimson">Global 84</div>
        {children}
      </div>
    </div>
  );
}

function RequestNewEmail() {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setStatus(""); setBusy(true);
    try {
      await sendDuPasswordReset(email);
      setStatus("If that address has a Global 84 account, a new reset email is on its way.");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
      <div>
        <label htmlFor={inputId} className={labelClass}>DU email</label>
        <input
          id={inputId}
          name="username"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && <div role="alert" className="text-sm text-du-crimson">{error}</div>}
      {status && <div role="status" className="text-sm text-ink-sub dark:text-ink-subOnDark">{status}</div>}
      <button type="submit" disabled={busy} className={primaryButton}>Send a new reset email</button>
    </form>
  );
}

export default function ResetPassword() {
  const [{ mode, oobCode, forwarding }] = useState(readActionParams);
  // "verifying" | "form" | "invalid" | "unsupported" | "done"
  const [stage, setStage] = useState(() => {
    if (forwarding) return "verifying";
    if (mode !== "resetPassword") return mode ? "unsupported" : "invalid";
    return oobCode ? "verifying" : "invalid";
  });
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const ids = { email: useId(), next: useId(), confirm: useId(), hint: useId() };

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (forwarding || mode !== "resetPassword" || !oobCode) return;
    let active = true;
    verifyPasswordResetCode(auth, oobCode).then(
      (accountEmail) => {
        if (!active) return;
        setEmail(accountEmail);
        setStage("form");
      },
      () => active && setStage("invalid")
    );
    return () => { active = false; };
  }, [forwarding, mode, oobCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const problem = validateNewPassword(newPassword, confirmPassword);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError("");
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStage("done");
    } catch (err) {
      if (err?.code === "auth/expired-action-code" || err?.code === "auth/invalid-action-code") {
        setStage("invalid");
      } else {
        setError(friendlyAuthError(err));
      }
      setBusy(false);
    }
  }

  if (stage === "verifying") {
    return (
      <Shell>
        <h1 className="mt-1 text-xl font-semibold text-ink-main dark:text-ink-onDark">Checking your link…</h1>
      </Shell>
    );
  }

  if (stage === "unsupported" || stage === "invalid") {
    return (
      <Shell>
        <h1 className="mt-1 text-xl font-semibold text-ink-main dark:text-ink-onDark">
          {stage === "unsupported" ? "This link can't be used here" : "This reset link has expired or was already used"}
        </h1>
        <p className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">
          Request a new email below and use the newest link. Each link works once.
        </p>
        <RequestNewEmail />
      </Shell>
    );
  }

  if (stage === "done") {
    return (
      <Shell>
        <h1 className="mt-1 text-xl font-semibold text-ink-main dark:text-ink-onDark">Password updated</h1>
        <p role="status" className="mt-2 text-sm text-ink-main dark:text-ink-onDark leading-relaxed">
          Your password is updated. Close this page, open Global 84 from your Home Screen, and sign in with your
          new password.
        </p>
        <button
          type="button"
          onClick={() => setInstallOpen(true)}
          className="mt-4 text-sm font-semibold text-du-crimson underline underline-offset-2 min-h-[44px]"
        >
          Don&apos;t have Global 84 on your Home Screen yet?
        </button>
        <InstallGuideModal open={installOpen} onClose={() => setInstallOpen(false)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mt-1 text-xl font-semibold text-ink-main dark:text-ink-onDark">Choose a new password</h1>
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <div>
          <label htmlFor={ids.email} className={labelClass}>DU email</label>
          <input
            id={ids.email}
            name="username"
            type="email"
            value={email}
            readOnly
            autoComplete="username"
            className={`${inputClass} opacity-80`}
          />
        </div>
        <div>
          <label htmlFor={ids.next} className={labelClass}>New password</label>
          <div className="flex gap-2">
            <input
              id={ids.next}
              name="new-password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={ids.hint}
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
              autoFocus
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide passwords" : "Show passwords"}
              aria-pressed={visible}
              className="shrink-0 rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark min-h-[44px] min-w-[56px]"
            >
              {visible ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor={ids.confirm} className={labelClass}>Confirm new password</label>
          <input
            id={ids.confirm}
            name="confirm-new-password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={ids.hint}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
            className={inputClass}
          />
        </div>
        <p id={ids.hint} className="text-xs text-ink-sub dark:text-ink-subOnDark">
          At least {MIN_PASSWORD_LENGTH} characters. Your phone can save your password for next time.
        </p>
        {error && <div role="alert" className="text-sm text-du-crimson">{error}</div>}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </Shell>
  );
}
