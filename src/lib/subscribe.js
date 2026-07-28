import { onSnapshot } from "firebase/firestore";

/**
 * onSnapshot with a mandatory error path.
 *
 * A listener created with only a success callback is not merely quiet when it
 * fails — Firestore detaches it permanently and never retries. Because every
 * page in this app clears its `loading` flag inside the success callback, a
 * detached listener leaves the member on a spinner with no error, no retry, and
 * no recovery short of force-quitting the app. That is the most likely way this
 * app breaks on hotel wifi or a saturated international link, so every
 * subscription goes through here.
 *
 * `label` identifies the listener in the console, since the error itself says
 * nothing about which query stopped.
 *
 * @param {string} label - Short name for logs, e.g. "chat" or "events".
 * @param {import("firebase/firestore").Query|import("firebase/firestore").DocumentReference} target
 * @param {function} onData - Receives the snapshot, as with onSnapshot.
 * @param {function} [onError] - Receives the FirestoreError.
 * @returns {function} Unsubscribe function.
 */
export function watch(label, target, onData, onError) {
  return onSnapshot(target, onData, (err) => {
    console.error(`[${label}] listener stopped:`, err);
    if (onError) onError(err);
  });
}

/**
 * Turn a FirestoreError into something worth showing a member standing in a
 * hotel lobby. The distinction that matters to them is whether waiting will
 * help: a dropped connection resolves itself, an expired session does not.
 */
export function listenerErrorMessage(err) {
  if (err?.code === "permission-denied" || err?.code === "unauthenticated") {
    return "Your session expired. Sign out and sign back in to continue.";
  }
  return "Couldn't reach the server. Check your connection, then reload.";
}
