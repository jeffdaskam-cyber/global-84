import { createContext, Fragment, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db, COHORT_ID } from "../lib/firebase";
import { upsertMemberProfile } from "../lib/members";
import {
  completeEmailLinkSignIn,
  friendlyAuthError,
  sendDuPasswordReset,
  sendDuSignInLink,
  signInWithDuPassword,
  signInWithPastedLink,
  signOutUser,
} from "../lib/auth";
import { accessAllowsTripData, completeMyPasswordSetup, subscribeMyAccess } from "../lib/access";
import ChangePasswordForm from "./ChangePasswordForm.jsx";
import InstallGuide from "./InstallGuide.jsx";

/**
 * AuthGate decides what a person sees before the app, one explicit state at a
 * time, per signed-in UID:
 *
 *   restoringAuth   Firebase is re-hydrating the saved session from disk
 *   signedOut       sign-in form (with install help in a mobile browser)
 *   checkingAccess  waiting for the access record or setup reconciliation
 *   needsPassword   signed in with a temporary password: choose your own
 *   finishingSetup  first entry: creating the member profile
 *   needsName       profile still has no real name
 *   ready           the app (children) is mounted
 *   denied          no usable membership; explains why
 *   accessError     could not reach the server; Retry, never a forced sign-out
 *
 * Children (and every listener inside them) mount only in `ready`, keyed by
 * UID so nothing from one member survives into another's session. A returning
 * member whose cached access record already says "ready" goes straight in and
 * is revalidated in the background; an authoritative answer that access is no
 * longer usable takes the app away immediately. The cached record is only a
 * UI shortcut: Firestore rules and the functions still decide what loads.
 */

const AuthContext = createContext({ user: null, access: null });

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthGate() {
  return useContext(AuthContext);
}

// How long to wait before showing recovery guidance. Neither timeout signs
// anyone out; they only swap a blank wait for something actionable.
const AUTH_TIMEOUT_MS = 7000;
const ACCESS_TIMEOUT_MS = 10000;

const inputClass =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2.5 text-base text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold";
const labelClass = "block text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1";
const primaryButton =
  "w-full rounded-lg bg-du-crimson text-white py-3 text-base font-semibold hover:bg-du-crimsonDark transition disabled:opacity-60 min-h-[44px]";
const secondaryButton =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder py-2.5 text-sm font-semibold text-ink-main dark:text-ink-onDark min-h-[44px]";

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-du-crimson">Global 84</div>
      {title && <h1 className="mt-1 text-xl font-semibold text-ink-main dark:text-ink-onDark">{title}</h1>}
      {children}
    </div>
  );
}

function Message({ children }) {
  return <p className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">{children}</p>;
}

function SignOutButton() {
  return (
    <button type="button" onClick={signOutUser} className={`mt-3 ${secondaryButton}`}>
      Sign out
    </button>
  );
}

// ── Name prompt ────────────────────────────────────────────────────────────────

function NamePrompt({ user, onComplete }) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError("Please enter your name (at least 2 characters)."); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "cohorts", COHORT_ID, "members", user.uid), { displayName: trimmed });
      onComplete();
    } catch {
      setError("Couldn't save your name. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Shell>
      <Card title="What's your name?">
        <Message>
          This is how you&apos;ll appear in chat, events, and the gallery. You can change it later on your Me page.
        </Message>
        <form onSubmit={handleSubmit} noValidate className="mt-4">
          <label htmlFor={inputId} className={labelClass}>Your name</label>
          <input
            id={inputId}
            name="name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            autoComplete="name"
            autoFocus
            maxLength={60}
            className={inputClass}
          />
          {error && <div role="alert" className="mt-2 text-sm text-du-crimson">{error}</div>}
          <button type="submit" disabled={saving || !name.trim()} className={`mt-5 ${primaryButton}`}>
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
      </Card>
    </Shell>
  );
}

// ── Sign-in ────────────────────────────────────────────────────────────────────

