import { useId, useState } from "react";
import {
  MIN_PASSWORD_LENGTH,
  changeMyPassword,
  friendlyAuthError,
  setInitialPassword,
  validateNewPassword,
} from "../lib/auth";
import { completeMyPasswordSetup } from "../lib/access";

/**
 * Password forms, built for password managers: a real <form>, a visible
 * read-only username field, and `new-password` / `current-password`
 * autocomplete hints so Keychain and others offer to save the personal
 * password and replace the temporary one.
 *
 *   mode="setup"   required first-time setup after signing in with a temporary
 *                  password. Asks only for the new password twice; the
 *                  temporary one is requested only if Firebase demands a fresh
 *                  sign-in.
 *   mode="change"  optional change from the Me page; always asks for the
 *                  current password.
 *
 * Passwords live only in this component's state and are never trimmed,
 * stored, or logged.
 */

const inputClass =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2.5 text-base text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold";
const labelClass = "block text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1";

function PasswordField({ id, name, label, value, onChange, autoComplete, describedBy, autoFocus }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="shrink-0 rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark min-h-[44px] min-w-[56px]"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordForm({
  mode,
  email,
  credentialVersion,
  previousPassword = "",
  onComplete,
  onCancel,
}) {
  const uid = useId();
  const ids = {
    email: `${uid}-email`,
    current: `${uid}-current`,
    next: `${uid}-new`,
    confirm: `${uid}-confirm`,
    hint: `${uid}-hint`,
    error: `${uid}-error`,
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // setup only: Firebase wanted a fresh sign-in, so show the temporary field.
  const [needsReauth, setNeedsReauth] = useState(false);
  // "idle" | "saving" | "finishing" | "reconcile-failed"
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");

  const isSetup = mode === "setup";
  const busy = phase === "saving" || phase === "finishing";

  async function finishSetup() {
    setPhase("finishing");
    setError("");
    try {
      const result = await completeMyPasswordSetup(credentialVersion);
      if (result?.result === "ready") {
        onComplete?.();
        return;
      }
      if (result?.result === "stale-version") {
        setPhase("idle");
        setError("Your password was replaced by the program team. Sign out and use the newest temporary password.");
        return;
      }
      setPhase("reconcile-failed");
    } catch {
      setPhase("reconcile-failed");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (phase === "reconcile-failed") {
      // The password already changed. Retry bookkeeping only.
      await finishSetup();
      return;
    }

    const compareTo = isSetup ? (currentPassword || previousPassword) : currentPassword;
    const problem = validateNewPassword(newPassword, confirmPassword, compareTo);
    if (problem) { setError(problem); return; }
    if (!isSetup && !currentPassword) { setError("Enter your current password."); return; }
    if (isSetup && needsReauth && !currentPassword) { setError("Enter your temporary password."); return; }

    setPhase("saving");
    setError("");
    try {
      if (isSetup) {
        await setInitialPassword(newPassword, needsReauth ? currentPassword : undefined);
        await finishSetup();
      } else {
        await changeMyPassword(currentPassword, newPassword);
        // A member still finishing setup (the caller passes a version only
        // then) is reconciled too.
        if (typeof credentialVersion === "number") {
          await completeMyPasswordSetup(credentialVersion).catch(() => undefined);
        }
        setPhase("idle");
        onComplete?.();
      }
    } catch (err) {
      setPhase("idle");
      if (isSetup && err?.code === "auth/requires-recent-login") {
        setNeedsReauth(true);
        setError("For your security, enter the temporary password you signed in with, then tap Save again.");
        return;
      }
      setError(friendlyAuthError(err));
    }
  }

  if (phase === "reconcile-failed") {
    return (
      <form onSubmit={handleSubmit} noValidate>
        <div role="alert" className="rounded-lg bg-du-goldSoft dark:bg-surface-dark p-3 text-sm text-ink-main dark:text-ink-onDark">
          Your password was updated. We&apos;re finishing setup. Retry when connected.
        </div>
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-du-crimson text-white py-3 text-base font-semibold min-h-[44px]"
        >
          Retry
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor={ids.email} className={labelClass}>DU email</label>
        <input
          id={ids.email}
          name="username"
          type="email"
          value={email || ""}
          readOnly
          autoComplete="username"
          className={`${inputClass} opacity-80`}
        />
      </div>

      {(!isSetup || needsReauth) && (
        <PasswordField
          id={ids.current}
          name="current-password"
          label={isSetup ? "Temporary password" : "Current password"}
          value={currentPassword}
          onChange={(v) => { setCurrentPassword(v); setError(""); }}
          autoComplete="current-password"
          autoFocus={isSetup}
        />
      )}

      <PasswordField
        id={ids.next}
        name="new-password"
        label="New password"
        value={newPassword}
        onChange={(v) => { setNewPassword(v); setError(""); }}
        autoComplete="new-password"
        describedBy={ids.hint}
        autoFocus={isSetup && !needsReauth}
      />
      <PasswordField
        id={ids.confirm}
        name="confirm-new-password"
        label="Confirm new password"
        value={confirmPassword}
        onChange={(v) => { setConfirmPassword(v); setError(""); }}
        autoComplete="new-password"
        describedBy={ids.hint}
      />

      <p id={ids.hint} className="text-xs text-ink-sub dark:text-ink-subOnDark leading-relaxed">
        At least {MIN_PASSWORD_LENGTH} characters. Your phone can save your password for next time.
        {!isSetup && " Other devices may need to sign in again."}
      </p>

      {error && (
        <div id={ids.error} role="alert" className="text-sm text-du-crimson">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-du-crimson text-white py-3 text-base font-semibold hover:bg-du-crimsonDark transition disabled:opacity-60 min-h-[44px]"
        >
          {phase === "saving" ? "Saving…" : phase === "finishing" ? "Finishing setup…" : "Save password"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-surface-border dark:border-surface-darkBorder px-4 text-sm font-semibold text-ink-sub dark:text-ink-subOnDark min-h-[44px]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
