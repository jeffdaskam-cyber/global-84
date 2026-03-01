// src/lib/favorites.js
// Per-user favorite Explore items stored at members/{uid}/favorites/{exploreId}

import { db, COHORT_ID } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

function favoritesRef(uid) {
  return collection(db, "cohorts", COHORT_ID, "members", uid, "favorites");
}

/**
 * Subscribe to the current user's favorites.
 * Calls onChange with a Set of exploreId strings.
 * Returns an unsubscribe function.
 */
export function subscribeFavorites(onChange) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) {
    onChange(new Set());
    return () => {};
  }
  return onSnapshot(favoritesRef(uid), (snap) => {
    onChange(new Set(snap.docs.map((d) => d.id)));
  });
}

/**
 * Toggle a favorite on or off.
 * If currently favorited, shows a confirm dialog before removing.
 * Returns true if the action was completed, false if cancelled.
 */
export async function toggleFavorite(exploreId, isFavorited) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return false;

  const ref = doc(favoritesRef(uid), exploreId);

  if (isFavorited) {
    const confirmed = window.confirm("Remove this place from your favorites?");
    if (!confirmed) return false;
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { exploreId, createdAt: serverTimestamp() });
  }
  return true;
}
