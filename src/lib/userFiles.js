import {
  collection,
  doc,
  onSnapshot,
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
import { db, storage, COHORT_ID } from "./firebase.js";

// ── Constants ──────────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

// ── Ref helpers ────────────────────────────────────────────────────────────────

function filesColRef(uid) {
  return collection(db, "cohorts", COHORT_ID, "members", uid, "files");
}

function fileDocRef(uid, fileId) {
  return doc(db, "cohorts", COHORT_ID, "members", uid, "files", fileId);
}

function storageFileRef(uid, fileName) {
  return ref(storage, `userFiles/${uid}/${fileName}`);
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Only PDF, JPG, and PNG files are allowed.";
  }
  return null; // valid
}

// ── File type helpers ──────────────────────────────────────────────────────────

export function fileTypeLabel(fileType) {
  if (fileType === "application/pdf") return "PDF";
  if (fileType === "image/jpeg") return "JPG";
  if (fileType === "image/png") return "PNG";
  return fileType?.split("/")[1]?.toUpperCase() || "FILE";
}

export function fileTypeIcon(fileType) {
  if (fileType === "application/pdf") return "📄";
  if (fileType?.startsWith("image/")) return "🖼️";
  return "📎";
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Upload ─────────────────────────────────────────────────────────────────────

/**
 * Upload a file to Firebase Storage and save metadata to Firestore.
 *
 * @param {string} uid - The user's Firebase Auth UID
 * @param {File} file - The File object to upload
 * @param {function} onProgress - Called with progress 0–100 during upload
 * @returns {Promise<string>} - Resolves with the Firestore document ID
 */
export function uploadFile(uid, file, onProgress) {
  return new Promise((resolve, reject) => {
    // Deduplicate filenames by appending a timestamp
    const ext = file.name.includes(".")
      ? "." + file.name.split(".").pop()
      : "";
    const baseName = file.name.includes(".")
      ? file.name.slice(0, file.name.lastIndexOf("."))
      : file.name;
    const uniqueName = `${baseName}_${Date.now()}${ext}`;

    const storageRef = storageFileRef(uid, uniqueName);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
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
          const docRef = await addDoc(filesColRef(uid), {
            fileName: file.name, // original name shown in UI
            storageName: uniqueName, // deduplicated name used in Storage
            fileSize: file.size,
            fileType: file.type,
            storagePath: `userFiles/${uid}/${uniqueName}`,
            downloadUrl,
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

// ── List ───────────────────────────────────────────────────────────────────────

/**
 * Subscribe to a user's file list, newest first.
 * Returns an unsubscribe function.
 */
export function subscribeFiles(uid, callback) {
  const q = query(filesColRef(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Delete a file from both Storage and Firestore.
 * Attempts Storage delete first; if the file is already gone (e.g. manually
 * deleted from Console) we still clean up the Firestore doc.
 */
export async function deleteFile(uid, fileId, storagePath) {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    // object-not-found is fine — still delete the metadata doc
    if (err.code !== "storage/object-not-found") {
      throw err;
    }
  }
  await deleteDoc(fileDocRef(uid, fileId));
}