function EmailLinkFallback({ email }) {
  // MIGRATION ONLY: remove with the email-link helpers at final cutover.
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pastedLink, setPastedLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendLink() {
    setError(""); setStatus(""); setBusy(true);
    try {
      await sendDuSignInLink(email);
      setStatus("Check your inbox. Open the link to finish signing in.");
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function usePastedLink() {
    setError(""); setStatus(""); setBusy(true);
    try {
      await signInWithPastedLink(pastedLink, email);
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 pt-4 border-t border-surface-border dark:border-surface-darkBorder">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark underline underline-offset-2 min-h-[32px]"
      >
        No temporary password yet? Sign in with an email link
      </button>
      {open && (
        <div className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark">
          <p className="leading-relaxed">
            Until your temporary password arrives, existing members can still sign in with a link sent to the
            DU email entered above.
          </p>
          <button type="button" disabled={busy || !email} onClick={sendLink} className={`mt-3 ${secondaryButton}`}>
            Send sign-in link
          </button>
          <p className="mt-3 text-xs leading-relaxed">
            On iPhone, email links open in Safari, not the Home Screen app. To sign in here instead, press and
            hold the link in the email, choose Copy Link (don&apos;t tap it), and paste it below.
          </p>
          <textarea
            aria-label="Sign-in link from your email"
            className={`mt-2 ${inputClass} text-sm`}
            rows={3}
            placeholder="https://…"
            value={pastedLink}
            onChange={(e) => setPastedLink(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" disabled={busy || !pastedLink.trim()} onClick={usePastedLink} className={`mt-2 ${secondaryButton}`}>
            Sign in with link
          </button>
          {status && <p role="status" className="mt-2">{status}</p>}
          {error && <p role="alert" className="mt-2 text-du-crimson">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SignInScreen({ initialEmail, initialError, onPasswordSignIn }) {
  const ids = { email: useId(), password: useId() };
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [status, setStatus] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError(""); setStatus(""); setBusy(true);
    try {
      await signInWithDuPassword(email, password);
      // Kept briefly so setup can refuse reusing the temporary password.
      onPasswordSignIn(password);
      // onAuthStateChanged swaps the screen; fields stay filled until then so
      // the password manager sees a completed form.
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function handleForgot() {
    setError(""); setStatus("");
    if (!email.trim()) { setError("Enter your DU email first, then tap Forgot password."); return; }
    setBusy(true);
    try {
      await sendDuPasswordReset(email);
      setStatus(
        "If that address has a Global 84 account, a reset email is on its way. Choose a new password from the email, then come back here and sign in with it."
      );
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <InstallGuide variant="signin" />
      <Card title="Sign in">
        <Message>Use your DU email and password. For first setup, use the temporary password sent to you individually.</Message>
        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div>
            <label htmlFor={ids.email} className={labelClass}>DU email</label>
            <input
              id={ids.email}
              name="username"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="name@du.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={ids.password} className={labelClass}>Password</label>
            <div className="flex gap-2">
              <input
                id={ids.password}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="shrink-0 rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark min-h-[44px] min-w-[56px]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <div role="alert" className="text-sm text-du-crimson">{error}</div>}
          {status && <div role="status" className="text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">{status}</div>}

          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleForgot}
          disabled={busy}
          className="mt-3 text-sm font-semibold text-du-crimson underline underline-offset-2 min-h-[44px]"
        >
          Forgot password?
        </button>

        <EmailLinkFallback email={email} />
      </Card>
    </Shell>
  );
}

// ── Gate ───────────────────────────────────────────────────────────────────────

const DENIED_COPY = {
  missing: "Your account doesn't currently have access to Global 84. Contact the program team.",
  inactive: "Your account doesn't currently have access to Global 84. Contact the program team.",
  pending: "Your account is approved, but your temporary password hasn't been issued yet. You'll receive it individually from the program team.",
  issuing: "Your account is being set up. Try again in a minute.",
  error: "Your account setup needs attention. Contact the program team for a new temporary password.",
  legacy: "Your temporary access has ended. Sign in with the temporary password sent to you individually, or contact the program team.",
};

function readHandoffEmail() {
  // Legacy /?email= handoff from the launch page: prefill only, never send an
  // email, and strip the address from the URL immediately.
  const params = new URLSearchParams(window.location.search);
  const handoff = (params.get("email") || "").trim().toLowerCase();
  if (handoff) {
    params.delete("email");
    const rest = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (rest ? `?${rest}` : ""));
  }
  return handoff;
}

export default function AuthGate({ children, onStateChange }) {
  // undefined while Firebase restores the saved session.
  const [user, setUser] = useState(undefined);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [handoffEmail] = useState(readHandoffEmail);
  const [linkError, setLinkError] = useState("");

  const [accessInfo, setAccessInfo] = useState({ uid: null, access: null, fromCache: true, loaded: false, error: null });
  const [accessTimedOut, setAccessTimedOut] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Setup reconciliation for a temporary record, keyed by uid:version.
  const [completion, setCompletion] = useState({ key: null, status: "idle" });
  // Profile creation / name check after access is usable, keyed by uid.
  const [profile, setProfile] = useState({ uid: null, status: "idle" });

  // The password typed at sign-in, kept in memory only until setup finishes
  // or the user changes, so the setup form can refuse reusing the temporary
  // password.
  const [signInPassword, setSignInPassword] = useState("");
  const uidRef = useRef(null);
  // Which uid:version / uid the background work has already started for.
  const completionStartedRef = useRef(null);
  const profileStartedRef = useRef(null);

  // Email-link completion (MIGRATION ONLY).
  useEffect(() => {
    (async () => {
      try {
        const res = await completeEmailLinkSignIn();
        if (res?.didSignIn) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        setLinkError(friendlyAuthError(e));
      }
    })();
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    const next = u || null;
    if ((next?.uid ?? null) !== uidRef.current) {
      uidRef.current = next?.uid ?? null;
      completionStartedRef.current = null;
      profileStartedRef.current = null;
      if (!next) setSignInPassword("");
      setAccessInfo({ uid: next?.uid ?? null, access: null, fromCache: true, loaded: false, error: null });
      setAccessTimedOut(false);
      setCompletion({ key: null, status: "idle" });
      setProfile({ uid: null, status: "idle" });
    }
    setUser(next);
  }), []);

  useEffect(() => {
    if (user !== undefined) return undefined;
    const t = setTimeout(() => setAuthTimedOut(true), AUTH_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [user]);

  const uid = user?.uid ?? null;

  // Own access record. Late callbacks from a previous UID are ignored.
  useEffect(() => {
    if (!uid) return undefined;
    const timer = setTimeout(() => setAccessTimedOut(true), ACCESS_TIMEOUT_MS);
    const unsub = subscribeMyAccess(
      uid,
      ({ access, fromCache }) => {
        if (uidRef.current !== uid) return;
        setAccessInfo({ uid, access, fromCache, loaded: true, error: null });
        // Cached fast path: a returning member whose saved record already
        // allows access goes straight in while everything revalidates.
        if (fromCache && accessAllowsTripData(access)) {
          setProfile((prev) => (prev.uid === uid ? prev : { uid, status: "ready" }));
        }
      },
      (err) => {
        if (uidRef.current !== uid) return;
        setAccessInfo((prev) => ({ ...prev, uid, error: err }));
      }
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [uid, retryNonce]);

  const access = accessInfo.uid === uid ? accessInfo.access : null;
  const accessLoaded = accessInfo.uid === uid && accessInfo.loaded;
  const authoritative = accessLoaded && !accessInfo.fromCache;
  const usable = accessLoaded && accessAllowsTripData(access);
  // A cached "ready" lets a returning member straight in; anything else waits
  // for the server's answer.
  const resolved = authoritative || usable;

  // Reconcile a temporary record once per uid:version, after a password
  // sign-in or app restart. This is how an email reset done in another browser
  // is recognized without asking for a second password change.
  const tempKey =
    uid && authoritative && access?.active === true && access.credentialState === "temporary"
      ? `${uid}:${access.credentialVersion}`
      : null;
  useEffect(() => {
    if (!tempKey || completionStartedRef.current === tempKey) return;
    completionStartedRef.current = tempKey;
    completeMyPasswordSetup(access.credentialVersion).then(
      (res) => {
        if (uidRef.current !== uid) return;
        setCompletion({ key: tempKey, status: res?.result === "ready" ? "done" : "needs-password" });
      },
      () => {
        if (uidRef.current !== uid) return;
        setCompletion({ key: tempKey, status: "failed" });
      }
    );
  }, [tempKey, access, uid]);

  // Member profile, only once access is usable. On the cached fast path the
  // app shows immediately and the name check runs behind it.
  useEffect(() => {
    if (!usable || !user || profileStartedRef.current === user.uid) return;
    const forUid = user.uid;
    profileStartedRef.current = forUid;
    (async () => {
      try {
        await upsertMemberProfile(user);
        const snap = await getDoc(doc(db, "cohorts", COHORT_ID, "members", forUid));
        const dn = snap.exists() ? String(snap.data().displayName ?? "").trim() : "";
        if (uidRef.current !== forUid) return;
        const needsName = !dn || dn.toLowerCase() === "member";
        setProfile({ uid: forUid, status: needsName ? "needsName" : "ready" });
        setSignInPassword("");
      } catch {
        if (uidRef.current !== forUid) return;
        // Already showing the app from cache: keep it; the write retries
        // with Firestore's offline queue.
        setProfile((prev) => (prev.uid === forUid && prev.status === "ready" ? prev : { uid: forUid, status: "error" }));
      }
    })();
  }, [usable, user]);

  const retryAccess = useCallback(() => {
    completionStartedRef.current = null;
    profileStartedRef.current = null;
    setAccessTimedOut(false);
    setAccessInfo((prev) => ({ ...prev, error: null }));
    setCompletion({ key: null, status: "idle" });
    setProfile({ uid: null, status: "idle" });
    setRetryNonce((n) => n + 1);
  }, []);

  // ── Derive the single current state ──
  let state;
  let deniedReason = null;
  if (user === undefined) state = "restoringAuth";
  else if (!user) state = "signedOut";
  else if (!resolved) {
    if (accessInfo.error?.code === "permission-denied") { state = "denied"; deniedReason = "missing"; }
    else state = accessInfo.error || accessTimedOut ? "accessError" : "checkingAccess";
  } else if (!access) { state = "denied"; deniedReason = "missing"; }
  else if (access.active !== true) { state = "denied"; deniedReason = "inactive"; }
  else if (usable) {
    if (profile.uid !== uid || profile.status === "idle") state = "finishingSetup";
    else if (profile.status === "error") state = "accessError";
    else if (profile.status === "needsName") state = "needsName";
    else state = "ready";
  } else if (access.credentialState === "temporary") {
    if (completion.key !== tempKey || completion.status === "done") state = "checkingAccess";
    else if (completion.status === "failed") state = "accessError";
    else state = "needsPassword";
  } else {
    state = "denied";
    deniedReason = DENIED_COPY[access.credentialState] ? access.credentialState : "error";
  }

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  switch (state) {
    case "restoringAuth":
      return (
        <Shell>
          {authTimedOut ? (
            <Card title="Reconnecting…">
              <Message>Still restoring your session. Check Wi-Fi or data. You won&apos;t need to sign in again.</Message>
              <button type="button" onClick={() => window.location.reload()} className={`mt-4 ${primaryButton}`}>
                Retry
              </button>
            </Card>
          ) : (
            <div className="sr-only" role="status">Loading Global 84…</div>
          )}
        </Shell>
      );

    case "signedOut":
      return (
        <SignInScreen
          initialEmail={handoffEmail}
          initialError={linkError}
          onPasswordSignIn={setSignInPassword}
        />
      );

    case "checkingAccess":
    case "finishingSetup":
      return (
        <Shell>
          <Card title={state === "finishingSetup" ? "Getting things ready…" : "Checking your account…"}>
            <Message>This only takes a moment.</Message>
          </Card>
        </Shell>
      );

    case "accessError":
      return (
        <Shell>
          <Card title="Can't reach Global 84">
            <Message>No connection. Check Wi-Fi or data and try again. You&apos;re still signed in.</Message>
            <button type="button" onClick={retryAccess} className={`mt-4 ${primaryButton}`}>Retry</button>
            <SignOutButton />
          </Card>
        </Shell>
      );

    case "denied":
      return (
        <Shell>
          <Card title="No access yet">
            <Message>{DENIED_COPY[deniedReason]}</Message>
            {(deniedReason === "issuing" || deniedReason === "pending") && (
              <button type="button" onClick={retryAccess} className={`mt-4 ${primaryButton}`}>Try again</button>
            )}
            <SignOutButton />
          </Card>
        </Shell>
      );

    case "needsPassword":
      return (
        <Shell>
          <Card title="Choose your password">
            <Message>
              You signed in with a temporary password. Choose your own now; your phone can save it for next time.
            </Message>
            <div className="mt-4">
              <ChangePasswordForm
                mode="setup"
                email={user.email}
                credentialVersion={access.credentialVersion}
                previousPassword={signInPassword}
                onComplete={() => setCompletion({ key: tempKey, status: "done" })}
              />
            </div>
            <SignOutButton />
          </Card>
        </Shell>
      );

    case "needsName":
      return <NamePrompt user={user} onComplete={() => setProfile({ uid, status: "ready" })} />;

    default:
      return (
        <AuthContext.Provider value={{ user, access }}>
          <Fragment key={uid}>{children}</Fragment>
        </AuthContext.Provider>
      );
  }
}
