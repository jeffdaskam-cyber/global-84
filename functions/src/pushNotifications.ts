/**
 * pushNotifications.ts — Firestore-triggered push notifications (FCM).
 *
 * Two triggers fire automatically when content is created:
 *   - onAnnouncementCreated: cohorts/{cohortId}/announcements/{announcementId}
 *   - onEventCreated:        cohorts/{cohortId}/events/{eventId}
 *
 * Each one gathers every cohort member's saved FCM tokens and sends a push via
 * the Firebase Admin Messaging SDK. Because these are Firestore triggers, the
 * client code that creates announcements/events needs no changes at all — the
 * notification is "hooked" onto the existing write.
 *
 * Stale tokens (device reinstalled, browser data cleared, etc.) are cleaned up
 * reactively: when a send reports the token is no longer registered, we delete
 * that token doc.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as logger from "firebase-functions/logger";

// Initialize the Admin SDK once (shared across functions in this codebase).
if (getApps().length === 0) {
  initializeApp();
}

// FCM error codes that mean the token is dead and its doc should be removed.
const DEAD_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

interface TokenDoc {
  token: string;
  ref: FirebaseFirestore.DocumentReference;
}

/**
 * Collect every FCM token doc across all members of a cohort. Iterating the
 * members subcollection (rather than a collection-group query) keeps this
 * index-free — fine at cohort scale.
 */
async function collectCohortTokens(
  db: FirebaseFirestore.Firestore,
  cohortId: string,
): Promise<TokenDoc[]> {
  const membersSnap = await db.collection(`cohorts/${cohortId}/members`).get();

  const perMember = await Promise.all(
    membersSnap.docs.map(async (member) => {
      const tokensSnap = await member.ref.collection("fcmTokens").get();
      return tokensSnap.docs
        .map((d) => ({ token: d.data().token as string, ref: d.ref }))
        .filter((t): t is TokenDoc => typeof t.token === "string" && t.token.length > 0);
    }),
  );

  return perMember.flat();
}

/**
 * Send a notification to every cohort token and clean up any that FCM reports
 * as dead. Skips (and logs) when there are no tokens.
 */
async function sendToCohort(
  db: FirebaseFirestore.Firestore,
  cohortId: string,
  notification: { title: string; body: string },
  data: { url: string },
): Promise<void> {
  const tokenDocs = await collectCohortTokens(db, cohortId);

  if (tokenDocs.length === 0) {
    logger.info("push: no tokens for cohort, skipping send", { cohortId });
    return;
  }

  const tokens = tokenDocs.map((t) => t.token);

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification,
    // Data must be string→string. The service worker reads `url` to deep-link.
    data,
  });

  // Walk the responses (aligned with the `tokens` array order) and delete the
  // doc for any token that is no longer valid.
  const deletions: Promise<FirebaseFirestore.WriteResult>[] = [];
  response.responses.forEach((res, i) => {
    if (!res.success) {
      const code = res.error?.code;
      if (code && DEAD_TOKEN_ERRORS.has(code)) {
        deletions.push(tokenDocs[i].ref.delete());
      } else {
        logger.warn("push: send failed for a token", { cohortId, code });
      }
    }
  });

  if (deletions.length > 0) {
    await Promise.all(deletions);
    logger.info("push: cleaned up stale tokens", {
      cohortId,
      removed: deletions.length,
    });
  }

  logger.info("push: sent", {
    cohortId,
    success: response.successCount,
    failure: response.failureCount,
  });
}

/** Trim a body string to a notification-friendly snippet. */
function snippet(text: string, max = 120): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// ── New announcement → push to everyone ──────────────────────────────────────
export const onAnnouncementCreated = onDocumentCreated(
  "cohorts/{cohortId}/announcements/{announcementId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const cohortId = event.params.cohortId;

    await sendToCohort(
      getFirestore(),
      cohortId,
      {
        title: (data.title as string) || "New announcement",
        body: snippet(data.body as string),
      },
      { url: "/" },
    );
  },
);

// ── New event → push to everyone ─────────────────────────────────────────────
export const onEventCreated = onDocumentCreated(
  "cohorts/{cohortId}/events/{eventId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const cohortId = event.params.cohortId;

    const eventTitle = (data.title as string) || "an event";

    await sendToCohort(
      getFirestore(),
      cohortId,
      {
        title: `New Event: ${eventTitle}`,
        body: snippet((data.locationName as string) || (data.description as string) || ""),
      },
      { url: "/events" },
    );
  },
);
