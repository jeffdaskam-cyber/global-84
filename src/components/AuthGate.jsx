import { upsertMemberProfile } from "../lib/members";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { auth, ALLOWED_DOMAIN } from "../lib/firebase";
import { sendDuSignInLink, completeEmailLinkSignIn } from "../lib/auth";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // Email link + fallback email/password inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Step 2: Complete email-link sign-in if this page load contains a Firebase email sign-in link.
  // This MUST run before we decide to show the "Send sign-in link" UI, otherwise users can get stuck in a loop.
  useEffect(() => {
    (async () => {
      try {
        const res = await completeEmailLinkSignIn();
        if (res?.didSignIn) {
          // Remove Firebase action params (oobCode, etc.) from the URL after successful completion
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.error("Email link sign-in completion failed:", e);
        setError(e?.message || "Could not complete sign-in from email link.");
      }
    })();
  }, []);

  // Listen for auth state changes (single source of truth for signed-in user)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          // Create/update member profile in Firestore
          await upsertMemberProfile(u);
        }
        setUser(u || null);
      } catch (e) {
        // If Firestore fails, we still allow auth session but show an error
        console.error("Member upsert failed:", e);
        setError(e?.message || "Signed in, but profile setup failed.");
        setUser(u || null);
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, []);

  // While checking auth state (and/or completing email link), render nothing (or a spinner)
  if (checking) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-6">
          <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">Global 84</div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            Enter your DU email and we’ll send you a sign-in link.
          </div>

          <label className="block mt-4">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              DU Email
            </div>
            <input
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              placeholder="name@du.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          {error ? <div className="mt-3 text-sm text-du-crimson">{error}</div> : null}
          {status ? <div className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark">{status}</div> : null}

          {/* Email link sign-in */}
          <button
            className="mt-5 w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition"
            onClick={async () => {
              setError("");
              setStatus("");
              try {
                await sendDuSignInLink(email);
                setStatus("Check your inbox. Click the link to finish signing in.");
              } catch (e) {
                setError(e?.message || "Could not send sign-in link.");
              }
            }}
          >
            Send sign-in link
          </button>

          <div className="mt-3 text-xs text-ink-muted dark:text-ink-subOnDark">
            DU email required (@du.edu)
          </div>

          {/* Temporary fallback: Email/Password (for testing while email-link quota is exceeded) */}
          <div className="mt-6 border-t border-surface-border dark:border-surface-darkBorder pt-4">
            <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
              Temporary sign-in (Email/Password)
            </div>
            <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
              Use only for testing while email-link quota is exceeded.
            </div>

            <label className="block mt-3">
              <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
                Password
              </div>
              <input
                className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                type="password"
              />
            </label>

            <button
              className="mt-4 w-full rounded-lg bg-du-gold text-black py-3 text-sm font-semibold hover:opacity-90 transition"
              onClick={async () => {
                setError("");
                setStatus("");
                try {
                  const e = (email || "").trim().toLowerCase();
                  const domain = e.split("@")[1] || "";
                  if (domain !== (ALLOWED_DOMAIN || "du.edu").toLowerCase()) {
                    throw new Error(`Please use your @${ALLOWED_DOMAIN} email address.`);
                  }
                  if (!password) {
                    throw new Error("Please enter a password.");
                  }

                  await signInWithEmailAndPassword(auth, e, password);
                  setStatus("Signed in.");
                } catch (e) {
                  setError(e?.message || "Email/password sign-in failed.");
                }
              }}
            >
              Sign in with password
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}