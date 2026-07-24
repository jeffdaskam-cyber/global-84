/**
 * NotificationPrompt.jsx
 *
 * Two things live here, both tied to the signed-in user:
 *
 *  1. A one-time, dismissible banner that explains push notifications and
 *     asks permission with a friendly UI (instead of throwing the raw browser
 *     permission dialog at the user cold). Shown once per user, tracked in
 *     localStorage.
 *
 *  2. A lightweight in-app toast that appears when a push arrives while the app
 *     is open and focused — FCM does not fire the service worker in that case,
 *     so we surface it ourselves via the foreground listener.
 *
 * Mount this once, high in the tree, passing the signed-in `user`.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestNotificationPermission, initForegroundListener } from "../lib/notifications";

function promptShownKey(uid) {
  return `global84_notifPromptShown_${uid}`;
}

export default function NotificationPrompt({ user }) {
  const navigate = useNavigate();
  const [showBanner, setShowBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { title, body, url } | null
  const toastTimer = useRef(null);

  const uid = user?.uid;

  // Decide whether to show the one-time banner.
  useEffect(() => {
    if (!uid) { setShowBanner(false); return; }
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return; // unsupported: never show

    const alreadyShown = localStorage.getItem(promptShownKey(uid)) === "1";
    // Only prompt users who haven't been asked and haven't already decided.
    if (!alreadyShown && Notification.permission === "default") {
      setShowBanner(true);
    }
  }, [uid]);

  // Wire up the foreground listener so in-app toasts work while the app is open.
  useEffect(() => {
    if (!uid) return;
    let unsub = () => {};
    let active = true;

    (async () => {
      const off = await initForegroundListener((msg) => {
        setToast(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 6000);
      });
      if (active) unsub = off;
      else off(); // unmounted before listener attached
    })();

    return () => {
      active = false;
      unsub();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [uid]);

  function markShown() {
    if (uid) localStorage.setItem(promptShownKey(uid), "1");
    setShowBanner(false);
  }

  async function handleEnable() {
    setBusy(true);
    try {
      await requestNotificationPermission(uid);
    } finally {
      setBusy(false);
      markShown(); // hide regardless of the permission outcome
    }
  }

  function handleToastClick() {
    if (toast?.url) navigate(toast.url);
    setToast(null);
  }

  return (
    <>
      {/* One-time permission banner */}
      {showBanner && (
        <div
          className="fixed inset-x-0 z-50 flex justify-center px-4"
          style={{ bottom: "76px" }} // sit above the bottom tab bar
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "linear-gradient(160deg,#1c0408 0%,#2a0a10 100%)",
              border: "1px solid rgba(196,150,42,0.35)",
              borderRadius: 14,
              padding: "16px 18px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 15,
                fontWeight: 700,
                color: "#ffffff",
                marginBottom: 4,
              }}
            >
              Stay in the loop
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, margin: 0 }}>
              Get notified about new announcements and events.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={handleEnable}
                disabled={busy}
                style={{
                  flex: 1,
                  background: busy
                    ? "rgba(196,150,42,0.25)"
                    : "linear-gradient(135deg,#e8b84b 0%,#c4862a 100%)",
                  color: busy ? "rgba(255,255,255,0.4)" : "#1a0a00",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Enabling…" : "Enable Notifications"}
              </button>
              <button
                onClick={markShown}
                disabled={busy}
                style={{
                  flex: "0 0 auto",
                  background: "transparent",
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(196,150,42,0.3)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Foreground toast (push arriving while the app is open) */}
      {toast && (
        <div
          className="fixed inset-x-0 z-50 flex justify-center px-4"
          style={{ top: "16px" }}
        >
          <button
            onClick={handleToastClick}
            style={{
              width: "100%",
              maxWidth: 440,
              textAlign: "left",
              background: "linear-gradient(160deg,#1c0408 0%,#2a0a10 100%)",
              border: "1px solid rgba(196,150,42,0.35)",
              borderRadius: 12,
              padding: "12px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 14,
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {toast.title}
            </div>
            {toast.body && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                {toast.body}
              </div>
            )}
          </button>
        </div>
      )}
    </>
  );
}
