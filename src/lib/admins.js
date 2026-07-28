import { doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, COHORT_ID } from "./firebase";
import { watch } from "./subscribe";

export function subscribeIsAdmin(cb, onError) {
  let unsubAdminDoc = null;

  const unsubAuth = onAuthStateChanged(auth, (u) => {
    // Clean up previous admin doc subscription (if any)
    if (unsubAdminDoc) {
      unsubAdminDoc();
      unsubAdminDoc = null;
    }

    // Not signed in (or auth not ready yet)
    if (!u) {
      cb(false);
      return;
    }

    // Subscribe to admins allowlist doc. If the listener drops we fall back to
    // "not an admin" rather than leaving the flag at whatever it was, so a lost
    // connection hides admin controls instead of showing ones whose writes
    // would fail anyway.
    const ref = doc(db, "cohorts", COHORT_ID, "admins", u.uid);
    unsubAdminDoc = watch(
      "is-admin",
      ref,
      (snap) => cb(!!snap.exists() && snap.data()?.enabled === true),
      (err) => {
        cb(false);
        if (onError) onError(err);
      }
    );
  });

  // Return a single unsubscribe that cleans up both listeners
  return () => {
    if (unsubAdminDoc) unsubAdminDoc();
    unsubAuth();
  };
}