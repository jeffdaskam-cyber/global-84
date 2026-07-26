/**
 * onFavoriteChange.ts — keeps the denormalized `favoriteCount` on each Explore
 * item in sync with the per-member favorite docs.
 *
 * Source of truth stays at cohorts/{cohortId}/members/{uid}/favorites/{exploreId}.
 * This trigger just maintains a running total on the parent explore item so the
 * client can show a "Cohort Favorite" tag without counting docs on every render.
 *
 * Why a Cloud Function rather than a client-side counter write: the Admin SDK
 * bypasses Firestore Rules, so `explore/{itemId}` stays admin-write-only for
 * clients and the field cannot be tampered with. The trigger is also guaranteed
 * to fire on the write, so a client crashing mid-toggle cannot desync the count.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

// Initialize the Admin SDK once (shared across functions in this codebase).
if (getApps().length === 0) {
  initializeApp();
}

// gRPC status code returned when the target doc does not exist.
const NOT_FOUND = 5;

export const onFavoriteChange = onDocumentWritten(
  "cohorts/{cohortId}/members/{uid}/favorites/{exploreId}",
  async (event) => {
    const before = event.data?.before.exists ?? false;
    const after = event.data?.after.exists ?? false;

    // Favorite docs are only ever created or deleted, never edited — so an
    // existence-unchanged write is a no-op for the counter.
    if (before === after) return;

    const delta = after ? 1 : -1;
    const { cohortId, exploreId } = event.params;

    const exploreRef = getFirestore()
      .collection("cohorts").doc(cohortId)
      .collection("explore").doc(exploreId);

    try {
      await exploreRef.update({ favoriteCount: FieldValue.increment(delta) });
    } catch (err) {
      // An admin can delete an explore item while members still hold favorite
      // docs pointing at it. There is nothing to count then — log and stop
      // rather than letting the trigger retry a write that can never succeed.
      if ((err as { code?: number }).code === NOT_FOUND) {
        logger.warn("favoriteCount: explore item not found, skipping", {
          cohortId,
          exploreId,
          delta,
        });
        return;
      }
      throw err;
    }

    logger.info("favoriteCount: updated", { cohortId, exploreId, delta });
  },
);
