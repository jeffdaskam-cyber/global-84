// src/lib/gallery.js
// Gallery feature: Firebase Storage uploads + Firestore metadata
// Mirrors the pattern used in chat.js and explore.js

import {
  collection,
  addDoc,
  doc,
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
import { httpsCallable } from "firebase/functions";
import { db, storage, functions, COHORT_ID } from "./firebase";
import { watch } from "./subscribe";
import { downscaleImage } from "./images";

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
export function subscribePhotos(onData, city = null, onError) {
  let q = query(photosCol(), orderBy("createdAt", "desc"));
  if (city) {
    q = query(photosCol(), where("city", "==", city), orderBy("createdAt", "desc"));
  }

  return watch("photos", q, (snap) => {
    const photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onData(photos);
  }, onError);
}

// ─── Upload ────────────────────────────────────────────────────────────────────
// Originals are kept for downloads (travel books need print resolution). The
// display copy is what the gallery renders; the original is never shown in the
// grid and is only fetched when a member downloads.
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

/**
 * Upload a photo file to Firebase Storage, then write metadata to Firestore.
 *
 * The downscaled display copy is uploaded first and the doc is written as soon
 * as it lands, so the photo shows up in the gallery exactly as fast as before.
 * The untouched original (EXIF intact) follows in the background; if that
 * fails the photo stays and downloads fall back to the display copy.
 *
 * @param {File}   file         - The image File object from <input type="file">
 * @param {object} meta         - { city, uploaderUid, uploaderName }
 * @param {function} onProgress - Called with 0–100 as the display copy uploads
 * @param {object} [options]
 * @param {function} [options.onOriginalSaving] - Called with true when the
 *   background original upload starts and false when it settles.
 * @returns {Promise<string>}   - Resolves with the new Firestore doc ID
 */
export async function uploadPhoto(
  file,
  { city, uploaderUid, uploaderName },
  onProgress,
  { onOriginalSaving } = {}
) {
  // Validate file type client-side (Storage rules enforce server-side too)
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  // Shrink before the size check, not after: a 15 MB photo off a phone is well
  // under the limit once resized, and rejecting it first would send the member
  // away to compress it by hand. If downscaling fails it returns the original,
  // and the check below still catches genuinely oversized files.
  const upload = await downscaleImage(file);

  if (upload.size > 10 * 1024 * 1024) {
    throw new Error("Photos must be under 10 MB.");
  }

  // Build a unique storage path: photos/{cohortId}/{uid}/{timestamp}.{ext}
  const ext = upload.name.split(".").pop();
  const timestamp = Date.now();
  const storagePath = `photos/${COHORT_ID}/${uploaderUid}/${timestamp}.${ext}`;
  const storageRef = ref(storage, storagePath);

  // Upload with progress tracking
  await uploadWithProgress(storageRef, upload, onProgress);

  // Get public download URL
  const url = await getDownloadURL(storageRef);

  // downscaleImage hands back the very same File when it could not (or did not
  // need to) shrink it. The display copy then already is the original, so
  // record that on the doc instead of uploading the same bytes twice.
  const displayIsOriginal = upload === file;

  // Write metadata to Firestore
  const docRef = await addDoc(photosCol(), {
    url,
    storagePath,
    city,                  // "singapore" | "vietnam"
    uploaderUid,
    uploaderName,
    createdAt: serverTimestamp(),
    // Lets zip downloads size their parts when there's no original.
    displaySize: upload.size,
    ...(displayIsOriginal && {
      originalPath: storagePath,
      originalUrl: url,
      originalSize: file.size,
      originalContentType: file.type,
    }),
  });

  if (!displayIsOriginal) {
    if (file.size > MAX_ORIGINAL_BYTES) {
      console.warn("Original over 25 MB; keeping only the display copy.", {
        photoId: docRef.id,
        size: file.size,
      });
    } else {
      // Deliberately not awaited: the caller's upload is done once the photo is
      // in the gallery. A slow trip network only delays the full-res copy.
      onOriginalSaving?.(true);
      saveOriginal(docRef, file, uploaderUid, timestamp)
        .catch((err) => {
          console.warn("Full-resolution upload failed; downloads will use the display copy.", err);
        })
        .finally(() => onOriginalSaving?.(false));
    }
  }

  return docRef.id;
}

function uploadWithProgress(storageRef, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: blob.type,
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
}

/**
 * Upload the untouched original next to the display copy and record it on the
 * photo doc. Same timestamp as the display copy so the pair is easy to match.
 */
async function saveOriginal(photoRef, file, uploaderUid, timestamp) {
  const originalExt = extensionFor(file);
  const originalPath = `originals/${COHORT_ID}/${uploaderUid}/${timestamp}.${originalExt}`;
  const originalRef = ref(storage, originalPath);

  await uploadWithProgress(originalRef, file);
  const originalUrl = await getDownloadURL(originalRef);

  try {
    await updateDoc(photoRef, {
      originalPath,
      originalUrl,
      originalSize: file.size,
      originalContentType: file.type,
    });
  } catch (err) {
    // Most likely the photo was deleted while its original was still
    // uploading. Don't leave an orphaned full-res file behind.
    await deleteObject(originalRef).catch(() => {});
    throw err;
  }
}

function extensionFor(file) {
  const fromName = file.name?.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  const fromType = file.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg");
  return /^[a-z0-9]{1,5}$/.test(fromType || "") ? fromType : "jpg";
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
 *
 * Storage security rules restrict object deletes to the file's owner, so an
 * admin cannot delete another member's photo directly from the client. This
 * calls the `deletePhoto` Cloud Function, which verifies the caller is an
 * admin and removes both the Storage object and the Firestore metadata doc
 * with Admin SDK privileges.
 *
 * @param {object} photo - Full photo doc including { id }
 */
export async function deletePhoto(photo) {
  const call = httpsCallable(functions, "deletePhoto");
  await call({ cohortId: COHORT_ID, photoId: photo.id });
}
