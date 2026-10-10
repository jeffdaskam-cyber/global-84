/**
 * memberAccessOps — Firestore and Auth operations behind member access.
 *
 * Shared by the callables in memberAccess.ts and the trusted operator script
 * (functions/scripts/memberAccessOperator.ts), so admin bootstrap and recovery
 * run exactly the same issuance and reconciliation logic as the app.
 *
 * Data layout (all server-owned; clients never write these):
 *   cohorts/{c}/access/{uid}                 safe access state, rules-readable by its owner
 *   cohorts/{c}/roster/{emailLower}          admin-only approval and delivery status
 *   cohorts/{c}/credentialOperations/{id}    private operation log, no client access
 *   cohorts/{c}/admins/{uid}                 admin allowlist, readable by its owner
 *   cohorts/{c}/programLeaders/{uid}         Program Leader allowlist, readable by its owner
 *
 * Firebase Auth and Firestore cannot be updated atomically together, so every
 * credential operation is written as a sequence that is safe to stop at any
 * point: the access record goes restrictive ("issuing") before the password
 * changes, and only becomes "temporary" after Auth reports the new password's
 * timestamp. A stop in between leaves the member locked out with a recoverable
 * operation record, never with a usable but unrecorded credential.
 *
 * Passwords exist only in local variables here and in the issuing admin's
 * response. They are never logged, stored, or returned on a retry.
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp, DocumentData } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  AccessRecord,
  AuthAccountSummary,
  CREDENTIAL_STATES,
  CredentialState,
  MemberRole,
  OPERATION_LEASE_MS,
  OperationPhase,
  OperationRecord,
  OperationType,
  accessAllowsTripData,
  checkIssueEligibility,
  checkResetEligibility,
  evaluateCompletion,
  generateTemporaryPassword,
  leaseIsHeld,
  planOperationRequest,
  planRoleChange,
  reviewFlagsForAccount,
} from "./memberAccessCore.js";
import { lookupAccountPasswordState, PasswordLookupError } from "./authPasswordLookup.js";

if (getApps().length === 0) {
  initializeApp();
}

export class AccessOpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const db = () => getFirestore();

export const accessRef = (cohortId: string, uid: string) =>
  db().doc(`cohorts/${cohortId}/access/${uid}`);
export const rosterRef = (cohortId: string, email: string) =>
  db().doc(`cohorts/${cohortId}/roster/${email}`);
export const operationRef = (cohortId: string, operationId: string) =>
  db().doc(`cohorts/${cohortId}/credentialOperations/${operationId}`);
export const adminRef = (cohortId: string, uid: string) =>
  db().doc(`cohorts/${cohortId}/admins/${uid}`);
export const programLeaderRef = (cohortId: string, uid: string) =>
  db().doc(`cohorts/${cohortId}/programLeaders/${uid}`);

export function toAccessRecord(data: DocumentData | undefined): AccessRecord | null {
  if (!data) return null;
  const state = typeof data.credentialState === "string" && CREDENTIAL_STATES.has(data.credentialState) ?
    data.credentialState as CredentialState :
    "error";
  return {
    uid: String(data.uid ?? ""),
    email: String(data.email ?? ""),
    active: data.active === true,
    credentialState: state,
    credentialVersion: typeof data.credentialVersion === "number" ? data.credentialVersion : 0,
    passwordBaselineMs: typeof data.passwordBaselineMs === "number" ? data.passwordBaselineMs : null,
    legacyUntilMs: data.legacyUntil instanceof Timestamp ? data.legacyUntil.toMillis() : null,
    activeOperationId: typeof data.activeOperationId === "string" ? data.activeOperationId : null,
    leaseExpiresMs: typeof data.leaseExpiresMs === "number" ? data.leaseExpiresMs : null,
  };
}

function toOperationRecord(data: DocumentData | undefined): OperationRecord | null {
  if (!data) return null;
  return {
    type: data.type,
    callerUid: String(data.callerUid ?? ""),
    phase: data.phase as OperationPhase,
    targetUid: data.targetUid ?? null,
    targetEmail: data.targetEmail ?? null,
    credentialVersion: typeof data.credentialVersion === "number" ? data.credentialVersion : null,
  };
}

export function summarizeAccount(user: UserRecord): AuthAccountSummary {
  return {
    uid: user.uid,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    providerIds: user.providerData.map((p) => p.providerId),
  };
}

async function getUserOrNull(lookup: () => Promise<UserRecord>): Promise<UserRecord | null> {
  try {
    return await lookup();
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return null;
    throw err;
  }
}

/** True when this uid/email may read trip data in the cohort right now. */
export async function hasUsableTripAccess(
  cohortId: string,
  uid: string,
  email: string | undefined,
): Promise<boolean> {
  const snap = await accessRef(cohortId, uid).get();
  const access = toAccessRecord(snap.data());
  if (!access || access.uid !== uid) return false;
  if (access.email !== (email || "").toLowerCase()) return false;
  return accessAllowsTripData(access, Date.now());
}

