import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db, COHORT_ID } from "./firebase";
import { watch } from "./subscribe";

/**
 * Returns ref to cohorts/{cohortId}/members/{uid}
 */
export function memberDoc(uid) {
  return doc(db, "cohorts", COHORT_ID, "members", uid);
}

/**
 * Create the member profile on first login.
 * On subsequent logins, update only non-destructive fields (email, lastLoginAt).
 * DO NOT overwrite displayName that the user set in-app.
 */
export async function upsertMemberProfile(user) {
  if (!user?.uid) throw new Error("Missing user.");

  const ref = memberDoc(user.uid);
  const snap = await getDoc(ref);

  const emailLower = (user.email || "").toLowerCase();

  if (!snap.exists()) {
    // First time: initialize defaults
    await setDoc(ref, {
      uid: user.uid,
      email: emailLower,
      displayName: user.displayName || "Member",
      role: "member",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    return { created: true };
  }

  // Existing member: only update safe, non-destructive fields
  await updateDoc(ref, {
    email: emailLower,
    lastLoginAt: serverTimestamp(),
  });

  return { created: false };
}

/**
 * Subscribe to the current member doc in real-time
 */
export function subscribeMember(uid, cb, onError) {
  const ref = memberDoc(uid);
  return watch("member", ref, (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/**
 * Resolve the signed-in user's display name from their member doc, which is the
 * source of truth. The Auth profile can be stale or unset when a name was set
 * outside the app (e.g. edited directly in Firestore), which would otherwise
 * attribute their events and RSVPs to "Member".
 *
 * `fallback` is the label used only when no name is available anywhere — pass
 * "Admin" from admin-authored paths.
 */
export async function myDisplayName(fallback = "Member") {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  try {
    const snap = await getDoc(memberDoc(u.uid));
    if (snap.exists() && snap.data()?.displayName) return snap.data().displayName;
  } catch {
    // Fall back to the Auth profile below.
  }

  return u.displayName || fallback;
}

/**
 * Update safe profile fields only (must match Firestore rules)
 */
export async function updateMyProfile(uid, { displayName }) {
  const ref = memberDoc(uid);

  const patch = {};
  if (typeof displayName === "string") patch.displayName = displayName.trim();

  if (Object.keys(patch).length === 0) return;

  await updateDoc(ref, patch);

  // Keep Firebase Auth displayName in sync with the member profile so that
  // code paths reading auth.currentUser.displayName (RSVPs, event creation,
  // chat messages) get the user's real name instead of falling back to
  // "Member".
  if (typeof patch.displayName === "string" && auth.currentUser?.uid === uid) {
    try {
      await updateProfile(auth.currentUser, { displayName: patch.displayName });
    } catch {
      // Non-fatal: the member doc is still the source of truth.
    }
  }
}