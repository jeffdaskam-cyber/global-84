// src/lib/tripDocs.js
// Shared trip-planning documents — PDFs from program leadership that every
// cohort member can read. Unlike userFiles.js (per-user private storage) these
// live in one cohort-wide folder and are visible to everyone.

import {
  collection,
  doc,
  query,
  orderBy,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { auth, db, storage, COHORT_ID } from "./firebase.js";
import { myDisplayName } from "./members.js";
import { watch } from "./subscribe.js";

// ── Constants ──────────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ACCEPTED_TYPE = "application/pdf";

// ── Ref helpers ────────────────────────────────────────────────────────────────

function tripDocsCol() {
  return collection(db, "cohorts", COHORT_ID, "tripDocs");
}

function tripDocRef(docId) {
  return doc(db, "cohorts", COHORT_ID, "tripDocs", docId);
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateTripDoc(file) {
  if (!file) return "No file selected.";
  if (file.type !== ACCEPTED_TYPE) return "Only PDF files are allowed.";
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`;
  }
  return null; // valid
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── List ───────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the cohort's shared documents, newest first.
 * Returns an unsubscribe function.
 */
export function subscribeTripDocs(callback, onError) {
  const q = query(tripDocsCol(), orderBy("createdAt", "desc"));
  return watch("trip-docs", q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

// ── Upload ─────────────────────────────────────────────────────────────────────

/**
 * Upload a PDF to the shared cohort folder and save its metadata.
 *
 * The object is stored with a `Content-Disposition: attachment` header so the
 * download URL saves the file instead of streaming it into a browser PDF
 * viewer. That matters on the trip itself: a saved file stays readable when the
 * connection drops, a half-loaded viewer does not.
 *
 * @param {File} file - The PDF to upload
 * @param {string} city - "singapore", "vietnam", or "all"
 * @param {function} onProgress - Called with progress 0–100 during upload
 * @returns {Promise<string>} - Resolves with the Firestore document ID
 */
export function uploadTripDoc(file, city, onProgress) {
  return new Promise((resolve, reject) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      reject(new Error("Not signed in."));
      return;
    }

    // Deduplicate filenames the same way userFiles.js does
    const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
    const baseName = file.name.includes(".")
      ? file.name.slice(0, file.name.lastIndexOf("."))
      : file.name;
    const storageName = `${baseName}_${Date.now()}${ext}`;
    const storagePath = `tripDocs/${COHORT_ID}/${storageName}`;

    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: ACCEPTED_TYPE,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, "")}"`,
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        if (onProgress) onProgress(pct);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const uploaderName = await myDisplayName();
          const docRef = await addDoc(tripDocsCol(), {
            fileName: file.name,       // original name shown in UI
            storageName,               // deduplicated name used in Storage
            fileSize: file.size,
            storagePath,
            downloadUrl,
            city: city || "all",
            uploadedBy: uid,
            uploaderName,              // denormalized: <10 docs, no profile lookup
            createdAt: serverTimestamp(),
          });
          resolve(docRef.id);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Delete a document from both Storage and Firestore (uploader or admin —
 * enforced by Firestore rules). If the object is already gone we still clean up
 * the metadata doc so the list doesn't keep a dead entry.
 */
export async function deleteTripDoc(tripDoc) {
  try {
    await deleteObject(ref(storage, tripDoc.storagePath));
  } catch (err) {
    if (err.code !== "storage/object-not-found") throw err;
  }
  await deleteDoc(tripDocRef(tripDoc.id));
}
