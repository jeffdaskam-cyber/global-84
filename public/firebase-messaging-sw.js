/*
 * firebase-messaging-sw.js — Background push notification service worker.
 *
 * WHAT THIS FILE DOES
 * -------------------
 * When the Global 84 app is closed or running in the background, this worker
 * receives push messages from Firebase Cloud Messaging (FCM) and shows them as
 * native OS notifications. It also handles taps on those notifications, opening
 * (or focusing) the app on the right page.
 *
 * WHY IT LIVES IN /public
 * -----------------------
 * Firebase Messaging requires its service worker to be served from the site
 * root as `/firebase-messaging-sw.js`. Files in `public/` are copied to the
 * site root verbatim by Vite, so this file ends up at exactly that URL.
 *
 * HOW IT GETS ITS FIREBASE CONFIG
 * -------------------------------
 * Service workers cannot read Vite's `import.meta.env` variables. Rather than
 * hardcoding the project keys into this committed file, the app registers this
 * worker with the Firebase web config passed as URL query parameters (see
 * src/lib/notifications.js). We read them back here from `self.location`.
 * (Firebase web config values are public identifiers, not secrets — they ship
 * in every client bundle regardless.)
 */

/* global importScripts, firebase */

// Firebase "compat" builds are the ones designed to run inside a service
// worker via importScripts. Keep this version roughly in step with the
// "firebase" package version in package.json.
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js");

// Pull the Firebase config out of this worker's own URL query string.
const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
};

// Only initialize if we actually received a config (guards against the worker
// being fetched directly without params).
if (firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  // Fired when a push arrives while the app is NOT in the foreground.
  messaging.onBackgroundMessage((payload) => {
    const title =
      (payload.notification && payload.notification.title) ||
      (payload.data && payload.data.title) ||
      "Global 84";
    const body =
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      "";

    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Stash the deep-link URL so the click handler below can navigate to it.
      data: { url: (payload.data && payload.data.url) || "/" },
    });
  });
}

// Fired when the user taps a notification. Focus an existing app tab if one is
// open, otherwise open a new one — either way, navigate to the payload's URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // If the app is already open, focus it and route to the target.
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // No open window — open a fresh one at the target URL.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
