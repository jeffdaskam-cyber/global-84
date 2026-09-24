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
  const originalPath = photoSnap.data()?.originalPath;
  const uploaderUid = photoSnap.data()?.uploaderUid;

  // Only delete Storage objects whose paths match the canonical layout for
  // this photo's uploader: photos/{cohortId}/{uploaderUid}/... for the display
  // copy and originals/{cohortId}/{uploaderUid}/... for the full-res original.
  //
  // The Firestore `photos` rules constrain these paths but a client could
  // still submit arbitrary values, so this Admin SDK call (which bypasses
  // Storage security rules) must not trust them blindly — otherwise a crafted
  // gallery entry could point at another user's private object and an admin
  // deleting it would destroy that object. An unexpected path is skipped, but
  // the (bogus) metadata doc is still removed.
  await deleteIfSafe(storagePath, `photos/${cohortId}/${uploaderUid}/`, uploaderUid);

  // Images the client couldn't downscale record the display copy as their own
  // original; that object is already gone.
  if (originalPath && originalPath !== storagePath) {
    await deleteIfSafe(originalPath, `originals/${cohortId}/${uploaderUid}/`, uploaderUid);
  }

  await photoRef.delete();
  return { deleted: true };
});

async function deleteIfSafe(
  path: unknown,
  expectedPrefix: string,
  uploaderUid: unknown
): Promise<void> {
  const pathIsSafe =
    typeof path === "string" &&
    typeof uploaderUid === "string" &&
    path.startsWith(expectedPrefix);

  if (!pathIsSafe) {
    logger.warn("deletePhoto: skipping storage delete for unexpected path", {
      path,
      expectedPrefix,
    });
    return;
  }

  try {
    await getStorage().bucket().file(path).delete();
  } catch (err) {
    // A 404 means the object is already gone — proceed to remove the doc.
    // Any other error (transient/service failure) must NOT delete the
    // metadata: that would orphan the object and destroy the only record
    // the moderation flow could use to retry. Surface it so the client can
    // retry the whole operation.
    const code = (err as { code?: number }).code;
    if (code === 404) {
      logger.info("deletePhoto: storage object already gone", { path });
    } else {
      logger.error("deletePhoto: storage object delete failed", { path, err });
      throw new HttpsError("internal", "Could not delete the photo file. Please try again.");
    }
  }
}
