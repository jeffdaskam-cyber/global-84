/**
 * notifications.js — Client-side helper for push notifications (FCM).
 *
 * Responsibilities:
 *   1. Ask the browser for notification permission.
 *   2. Register the background service worker and obtain an FCM token.
 *   3. Save that token to Firestore so the Cloud Functions can target it.
 *   4. Listen for messages that arrive while the app is open (foreground).
 *
 * Everything here fails soft: if the browser doesn't support notifications
 * (e.g. some iOS browser contexts) or the user denies permission, the
 * functions return `false` / no-op instead of throwing, so the rest of the app
 * keeps working.
 */

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db, COHORT_ID } from "./firebase";

// The Firebase web config, re-read from Vite env so we can hand it to the
// service worker (which cannot read env vars itself) via query params.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * True only when this browser can actually do web push. Guards against calling
 * FCM APIs in unsupported environments (older iOS Safari tabs, etc.).
 */
async function notificationsSupported() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Register the messaging service worker, passing the Firebase config as query
 * params so the worker can initialize Firebase without env-var access.
 *
 * NOTE: this uses FCM's dedicated narrow scope, not "/". The app's PWA
 * (Workbox) service worker already owns the root scope; registering a second
 * worker at "/" would replace that registration and break offline caching.
 * Push delivery does not require the worker to control the page, so a separate
 * scope is exactly right.
 */
async function registerMessagingServiceWorker() {
  const params = new URLSearchParams(firebaseConfig).toString();
  return navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params}`,
    { scope: "/firebase-cloud-messaging-push-scope" }
  );
}

/**
 * Request notification permission and, if granted, save an FCM token for the
 * signed-in user.
 *
 * @param {string} uid - The signed-in user's Firebase uid.
 * @returns {Promise<boolean>} true if a token was saved, false otherwise.
 */
export async function requestNotificationPermission(uid) {
  if (!uid) return false;
  if (!(await notificationsSupported())) return false;

  if (!VAPID_KEY) {
    console.warn("Push notifications not configured: VITE_FIREBASE_VAPID_KEY is missing.");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await registerMessagingServiceWorker();
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    // One doc per device/browser, keyed by the token itself.
    await setDoc(
      doc(db, "cohorts", COHORT_ID, "members", uid, "fcmTokens", token),
      {
        token,
        createdAt: serverTimestamp(),
        userAgent: navigator.userAgent || "",
      }
    );

    return true;
  } catch (err) {
    console.error("Failed to enable push notifications:", err);
    return false;
  }
}

/**
 * Listen for messages that arrive while the app is open and focused. In this
 * case FCM does NOT fire the service worker, so we surface an in-app toast
 * ourselves via the provided callback.
 *
 * @param {(msg: { title: string, body: string, url: string }) => void} onToast
 *   Called with the notification details when a foreground message arrives.
 * @returns {Promise<() => void>} an unsubscribe function (no-op if unsupported).
 */
export async function initForegroundListener(onToast) {
  if (!(await notificationsSupported())) return () => {};

  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      const title =
        payload?.notification?.title || payload?.data?.title || "Global 84";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const url = payload?.data?.url || "/";
      if (typeof onToast === "function") onToast({ title, body, url });
    });
  } catch (err) {
    console.error("Foreground notification listener failed:", err);
    return () => {};
  }
}
