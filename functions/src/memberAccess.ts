/**
 * memberAccess — callables for the approved roster and individual passwords.
 *
 * Administrators approve DU emails onto a roster, issue each member a unique
 * random temporary password for manual delivery, and can issue replacements.
 * Members finish setup by choosing their own password; completion is confirmed
 * server-side from Auth's password timestamp, never from a client claim.
 *
 * Authorization for credential administration: verified DU identity, a
 * non-revoked session, an enabled admins/{uid} entry, the caller's own access
 * record active and "ready", and (for issue/reset/re-enable) a sign-in within
 * the last five minutes. Legacy access never qualifies.
 *
 * Logging is limited to operation IDs, types, phases, and counts. Requests and
 * responses are never logged, since issue/reset responses carry a password.
 */

import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedCohort,
  isRecentAuth,
  isValidOperationId,
  isValidUid,
  normalizeDuEmail,
  parseRosterEmails,
} from "./memberAccessCore.js";
import {
  AccessOpError,
  accessRef,
  addRosterMembers as addRosterMembersOp,
  adminRef,
  completePasswordSetup,
  getCredentialOperationStatus as getStatusOp,
  markCredentialDelivered as markDeliveredOp,
  runCredentialOperation,
  setMemberAccess as setMemberAccessOp,
  toAccessRecord,
} from "./memberAccessOps.js";

const HTTPS_CODE_FOR: Record<string, ConstructorParameters<typeof HttpsError>[0]> = {
  "busy": "aborted",
  "retry": "unavailable",
  "not-found": "not-found",
  "not-on-roster": "not-found",
  "no-access": "permission-denied",
  "disabled": "permission-denied",
  "operation-owned-by-another-admin": "permission-denied",
  "operation-mismatch": "permission-denied",
  "operation-type-mismatch": "permission-denied",
};

function toHttpsError(err: unknown, label: string): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof AccessOpError) {
    return new HttpsError(HTTPS_CODE_FOR[err.code] ?? "failed-precondition", err.message, {
      reason: err.code,
      ...err.details,
    });
  }
  // Name and code only: messages from Auth can include the target email.
  logger.error(`memberAccess: ${label} failed`, {
    name: (err as Error)?.name,
    code: (err as { code?: unknown })?.code,
  });
  return new HttpsError("internal", "Something went wrong. Check the member's status before retrying.");
}

interface Caller {
  uid: string;
  email: string;
  token: DecodedIdToken;
}

/** Verified DU identity on a session that has not been revoked. */
async function verifiedCaller(request: CallableRequest): Promise<Caller> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const email = (request.auth.token.email || "").toLowerCase();
  if (request.auth.token.email_verified !== true || !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  // The callable framework verifies the token but does not check revocation.
  const header = request.rawRequest?.headers?.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  let token: DecodedIdToken;
  try {
    token = await getAuth().verifyIdToken(raw, true);
  } catch {
    throw new HttpsError("unauthenticated", "Your session has ended. Sign in again.");
  }
  if (token.uid !== request.auth.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return { uid: token.uid, email, token };
}

function requireCohort(data: Record<string, unknown>): string {
  if (!isAllowedCohort(data.cohortId)) throw new HttpsError("invalid-argument", "Unknown cohort.");
  return data.cohortId;
}

function requireOperationId(data: Record<string, unknown>): string {
  if (!isValidOperationId(data.operationId)) throw new HttpsError("invalid-argument", "A valid operationId is required.");
  return data.operationId;
}

async function requireCredentialAdmin(
  request: CallableRequest,
  cohortId: string,
  needsRecentAuth: boolean,
): Promise<Caller> {
  const caller = await verifiedCaller(request);
  const [adminSnap, accessSnap] = await Promise.all([
    adminRef(cohortId, caller.uid).get(),
    accessRef(cohortId, caller.uid).get(),
  ]);
  if (!adminSnap.exists || adminSnap.data()?.enabled !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  const access = toAccessRecord(accessSnap.data());
  if (!access || !access.active || access.credentialState !== "ready" ||
      access.uid !== caller.uid || access.email !== caller.email) {
    throw new HttpsError(
      "permission-denied",
      "Finish setting up your own password before managing member access.",
      { reason: "admin-not-ready" },
    );
  }
  if (needsRecentAuth && !isRecentAuth(caller.token.auth_time, Date.now())) {
    throw new HttpsError("failed-precondition", "Confirm your password to continue.", {
      reason: "recent-login-required",
    });
  }
  return caller;
}

function dataOf(request: CallableRequest): Record<string, unknown> {
  const data = request.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Invalid request.");
  }
  return data as Record<string, unknown>;
}

// ── Callables ──────────────────────────────────────────────────────────────────

export const addRosterMembers = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const operationId = requireOperationId(data);
    const parsed = parseRosterEmails(data.emails);
    if (!parsed) throw new HttpsError("invalid-argument", "Send 1 to 100 email addresses.");
    const caller = await requireCredentialAdmin(request, cohortId, false);
    return await addRosterMembersOp({
      cohortId,
      actorUid: caller.uid,
      emails: parsed.valid,
      invalid: parsed.invalid,
      operationId,
    });
  } catch (err) {
    throw toHttpsError(err, "addRosterMembers");
  }
});

