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

// ─── Collection ref ───────────────────────────────────────────────────────────

export function eventMessagesCol(eventId) {
  return collection(db, "cohorts", COHORT_ID, "events", eventId, "messages");
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Real-time listener for the last 50 messages on an event, oldest-first.
 * Returns an unsubscribe function.
 */
export function subscribeEventChat(eventId, cb) {
  const q = query(
    eventMessagesCol(eventId),
    orderBy("createdAt", "asc"),
    limitToLast(50)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ─── Send ─────────────────────────────────────────────────────────────────────

/**
 * Post a message to an event's discussion thread.
 * Throws if the user is not signed in or the message is empty.
 */
export async function sendEventMessage(eventId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");
  if (trimmed.length > 1000) throw new Error("Message too long (max 1000 characters).");

  // Pull display name from member profile for consistent attribution
  const memberSnap = await getDoc(doc(db, "cohorts", COHORT_ID, "members", user.uid));
  const displayName = memberSnap.exists()
    ? memberSnap.data()?.displayName || "Member"
    : "Member";

  await addDoc(eventMessagesCol(eventId), {
    text: trimmed,
    createdAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByName: displayName,
  });
}

// ─── Delete (admin only — enforced by Firestore rules) ───────────────────────

export async function deleteEventMessage(eventId, messageId) {
  await deleteDoc(doc(eventMessagesCol(eventId), messageId));
}