// ── Roster ─────────────────────────────────────────────────────────────────────

export type RosterAddStatus = "added" | "skipped" | "needs-review" | "invalid";

export async function addRosterMembers(params: {
  cohortId: string;
  actorUid: string;
  emails: string[];
  invalid: string[];
  operationId: string;
}): Promise<{ results: Array<{ email: string; status: RosterAddStatus; flags?: string[] }>; replayed: boolean }> {
  const { cohortId, actorUid, emails, invalid, operationId } = params;
  const opRef = operationRef(cohortId, operationId);
  const prior = await opRef.get();
  if (prior.exists) {
    const data = prior.data() as DocumentData;
    if (data.callerUid !== actorUid || data.type !== "roster_add") {
      throw new AccessOpError("operation-mismatch", "That operation ID belongs to a different request.");
    }
    return { results: data.results ?? [], replayed: true };
  }

  const results: Array<{ email: string; status: RosterAddStatus; flags?: string[] }> =
    invalid.map((email) => ({ email, status: "invalid" as const }));

  for (const email of emails) {
    const ref = rosterRef(cohortId, email);
    if ((await ref.get()).exists) {
      results.push({ email, status: "skipped" });
      continue;
    }

    const user = await getUserOrNull(() => getAuth().getUserByEmail(email));
    const flags = user ? reviewFlagsForAccount(summarizeAccount(user), email, null) : [];
    // A flagged account is approved on the roster but not claimed: no uid is
    // recorded and no access record is created until a person has reviewed it.
    const claimUid = user && flags.length === 0 ? user.uid : null;

    try {
      await ref.create({
        email,
        uid: claimUid,
        provisionalUid: false,
        approvedAt: FieldValue.serverTimestamp(),
        approvedByUid: actorUid,
        reviewFlags: flags,
        issuedVersion: 0,
        issuedAt: null,
        deliveredAt: null,
        deliveredVersion: 0,
        readyAt: null,
        currentOperationId: null,
        lastOperationPhase: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 6) { // ALREADY_EXISTS: raced another import
        results.push({ email, status: "skipped" });
        continue;
      }
      throw err;
    }

    if (claimUid) {
      // Never overwrite an existing access record (for example one seeded as
      // legacy by the operator script); create() fails instead.
      try {
        await accessRef(cohortId, claimUid).create({
          uid: claimUid,
          email,
          active: true,
          credentialState: "pending",
          credentialVersion: 0,
          passwordBaselineMs: null,
          activeOperationId: null,
          leaseExpiresMs: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 6) throw err;
      }
    }

    results.push(flags.length ? { email, status: "needs-review", flags } : { email, status: "added" });
  }

  await opRef.create({
    type: "roster_add",
    callerUid: actorUid,
    phase: "completed",
    results,
    counts: {
      added: results.filter((r) => r.status === "added").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      needsReview: results.filter((r) => r.status === "needs-review").length,
      invalid: results.filter((r) => r.status === "invalid").length,
    },
    createdAt: FieldValue.serverTimestamp(),
  });
  logger.info("memberAccess: roster import", { cohortId, operationId, count: results.length });
  return { results, replayed: false };
}

// ── Issue / reset ──────────────────────────────────────────────────────────────

export type CredentialOperationResult =
  | {
      status: "issued";
      operationId: string;
      email: string;
      uid: string;
      credentialVersion: number;
      temporaryPassword: string;
    }
  | {
      status: "replay";
      operationId: string;
      phase: OperationPhase;
      email: string | null;
      credentialVersion: number | null;
    };

interface ResolvedTarget {
  email: string;
  uid: string;
  createsAccount: boolean;
}

async function resolveTarget(params: {
  cohortId: string;
  type: OperationType;
  email?: string;
  uid?: string;
}): Promise<ResolvedTarget> {
  const { cohortId, type } = params;

  let email: string;
  if (type === "reset") {
    const access = toAccessRecord((await accessRef(cohortId, params.uid as string).get()).data());
    if (!access) throw new AccessOpError("not-found", "No access record for this member.");
    email = access.email;
  } else {
    email = params.email as string;
  }

  const rosterSnap = await rosterRef(cohortId, email).get();
  if (!rosterSnap.exists) {
    throw new AccessOpError("not-on-roster", "This email is not on the approved roster.");
  }
  const roster = rosterSnap.data() as DocumentData;
  const rosterUid: string | null = typeof roster.uid === "string" ? roster.uid : null;

  if (type === "reset" && rosterUid !== params.uid) {
    throw new AccessOpError("needs-review", "Roster and access records disagree for this member.", { flags: ["uid-mismatch"] });
  }

  let user: UserRecord | null;
  if (rosterUid) {
    user = await getUserOrNull(() => getAuth().getUser(rosterUid));
    if (!user) {
      // A uid this system generated for a new account whose creation never
      // completed: create it now under the same uid.
      if (type === "issue" && roster.provisionalUid === true) {
        return { email, uid: rosterUid, createsAccount: true };
      }
      throw new AccessOpError("needs-review", "The Auth account for this member is missing.", { flags: ["auth-missing"] });
    }
  } else {
    user = await getUserOrNull(() => getAuth().getUserByEmail(email));
    if (!user) {
      return { email, uid: db().collection("_").doc().id, createsAccount: true };
    }
  }

  const flags = reviewFlagsForAccount(summarizeAccount(user), email, rosterUid);
  if (flags.length) {
    await rosterSnap.ref.update({ reviewFlags: flags, updatedAt: FieldValue.serverTimestamp() });
    throw new AccessOpError(
      "needs-review",
      "This member's Auth account needs review before a password can be set.",
      { flags },
    );
  }
  return { email, uid: user.uid, createsAccount: false };
}

/**
 * Issue a first temporary password ("issue") or a replacement ("reset").
 *
 * Retrying with the same operationId reports the earlier outcome and never
 * changes the password again, so a lost response cannot trigger a second reset.
 */
export async function runCredentialOperation(params: {
  cohortId: string;
  actorUid: string;
  type: OperationType;
  operationId: string;
  email?: string;
  uid?: string;
}): Promise<CredentialOperationResult> {
  const { cohortId, actorUid, type, operationId } = params;
  const opRef = operationRef(cohortId, operationId);

  // Fast path for retries, before any Auth reads.
  const priorSnap = await opRef.get();
  const priorPlan = planOperationRequest(toOperationRecord(priorSnap.data()), actorUid, type);
  if (priorPlan.kind === "reject") {
    throw new AccessOpError(priorPlan.code, "That operation ID belongs to a different request.");
  }
  if (priorPlan.kind === "replay") {
    const prior = priorSnap.data() as DocumentData;
    return {
      status: "replay",
      operationId,
      phase: priorPlan.phase,
      email: prior.targetEmail ?? null,
      credentialVersion: prior.credentialVersion ?? null,
    };
  }

  const target = await resolveTarget(params);
  const aRef = accessRef(cohortId, target.uid);
  const rRef = rosterRef(cohortId, target.email);
  const leaseExpiresMs = Date.now() + OPERATION_LEASE_MS;

  // Phase 1: claim the per-UID lease and make access restrictive.
  const claim = await db().runTransaction(async (tx) => {
    const [opSnap, accessSnap, rosterSnap] = await Promise.all([tx.get(opRef), tx.get(aRef), tx.get(rRef)]);
    const plan = planOperationRequest(toOperationRecord(opSnap.data()), actorUid, type);
    if (plan.kind === "reject") throw new AccessOpError(plan.code, "That operation ID belongs to a different request.");
    if (plan.kind === "replay") return { replay: opSnap.data() as DocumentData };

    const access = toAccessRecord(accessSnap.data());
    const roster = rosterSnap.data() as DocumentData | undefined;
    if (!roster) throw new AccessOpError("not-on-roster", "This email is not on the approved roster.");
    const now = Date.now();
    const eligibility = type === "issue" ?
      checkIssueEligibility(access, Number(roster.issuedVersion ?? 0), now) :
      checkResetEligibility(access, now);
    if (!eligibility.ok) throw new AccessOpError(eligibility.code, eligibility.message);

    // An expired lease means an earlier operation stopped partway. This one
    // replaces whatever it may have set, so record that it was superseded.
    let staleRef = null;
    if (access?.activeOperationId && access.activeOperationId !== operationId && !leaseIsHeld(access, now)) {
      staleRef = operationRef(cohortId, access.activeOperationId);
      const staleSnap = await tx.get(staleRef);
      if (!staleSnap.exists) staleRef = null;
    }

    const credentialVersion = (access?.credentialVersion ?? 0) + 1;
    tx.create(opRef, {
      type,
      callerUid: actorUid,
      phase: "started",
      targetUid: target.uid,
      targetEmail: target.email,
      credentialVersion,
      createsAccount: target.createsAccount,
      baselinePasswordUpdatedAtMs: null,
      errorCode: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(aRef, {
      uid: target.uid,
      email: target.email,
      active: access ? access.active : true,
      credentialState: "issuing",
      credentialVersion,
      passwordBaselineMs: null,
      legacyUntil: FieldValue.delete(),
      activeOperationId: operationId,
      leaseExpiresMs,
      updatedAt: FieldValue.serverTimestamp(),
      ...(access ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    tx.update(rRef, {
      uid: target.uid,
      provisionalUid: target.createsAccount,
      currentOperationId: operationId,
      lastOperationPhase: "started",
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (staleRef) {
      tx.update(staleRef, { phase: "superseded", supersededBy: operationId, updatedAt: FieldValue.serverTimestamp() });
    }
    return { credentialVersion };
  });

  if ("replay" in claim && claim.replay) {
    return {
      status: "replay",
      operationId,
      phase: claim.replay.phase,
      email: claim.replay.targetEmail ?? null,
      credentialVersion: claim.replay.credentialVersion ?? null,
    };
  }
  const credentialVersion = (claim as { credentialVersion: number }).credentialVersion;

  const fail = async (phase: OperationPhase, errorCode: string) => {
    // Best effort: these writes record the failure for the admin and the
    // runbook. Access is already restrictive whether or not they land.
    await Promise.allSettled([
      opRef.update({ phase, errorCode, updatedAt: FieldValue.serverTimestamp() }),
      aRef.update({
        credentialState: "error",
        activeOperationId: null,
        leaseExpiresMs: null,
        updatedAt: FieldValue.serverTimestamp(),
      }),
      rRef.update({ lastOperationPhase: phase, updatedAt: FieldValue.serverTimestamp() }),
    ]);
    logger.warn("memberAccess: credential operation failed", { cohortId, operationId, type, phase, errorCode });
  };

  // Phase 2: change the password in Auth.
  const temporaryPassword = generateTemporaryPassword();
  try {
    if (target.createsAccount) {
      await getAuth().createUser({
        uid: target.uid,
        email: target.email,
        password: temporaryPassword,
        // An administrator's assertion of identity from the reviewed roster,
        // not proof that the mailbox was verified. Required by the rules'
        // verified-email condition.
        emailVerified: true,
      });
    } else {
      await getAuth().updateUser(target.uid, { password: temporaryPassword });
    }
  } catch (err) {
    const code = (err as { code?: string }).code ?? "unknown";
    await fail("failed", `auth:${code}`);
    throw new AccessOpError(
      "auth-update-failed",
      "Firebase did not accept the password change. The member's access is paused until a replacement is issued.",
      { authCode: code, passwordChanged: "unknown" },
    );
  }

  await opRef.update({ phase: "auth_updated", updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);

  if (type === "reset") {
    // Ends other sessions at their next token refresh (up to an hour).
    await getAuth().revokeRefreshTokens(target.uid).catch(() => undefined);
  }

  // Phase 3: record the baseline the completion check compares against.
  let baseline: number | null = null;
  let lookupError = "no-password-timestamp";
  try {
    baseline = (await lookupAccountPasswordState(target.uid)).passwordUpdatedAtMs;
  } catch (err) {
    lookupError = err instanceof PasswordLookupError ? err.code : "unknown";
  }
  if (baseline === null) {
    await fail("auth_updated", `lookup:${lookupError}`);
    throw new AccessOpError(
      "metadata-unavailable",
      "The password was changed, but setup could not be recorded, so the value was not shown. Issue a replacement password.",
      { passwordChanged: true },
    );
  }

  // Phase 4: publish the temporary state, only if this operation still owns it.
  try {
    await db().runTransaction(async (tx) => {
      const accessSnap = await tx.get(aRef);
      const access = toAccessRecord(accessSnap.data());
      if (!access || access.activeOperationId !== operationId || access.credentialVersion !== credentialVersion) {
        throw new AccessOpError("superseded", "A newer password operation replaced this one.");
      }
      tx.update(aRef, {
        credentialState: "temporary",
        passwordBaselineMs: baseline,
        activeOperationId: null,
        leaseExpiresMs: null,
        issuedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(opRef, {
        phase: "completed",
        baselinePasswordUpdatedAtMs: baseline,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(rRef, {
        provisionalUid: false,
        issuedVersion: credentialVersion,
        issuedAt: FieldValue.serverTimestamp(),
        issuedByUid: actorUid,
        deliveredAt: null,
        deliveredByUid: null,
        readyAt: null,
        reviewFlags: [],
        lastOperationPhase: "completed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof AccessOpError && err.code === "superseded") {
      await opRef.update({ phase: "superseded", updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
      throw new AccessOpError("superseded", err.message, { passwordChanged: true });
    }
    await fail("auth_updated", "finalize-failed");
    throw new AccessOpError(
      "finalize-failed",
      "The password was changed, but setup could not be recorded, so the value was not shown. Issue a replacement password.",
      { passwordChanged: true },
    );
  }

  logger.info("memberAccess: credential issued", { cohortId, operationId, type, credentialVersion });
  return {
    status: "issued",
    operationId,
    email: target.email,
    uid: target.uid,
    credentialVersion,
    temporaryPassword,
  };
}

// ── Delivery and status ────────────────────────────────────────────────────────

export async function markCredentialDelivered(params: {
  cohortId: string;
  actorUid: string;
  operationId: string;
}): Promise<{ delivered: true; credentialVersion: number }> {
  const { cohortId, actorUid, operationId } = params;
  const opRef = operationRef(cohortId, operationId);
  return db().runTransaction(async (tx) => {
    const opSnap = await tx.get(opRef);
    const op = opSnap.data();
    if (!op || (op.type !== "issue" && op.type !== "reset")) {
      throw new AccessOpError("not-found", "No password issuance with that ID.");
    }
    if (op.phase !== "completed") {
      throw new AccessOpError("not-completed", "That password was not issued successfully.");
    }
    const aRef = accessRef(cohortId, op.targetUid);
    const rRef = rosterRef(cohortId, op.targetEmail);
    const [accessSnap, rosterSnap] = await Promise.all([tx.get(aRef), tx.get(rRef)]);
    const access = toAccessRecord(accessSnap.data());
    if (!access || access.credentialVersion !== op.credentialVersion || !rosterSnap.exists) {
      throw new AccessOpError(
        "stale-credential",
        "A newer password has been issued for this member since. Nothing was marked.",
      );
    }
    tx.update(rRef, {
      deliveredAt: FieldValue.serverTimestamp(),
      deliveredByUid: actorUid,
      deliveredVersion: op.credentialVersion,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(opRef, { deliveredAt: FieldValue.serverTimestamp(), deliveredByUid: actorUid });
    return { delivered: true as const, credentialVersion: op.credentialVersion as number };
  });
}

export async function getCredentialOperationStatus(params: {
  cohortId: string;
  operationId: string;
}): Promise<Record<string, unknown>> {
  const { cohortId, operationId } = params;
  const opSnap = await operationRef(cohortId, operationId).get();
  const op = opSnap.data();
  if (!op) return { operationId, phase: "not-found" };
  let isCurrent = false;
  if (op.targetUid && typeof op.credentialVersion === "number") {
    const access = toAccessRecord((await accessRef(cohortId, op.targetUid).get()).data());
    isCurrent = access?.credentialVersion === op.credentialVersion;
  }
  // Sanitized: no password, hash, or baseline ever leaves this function.
  return {
    operationId,
    type: op.type,
    phase: op.phase,
    targetEmail: op.targetEmail ?? null,
    credentialVersion: op.credentialVersion ?? null,
    errorCode: op.errorCode ?? null,
    delivered: !!op.deliveredAt,
    isCurrent,
  };
}

// ── Member self-service ────────────────────────────────────────────────────────

export async function completePasswordSetup(params: {
  cohortId: string;
  uid: string;
  email: string;
  credentialVersion: number;
}): Promise<{ state: CredentialState | "none"; credentialVersion: number; result: string }> {
  const { cohortId, uid, email, credentialVersion } = params;
  const aRef = accessRef(cohortId, uid);
  const access = toAccessRecord((await aRef.get()).data());
  if (!access || access.uid !== uid || access.email !== email) {
    throw new AccessOpError("no-access", "This account does not have access to Global 84.");
  }

  // Only look up Auth when the answer could change something.
  let passwordUpdatedAtMs: number | null = null;
  if (access.credentialState === "temporary" && access.active && credentialVersion === access.credentialVersion) {
    try {
      const state = await lookupAccountPasswordState(uid);
      if (state.disabled) throw new AccessOpError("disabled", "This account is turned off.");
      if (state.email !== email) throw new AccessOpError("no-access", "Account details do not match.");
      passwordUpdatedAtMs = state.passwordUpdatedAtMs;
    } catch (err) {
      if (err instanceof AccessOpError) throw err;
      logger.warn("memberAccess: completion lookup failed", {
        cohortId,
        code: err instanceof PasswordLookupError ? err.code : "unknown",
      });
    }
  }

  const decision = evaluateCompletion(access, credentialVersion, passwordUpdatedAtMs);
  switch (decision.result) {
  case "already-ready":
    return { state: access.credentialState, credentialVersion: access.credentialVersion, result: "ready" };
  case "needs-password":
    return { state: "temporary", credentialVersion: access.credentialVersion, result: "needs-password" };
  case "stale-version":
    return { state: access.credentialState, credentialVersion: decision.currentVersion, result: "stale-version" };
  case "not-eligible":
    return { state: access.credentialState, credentialVersion: access.credentialVersion, result: decision.code };
  case "retry":
    throw new AccessOpError("retry", "Setup could not be confirmed yet. Try again in a moment.", { retryable: true });
  case "complete":
    break;
  }

  // Recheck inside a transaction: a reset that landed since the read above
  // bumps the version and must win over this completion.
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(aRef);
    const current = toAccessRecord(snap.data());
    const again = evaluateCompletion(current, credentialVersion, passwordUpdatedAtMs);
    if (again.result === "already-ready") {
      return { state: "ready" as const, credentialVersion, result: "ready" };
    }
    if (again.result !== "complete" || !current) {
      return {
        state: current?.credentialState ?? "none",
        credentialVersion: current?.credentialVersion ?? 0,
        result: "stale-version",
      };
    }
    tx.update(aRef, {
      credentialState: "ready",
      readyAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(rosterRef(cohortId, email), {
      readyAt: FieldValue.serverTimestamp(),
      readyVersion: credentialVersion,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { state: "ready" as const, credentialVersion, result: "ready" };
  });
}

// ── Membership on/off ──────────────────────────────────────────────────────────

export async function setMemberAccess(params: {
  cohortId: string;
  actorUid: string;
  uid: string;
  active: boolean;
  operationId: string;
}): Promise<{ active: boolean; credentialState: CredentialState; authDisabled: boolean; replayed: boolean }> {
  const { cohortId, actorUid, uid, active, operationId } = params;
  if (uid === actorUid) {
    throw new AccessOpError("self", "Ask another administrator to change your own access.");
  }
  const opRef = operationRef(cohortId, operationId);
  const aRef = accessRef(cohortId, uid);

  const outcome = await db().runTransaction(async (tx) => {
    const [opSnap, accessSnap] = await Promise.all([tx.get(opRef), tx.get(aRef)]);
    const access = toAccessRecord(accessSnap.data());
    if (!access) throw new AccessOpError("not-found", "No access record for this member.");
    if (opSnap.exists) {
      const op = opSnap.data() as DocumentData;
      if (op.callerUid !== actorUid || op.type !== "set_access" || op.targetUid !== uid) {
        throw new AccessOpError("operation-mismatch", "That operation ID belongs to a different request.");
      }
      return { access, replayed: true };
    }
    if (leaseIsHeld(access, Date.now())) {
      throw new AccessOpError("busy", "A password operation for this member is in progress. Try again in a minute.");
    }
    // Only the membership flag changes. Credential state, and with it any
    // requirement to finish password setup, is left exactly as it was.
    tx.update(aRef, { active, updatedAt: FieldValue.serverTimestamp() });
    tx.set(rosterRef(cohortId, access.email), {
      disabledAt: active ? null : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(opRef, {
      type: "set_access",
      callerUid: actorUid,
      phase: "completed",
      targetUid: uid,
      targetEmail: access.email,
      active,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { access: { ...access, active }, replayed: false };
  });

  if (!active && !outcome.replayed) {
    await getAuth().revokeRefreshTokens(uid).catch(() => undefined);
  }
  const user = await getUserOrNull(() => getAuth().getUser(uid));
  logger.info("memberAccess: access changed", { cohortId, operationId, active });
  return {
    active: outcome.access.active,
    credentialState: outcome.access.credentialState,
    authDisabled: user?.disabled ?? false,
    replayed: outcome.replayed,
  };
}

// ── Roles ──────────────────────────────────────────────────────────────────────

/**
 * Make `uid` exactly one of Member, Program Leader, or Admin. Runs in a
 * transaction so two admins demoting each other at once can't both pass the
 * last-admin check. Clients pick the change up through their live listeners
 * on the two allowlist docs; nobody is signed out.
 */
export async function setMemberRole(params: {
  cohortId: string;
  actorUid: string;
  uid: string;
  email: string;
  role: MemberRole;
}): Promise<void> {
  const { cohortId, actorUid, uid, email, role } = params;
  const aRef = adminRef(cohortId, uid);
  const pRef = programLeaderRef(cohortId, uid);
  const enabledAdmins = db().collection(`cohorts/${cohortId}/admins`).where("enabled", "==", true);

  await db().runTransaction(async (tx) => {
    const [adminSnap, leaderSnap, enabledSnap] = await Promise.all([
      tx.get(aRef),
      tx.get(pRef),
      tx.get(enabledAdmins),
    ]);
    const plan = planRoleChange(role, {
      adminExists: adminSnap.exists,
      adminEnabled: adminSnap.data()?.enabled === true,
      leaderExists: leaderSnap.exists,
    }, enabledSnap.size);
    if (!plan.ok) throw new AccessOpError(plan.code, plan.message);

    const stamp = (enabled: boolean) => ({
      enabled,
      email,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    });
    if (plan.admin !== null) tx.set(aRef, stamp(plan.admin), { merge: true });
    if (plan.programLeader !== null) tx.set(pRef, stamp(plan.programLeader), { merge: true });
  });
}
