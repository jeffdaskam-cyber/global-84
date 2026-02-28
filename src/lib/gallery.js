// src/lib/gallery.js
// Gallery feature: Firebase Storage uploads + Firestore metadata
// Mirrors the pattern used in chat.js and explore.js

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage, COHORT_ID } from "./firebase";

// ─── Firestore path ────────────────────────────────────────────────────────────
// cohorts/{cohortId}/photos/{photoId}
const photosCol = () =>
  collection(db, "cohorts", COHORT_ID, "photos");

// ─── Subscribe ─────────────────────────────────────────────────────────────────
/**
 * Real-time listener for all photos in the cohort.
 * Returns an unsubscribe function. Calls onData(photos[]) on every change.
 * Optionally filter by city: "singapore" | "vietnam" | null (all)
 */
export function subscribePhotos(onData, city = null) {
  let q = query(photosCol(), orderBy("createdAt", "desc"));
  if (city) {
    q = query(photosCol(), where("city", "==", city), orderBy("createdAt", "desc"));
  }

  return onSnapshot(q, (snap) => {
    const photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onData(photos);
  });
}

// ─── Upload ────────────────────────────────────────────────────────────────────
/**
 * Upload a photo file to Firebase Storage, then write metadata to Firestore.
 *
 * @param {File}   file         - The image File object from <input type="file">
 * @param {object} meta         - { city, uploaderUid, uploaderName }
 * @param {function} onProgress - Called with 0–100 as upload progresses
 * @returns {Promise<string>}   - Resolves with the new Firestore doc ID
 */
export async function uploadPhoto(file, { city, uploaderUid, uploaderName }, onProgress) {
  // Validate file type client-side (Storage rules enforce server-side too)
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Photos must be under 10 MB.");
  }

  // Build a unique storage path: photos/{cohortId}/{uid}/{timestamp}_{filename}
  const ext = file.name.split(".").pop();
  const timestamp = Date.now();
  const storagePath = `photos/${COHORT_ID}/${uploaderUid}/${timestamp}.${ext}`;
  const storageRef = ref(storage, storagePath);

  // Upload with progress tracking
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      reject,
      () => resolve()
    );
  });

  // Get public download URL
  const url = await getDownloadURL(storageRef);

  // Write metadata to Firestore
  const docRef = await addDoc(photosCol(), {
    url,
    storagePath,
    city,                  // "singapore" | "vietnam"
    uploaderUid,
    uploaderName,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

// ─── Likes ─────────────────────────────────────────────────────────────────────
/**
 * Toggle a ❤️ reaction on a photo for the current user.
 * Likes are stored as an array of uids on the photo doc: likes: [uid, uid, ...]
 * Uses Firestore arrayUnion/arrayRemove so concurrent toggles are safe.
 *
 * @param {string} photoId  - Firestore doc ID
 * @param {string} uid      - Current user's uid
 * @param {boolean} liked   - Whether the user currently likes this photo
 */
export async function toggleLike(photoId, uid, liked) {
  const photoRef = doc(db, "cohorts", COHORT_ID, "photos", photoId);
  await updateDoc(photoRef, {
    likes: liked ? arrayRemove(uid) : arrayUnion(uid),
  });
}

// ─── Delete ────────────────────────────────────────────────────────────────────
/**
 * Admin-only: delete a photo from both Storage and Firestore.
 * Firestore rules enforce that only admins can delete.
 *
 * @param {object} photo - Full photo doc including { id, storagePath }
 */
export async function deletePhoto(photo) {
  // Delete from Storage first
  const storageRef = ref(storage, photo.storagePath);
  await deleteObject(storageRef);

  // Then delete Firestore metadata doc
  await deleteDoc(doc(db, "cohorts", COHORT_ID, "photos", photo.id));
}
