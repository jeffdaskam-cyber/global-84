import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, COHORT_ID } from "./firebase";

export function subscribeIsAdmin(cb) {
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

    // Subscribe to admins allowlist doc
    const ref = doc(db, "cohorts", COHORT_ID, "admins", u.uid);
    unsubAdminDoc = onSnapshot(ref, (snap) => {
      cb(!!snap.exists() && snap.data()?.enabled === true);
    });
  });

  // Return a single unsubscribe that cleans up both listeners
  return () => {
    if (unsubAdminDoc) unsubAdminDoc();
    unsubAuth();
  };
}