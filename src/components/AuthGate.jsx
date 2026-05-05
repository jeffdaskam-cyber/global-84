import { upsertMemberProfile } from "../lib/members";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { auth, db, COHORT_ID } from "../lib/firebase";
import { sendDuSignInLink, completeEmailLinkSignIn } from "../lib/auth";

// ── Name prompt ────────────────────────────────────────────────────────────────
// Shown once to any user whose displayName is missing or defaulted to "member".

function NamePrompt({ user, onComplete }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Please enter your name."); return; }
    if (trimmed.length < 2) { setError("Name must be at least 2 characters."); return; }
    setSaving(true);
    try {
      await updateDoc(
        doc(db, "cohorts", COHORT_ID, "members", user.uid),
        { displayName: trimmed }
      );
      onComplete();
    } catch (e) {
      console.error("Name save failed:", e);
      setError("Couldn't save your name. Please try again.");
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSave();
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg,#0d0103 0%,#1c0408 55%,#2a0a10 100%)" }}
    >
      <div style={{
        width: "100%", maxWidth: 400,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(196,150,42,0.25)",
        borderRadius: 16, padding: "36px 28px",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{
            fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 700, color: "#ffffff",
          }}>
            Global{" "}
            <span style={{
              background: "linear-gradient(135deg,#e8b84b 0%,#f5d47a 45%,#c4862a 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>84</span>
          </div>
          <div style={{
            fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
            color: "rgba(196,150,42,0.65)", marginTop: 4,
          }}>
            Welcome
          </div>
        </div>

        <h2 style={{
          fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700,
          color: "#ffffff", marginBottom: 8,
        }}>
          What's your name?
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.5 }}>
          This is how you'll appear in chat, events, and the gallery. You can change it later on your Me page.
        </p>

        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={handleKeyDown}
          placeholder="Your full name"
          autoFocus
          maxLength={60}
          style={{
            width: "100%", background: "rgba(255,255,255,0.08)",
            border: `1px solid ${error ? "rgba(186,12,47,0.7)" : "rgba(196,150,42,0.3)"}`,
            borderRadius: 10, color: "#fff",
            padding: "11px 14px", fontSize: 15, outline: "none",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <p style={{ fontSize: 12, color: "#ff6b6b", marginTop: 6 }}>{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            marginTop: 20, width: "100%",
            background: saving || !name.trim()
              ? "rgba(196,150,42,0.25)"
              : "linear-gradient(135deg,#e8b84b 0%,#c4862a 100%)",
            color: saving || !name.trim() ? "rgba(255,255,255,0.3)" : "#1a0a00",
            border: "none", borderRadius: 10,
            padding: "13px", fontSize: 15, fontWeight: 700,
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {saving ? "Saving…" : "Let's go →"}
        </button>
      </div>
    </div>
  );
}

// ── AuthGate ───────────────────────────────────────────────────────────────────

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [needsName, setNeedsName] = useState(false);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Complete email-link sign-in if URL contains Firebase action params
  useEffect(() => {
    (async () => {
      try {
        const res = await completeEmailLinkSignIn();
        if (res?.didSignIn) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.error("Email link sign-in completion failed:", e);
        setError(e?.message || "Could not complete sign-in from email link.");
      }
    })();
  }, []);

  // Handoff from launch page: /?email=<du-email> auto-sends the sign-in link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = (params.get("email") || "").trim().toLowerCase();
    if (!handoff) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    setEmail(handoff);
    (async () => {
      try {
        await sendDuSignInLink(handoff);
        setStatus("Check your inbox. Click the link to finish signing in.");
      } catch (e) {
        setError(e?.message || "Could not send sign-in link.");
      }
    })();
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          await upsertMemberProfile(u);
          // Read the member doc directly after upsert to check displayName.
          // If absent or still the placeholder "member", show the name prompt.
          const memberSnap = await getDoc(
            doc(db, "cohorts", COHORT_ID, "members", u.uid)
          );
          const dn = memberSnap.exists() ? (memberSnap.data().displayName ?? "") : "";
          if (!dn || dn === "member") {
            setNeedsName(true);
          }
        }
        setUser(u || null);
      } catch (e) {
        console.error("Member upsert failed:", e);
        setError(e?.message || "Signed in, but profile setup failed.");
        setUser(u || null);
      } finally {
        setChecking(false);
      }
    });
    return () => unsub();
  }, []);

  if (checking) return null;

  // ── Sign-in screen ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-6">
          <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">Global 84</div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            Enter your DU email and we'll send you a sign-in link.
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
        </div>
      </div>
    );
  }

  // ── Name prompt (first-time or missing name) ─────────────────────────────────
  if (needsName) {
    return <NamePrompt user={user} onComplete={() => setNeedsName(false)} />;
  }

  return children;
}
