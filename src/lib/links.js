import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, COHORT_ID } from "./firebase.js";

// ── Constants ──────────────────────────────────────────────────────────────────

export const MAX_URL_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 200;

// ── Ref helpers ────────────────────────────────────────────────────────────────

function linksCol() {
  return collection(db, "cohorts", COHORT_ID, "links");
}

function linkDoc(linkId) {
  return doc(db, "cohorts", COHORT_ID, "links", linkId);
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateLink({ url, description }) {
  const trimmedUrl = (url || "").trim();
  const trimmedDesc = (description || "").trim();
  if (!trimmedUrl) return "URL is required.";
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    return "URL must start with http:// or https://";
  }
  if (trimmedUrl.length > MAX_URL_LENGTH) {
    return `URL is too long (max ${MAX_URL_LENGTH} characters).`;
  }
  if (!trimmedDesc) return "Description is required.";
  if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
    return `Description is too long (max ${MAX_DESCRIPTION_LENGTH} characters).`;
  }
  return null; // valid
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the cohort's shared links, newest first.
 * Returns an unsubscribe function.
 */
export function subscribeLinks(callback) {
  const q = query(linksCol(), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Add a link. Any signed-in cohort member may add.
 */
export async function addLink({ url, description }) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const error = validateLink({ url, description });
  if (error) throw new Error(error);

  const ref = await addDoc(linksCol(), {
    url: url.trim(),
    description: description.trim(),
    createdByUid: u.uid,
    createdByName: u.displayName || "Member",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete a link (creator or admin — enforced by Firestore rules).
 */
export async function deleteLink(linkId) {
  await deleteDoc(linkDoc(linkId));
}
