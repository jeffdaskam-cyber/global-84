import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, COHORT_ID } from "./firebase";

/**
 * Returns ref to cohorts/{cohortId}/members/{uid}
 */
export function memberDoc(uid) {
  return doc(db, "cohorts", COHORT_ID, "members", uid);
}

/**
 * Create the member profile on first login.
 * On subsequent logins, update only non-destructive fields (email, lastLoginAt).
 * DO NOT overwrite displayName/defaultCity that the user set in-app.
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
      defaultCity: "Singapore",
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
export function subscribeMember(uid, cb) {
  const ref = memberDoc(uid);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/**
 * Update safe profile fields only (must match Firestore rules)
 */
export async function updateMyProfile(uid, { displayName, defaultCity }) {
  const ref = memberDoc(uid);

  const patch = {};
  if (typeof displayName === "string") patch.displayName = displayName.trim();
  if (typeof defaultCity === "string") patch.defaultCity = defaultCity;

  if (Object.keys(patch).length === 0) return;

  await updateDoc(ref, patch);
}