export const issueMemberTemporaryPassword = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const operationId = requireOperationId(data);
    const email = normalizeDuEmail(data.email);
    if (!email) throw new HttpsError("invalid-argument", "A DU email is required.");
    const caller = await requireCredentialAdmin(request, cohortId, true);
    return await runCredentialOperation({ cohortId, actorUid: caller.uid, type: "issue", operationId, email });
  } catch (err) {
    throw toHttpsError(err, "issueMemberTemporaryPassword");
  }
});

export const resetMemberPassword = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const operationId = requireOperationId(data);
    if (!isValidUid(data.uid)) throw new HttpsError("invalid-argument", "A member uid is required.");
    const caller = await requireCredentialAdmin(request, cohortId, true);
    if (data.uid === caller.uid) {
      throw new HttpsError("failed-precondition", "Ask another administrator to replace your own password.", {
        reason: "self",
      });
    }
    return await runCredentialOperation({ cohortId, actorUid: caller.uid, type: "reset", operationId, uid: data.uid });
  } catch (err) {
    throw toHttpsError(err, "resetMemberPassword");
  }
});

export const markCredentialDelivered = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const operationId = requireOperationId(data);
    const caller = await requireCredentialAdmin(request, cohortId, false);
    return await markDeliveredOp({ cohortId, actorUid: caller.uid, operationId });
  } catch (err) {
    throw toHttpsError(err, "markCredentialDelivered");
  }
});

export const getCredentialOperationStatus = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const operationId = requireOperationId(data);
    await requireCredentialAdmin(request, cohortId, false);
    return await getStatusOp({ cohortId, operationId });
  } catch (err) {
    throw toHttpsError(err, "getCredentialOperationStatus");
  }
});

export const completeMyPasswordSetup = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const version = data.credentialVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
      throw new HttpsError("invalid-argument", "credentialVersion is required.");
    }
    const caller = await verifiedCaller(request);
    return await completePasswordSetup({ cohortId, uid: caller.uid, email: caller.email, credentialVersion: version });
  } catch (err) {
    throw toHttpsError(err, "completeMyPasswordSetup");
  }
});

export const setMemberAccess = onCall(async (request) => {
  try {
    const data = dataOf(request);
    const cohortId = requireCohort(data);
    const operationId = requireOperationId(data);
    if (!isValidUid(data.uid)) throw new HttpsError("invalid-argument", "A member uid is required.");
    if (typeof data.active !== "boolean") throw new HttpsError("invalid-argument", "active must be true or false.");
    // Turning access off is protective and needs no fresh sign-in; turning it
    // back on grants access, so it does.
    const caller = await requireCredentialAdmin(request, cohortId, data.active);
    return await setMemberAccessOp({ cohortId, actorUid: caller.uid, uid: data.uid, active: data.active, operationId });
  } catch (err) {
    throw toHttpsError(err, "setMemberAccess");
  }
});
