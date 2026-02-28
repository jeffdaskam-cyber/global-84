import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { auth, db, COHORT_ID } from "./firebase";

// ─── Collection refs ──────────────────────────────────────────────────────────

export function cohortMessagesCol() {
  return collection(db, "cohorts", COHORT_ID, "messages");
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Real-time listener for the last 100 cohort messages, oldest-first.
 * Returns an unsubscribe function.
 */
export function subscribeCohortChat(cb) {
  const q = query(cohortMessagesCol(), orderBy("createdAt", "asc"), limitToLast(100));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ─── Send ─────────────────────────────────────────────────────────────────────

/**
 * Post a new message to the cohort chat.
 * Throws if the user is not signed in or the message is empty.
 */
export async function sendCohortMessage(text) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");
  if (trimmed.length > 1000) throw new Error("Message too long (max 1000 characters).");

  // Pull the member's display name from their profile for consistent attribution
  const memberSnap = await getDoc(doc(db, "cohorts", COHORT_ID, "members", user.uid));
  const displayName = memberSnap.exists()
    ? memberSnap.data()?.displayName || "Member"
    : "Member";

  await addDoc(cohortMessagesCol(), {
    text: trimmed,
    createdAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByName: displayName,
  });
}

// ─── Delete (admin only — enforced by Firestore rules) ───────────────────────

export async function deleteCohortMessage(messageId) {
  await deleteDoc(doc(cohortMessagesCol(), messageId));
}
