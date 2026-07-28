import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Firestore with an IndexedDB-backed cache instead of the default in-memory one.
 *
 * The memory cache is destroyed on every reload and PWA cold start, so without
 * this every listener re-downloads its whole result set from scratch — 250
 * Explore items, 100 chat messages, every event and team — over whatever
 * connection the member happens to be on. Abroad that is a roaming cell link to
 * a database on another continent, and until the first response lands the UI
 * has nothing to show.
 *
 * With a persistent cache, reads are served from disk immediately and revalidated
 * in the background, and writes made while offline are queued and replayed on
 * reconnect. That is the difference between an app that opens instantly with
 * yesterday's schedule and one that spins on a dead hotel connection.
 *
 * persistentMultipleTabManager is required because this app registers two
 * service workers (Workbox at "/" and FCM at its own scope) and members open it
 * both installed and in a browser tab; the single-tab manager would throw
 * "failed-precondition" for the second context. Where IndexedDB is unavailable
 * (Safari private browsing) the SDK falls back to memory on its own rather than
 * throwing, so there is nothing to catch here.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
export const COHORT_ID = import.meta.env.VITE_COHORT_ID;
export const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || "du.edu").toLowerCase();
