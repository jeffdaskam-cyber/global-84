/**
 * deletePhoto — Firebase Callable Cloud Function
 *
 * Admin-only deletion of a gallery photo. Storage security rules restrict
 * object deletes to the file's owner, so admins cannot delete other members'
 * photos directly from the client. This callable runs with Admin SDK
 * privileges (which bypass security rules): it verifies the caller is an
 * enabled admin in the cohort allowlist, then removes both the Storage object
 * and the Firestore metadata doc.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";

// Initialize the Admin SDK once (shared across functions in this codebase).
if (getApps().length === 0) {
  initializeApp();
}

// Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN and the Firestore/Storage rules.
const ALLOWED_EMAIL_DOMAIN = "du.edu";

export const deletePhoto = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  // Verified member of the allowed domain (defense in depth; admin docs only
  // exist for real members, but this keeps the check consistent everywhere).
  const email = (auth.token.email || "").toLowerCase();
  if (auth.token.email_verified !== true || !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const cohortId = request.data?.cohortId;
  const photoId = request.data?.photoId;
  if (typeof cohortId !== "string" || !cohortId ||
      typeof photoId !== "string" || !photoId) {
    throw new HttpsError("invalid-argument", "cohortId and photoId are required.");
  }

  const db = getFirestore();

  // Verify the caller is an enabled admin of this cohort.
  const adminSnap = await db.doc(`cohorts/${cohortId}/admins/${auth.uid}`).get();
  if (!adminSnap.exists || adminSnap.data()?.enabled !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const photoRef = db.doc(`cohorts/${cohortId}/photos/${photoId}`);
  const photoSnap = await photoRef.get();
  if (!photoSnap.exists) {
    // Already gone — treat as success so the UI stays consistent.
    return { deleted: true };
  }

  const storagePath = photoSnap.data()?.storagePath;

  // Delete the Storage object first (best-effort), then the metadata doc.
  // If the object is already missing we still remove the doc so the gallery
  // doesn't show a broken entry.
  if (typeof storagePath === "string" && storagePath) {
    try {
      await getStorage().bucket().file(storagePath).delete();
    } catch (err) {
      logger.warn("deletePhoto: storage object delete failed", { storagePath, err });
    }
  }

  await photoRef.delete();
  return { deleted: true };
});
