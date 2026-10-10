import { collection, doc, getDocs, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, COHORT_ID } from "./firebase";
import { watch } from "./subscribe";

/**
 * Member access state lives in cohorts/{cohortId}/access/{uid}. It is written
 * only by Cloud Functions; the rules let a member read their own record at any
 * setup stage so the app can show the right screen. Firestore rules and the
 * functions remain the real gate; nothing here grants access on its own.
 */

/** Mirrors canUseTripData() in firestore.rules. */
export function accessAllowsTripData(access, nowMs = Date.now()) {
  if (!access || access.active !== true) return false;
  if (access.credentialState === "ready") return true;
  if (access.credentialState === "legacy") {
    const until = access.legacyUntil?.toMillis?.();
    return typeof until === "number" && nowMs < until;
  }
  return false;
}

/**
 * Subscribe to the signed-in member's own access record. The callback gets
 * `{ access, fromCache }`, where access is null when the record does not exist.
 * Firestore serves the persisted copy first, then the server's answer.
 */
export function subscribeMyAccess(uid, cb, onError) {
  const ref = doc(db, "cohorts", COHORT_ID, "access", uid);
  return watch(
    "my-access",
    ref,
    (snap) => cb({
      access: snap.exists() ? { id: snap.id, ...snap.data() } : null,
      fromCache: snap.metadata.fromCache,
    }),
    onError
  );
}

const call = (name) => httpsCallable(functions, name);

/** Server-side setup reconciliation. Safe to call repeatedly. */
export async function completeMyPasswordSetup(credentialVersion) {
  const res = await call("completeMyPasswordSetup")({ cohortId: COHORT_ID, credentialVersion });
  return res.data;
}

// ── Admin: Member Access page ──────────────────────────────────────────────────

export function newOperationId() {
  return crypto.randomUUID();
}

export async function addRosterMembers(emails, operationId) {
  const res = await call("addRosterMembers")({ cohortId: COHORT_ID, emails, operationId });
  return res.data;
}

export async function issueMemberTemporaryPassword(email, operationId) {
  const res = await call("issueMemberTemporaryPassword")({ cohortId: COHORT_ID, email, operationId });
  return res.data;
}

export async function resetMemberPassword(uid, operationId) {
  const res = await call("resetMemberPassword")({ cohortId: COHORT_ID, uid, operationId });
  return res.data;
}

export async function markCredentialDelivered(operationId) {
  const res = await call("markCredentialDelivered")({ cohortId: COHORT_ID, operationId });
  return res.data;
}

export async function getCredentialOperationStatus(operationId) {
  const res = await call("getCredentialOperationStatus")({ cohortId: COHORT_ID, operationId });
  return res.data;
}

export async function setMemberAccess(uid, active, operationId) {
  const res = await call("setMemberAccess")({ cohortId: COHORT_ID, uid, active, operationId });
  return res.data;
}

export function subscribeRoster(cb, onError) {
  const q = query(collection(db, "cohorts", COHORT_ID, "roster"), orderBy("email"));
  return watch("roster", q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeAllAccess(cb, onError) {
  const ref = collection(db, "cohorts", COHORT_ID, "access");
  return watch("access-all", ref, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** One-time read of member profile emails, to seed the roster import box. */
export async function loadCurrentMemberEmails() {
  const snap = await getDocs(collection(db, "cohorts", COHORT_ID, "members"));
  return snap.docs.map((d) => (d.data().email || "").toLowerCase()).filter(Boolean);
}

/** The callable error's machine reason, set by the functions as details.reason. */
export function callableReason(err) {
  return err?.details?.reason || null;
}

// ── Admin: roles ───────────────────────────────────────────────────────────────

/** "member" | "programLeader" | "admin". The callable enforces exclusivity. */
export async function setMemberRole(email, role) {
  const res = await call("setMemberRole")({ cohortId: COHORT_ID, email, role });
  return res.data;
}

/**
 * One-time read of both role allowlists, as a Map of uid → role. Members
 * absent from the map are plain members. Admin wins if both docs are enabled.
 */
export async function loadRoles() {
  const [admins, leaders] = await Promise.all([
    getDocs(collection(db, "cohorts", COHORT_ID, "admins")),
    getDocs(collection(db, "cohorts", COHORT_ID, "programLeaders")),
  ]);
  const roles = new Map();
  for (const d of leaders.docs) if (d.data().enabled === true) roles.set(d.id, "programLeader");
  for (const d of admins.docs) if (d.data().enabled === true) roles.set(d.id, "admin");
  return roles;
}
