/**
 * memberAccessCore — pure helpers for member access and credential operations.
 *
 * Nothing in this module touches Firestore, Auth, or the network, so every
 * decision the callables and the operator script make (who may be issued a
 * password, whether a retry replays or proceeds, whether password setup is
 * complete) can be unit tested directly. The I/O lives in memberAccessOps.ts.
 */

import { randomInt } from "node:crypto";

// Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN and the Firestore/Storage rules.
export const ALLOWED_EMAIL_DOMAIN = "du.edu";

// The one cohort this deployment serves. Keep in sync with VITE_COHORT_ID and
// configuredCohort() in firestore.rules and storage.rules. HTTP endpoints that
// carry no cohort ID (translateImage, lookupFlight) check access against it.
export const CONFIGURED_COHORT_ID = "cohort84";
export const ALLOWED_COHORT_IDS: ReadonlySet<string> = new Set([CONFIGURED_COHORT_ID]);

export const MAX_ROSTER_BATCH = 100;

// How long a credential operation holds its per-UID lease. Auth mutations and
// the metadata lookup finish in a few seconds; the margin covers a cold start.
export const OPERATION_LEASE_MS = 2 * 60 * 1000;

// Issuance, reset, and reactivation need a sign-in this recent.
export const RECENT_AUTH_WINDOW_SECONDS = 5 * 60;

export type CredentialState =
  | "pending"
  | "issuing"
  | "temporary"
  | "ready"
  | "legacy"
  | "error";

export const CREDENTIAL_STATES: ReadonlySet<string> = new Set([
  "pending", "issuing", "temporary", "ready", "legacy", "error",
]);

export interface AccessRecord {
  uid: string;
  email: string;
  active: boolean;
  credentialState: CredentialState;
  credentialVersion: number;
  // Auth passwordUpdatedAt (ms) recorded right after the current temporary
  // password was set. Setup is complete once Auth reports a later change.
  passwordBaselineMs?: number | null;
  legacyUntilMs?: number | null;
  activeOperationId?: string | null;
  leaseExpiresMs?: number | null;
}

export type OperationType = "issue" | "reset";
export type OperationPhase = "started" | "auth_updated" | "completed" | "failed" | "superseded";

export interface OperationRecord {
  type: OperationType | "roster_add" | "set_access";
  callerUid: string;
  phase: OperationPhase;
  targetUid?: string | null;
  targetEmail?: string | null;
  credentialVersion?: number | null;
}

// ── Input validation ───────────────────────────────────────────────────────────

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const OPERATION_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 320) return null;
  return EMAIL_RE.test(email) ? email : null;
}

export function normalizeDuEmail(raw: unknown): string | null {
  const email = normalizeEmail(raw);
  if (!email) return null;
  return email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`) ? email : null;
}

export function isValidOperationId(value: unknown): value is string {
  return typeof value === "string" && OPERATION_ID_RE.test(value);
}

export function isValidUid(value: unknown): value is string {
  return typeof value === "string" && UID_RE.test(value);
}

export function isAllowedCohort(value: unknown): value is string {
  return typeof value === "string" && ALLOWED_COHORT_IDS.has(value);
}

/**
 * Normalize and dedupe a roster batch. Invalid and non-DU entries are reported
 * back rather than silently dropped, so the admin can fix typos.
 */
export function parseRosterEmails(raw: unknown): { valid: string[]; invalid: string[] } | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ROSTER_BATCH) return null;
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") return null;
    const email = normalizeDuEmail(entry);
    if (!email) {
      invalid.push(entry.slice(0, 320));
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid };
}

// ── Temporary passwords ────────────────────────────────────────────────────────

// Letters and digits that survive being read aloud or retyped from a text
// message: no 0/O/o, 1/I/l, or 5/S. Hyphens separate groups for readability
// and also satisfy a "special character" password policy if one is enabled.
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZabcdefghijkmnpqrstuvwxyz2346789";
export const PASSWORD_GROUPS = 3;
export const PASSWORD_GROUP_LENGTH = 4;

const UPPER_RE = /[A-Z]/;
const LOWER_RE = /[a-z]/;
const DIGIT_RE = /[0-9]/;

/**
 * Generate a temporary password from crypto.randomInt, which samples without
 * modulo bias. A draw missing an upper, lower, or digit is discarded whole and
 * redrawn, so it meets a character-class policy without skewing any position.
 * 12 random characters from a 53-symbol alphabet is about 68 bits.
 */
export function generateTemporaryPassword(rand: (max: number) => number = randomInt): string {
  for (;;) {
    const groups: string[] = [];
    for (let g = 0; g < PASSWORD_GROUPS; g++) {
      let group = "";
      for (let i = 0; i < PASSWORD_GROUP_LENGTH; i++) {
        group += PASSWORD_ALPHABET[rand(PASSWORD_ALPHABET.length)];
      }
      groups.push(group);
    }
    const candidate = groups.join("-");
    if (UPPER_RE.test(candidate) && LOWER_RE.test(candidate) && DIGIT_RE.test(candidate)) {
      return candidate;
    }
  }
}

// ── Access decisions ───────────────────────────────────────────────────────────

/** Mirrors canUseTripData() in firestore.rules. */
export function accessAllowsTripData(access: AccessRecord | null | undefined, nowMs: number): boolean {
  if (!access || access.active !== true) return false;
  if (access.credentialState === "ready") return true;
  if (access.credentialState === "legacy") {
    return typeof access.legacyUntilMs === "number" && nowMs < access.legacyUntilMs;
  }
  return false;
}

export function leaseIsHeld(access: AccessRecord | null | undefined, nowMs: number): boolean {
  return !!access?.activeOperationId &&
    typeof access.leaseExpiresMs === "number" &&
    access.leaseExpiresMs > nowMs;
}

export type Eligibility =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Initial issuance: only for an approved member who has never been issued a
 * credential under this system (pending, legacy, or a failed first attempt).
 * Anything already issued goes through the explicit reset path instead.
 */
export function checkIssueEligibility(
  access: AccessRecord | null,
  issuedVersion: number,
  nowMs: number,
): Eligibility {
  if (access && access.active !== true) {
    return { ok: false, code: "inactive", message: "This member's access is disabled. Re-enable it first." };
  }
  if (leaseIsHeld(access, nowMs)) {
    return { ok: false, code: "busy", message: "Another password operation for this member is in progress. Try again in a minute." };
  }
  if (issuedVersion > 0 || (access && (access.credentialState === "temporary" || access.credentialState === "ready"))) {
    return { ok: false, code: "already-issued", message: "A password was already issued. Use Issue replacement password instead." };
  }
  return { ok: true };
}

/** Replacement: for a member who already has a UID and has not been disabled. */
export function checkResetEligibility(access: AccessRecord | null, nowMs: number): Eligibility {
  if (!access) {
    return { ok: false, code: "not-found", message: "No access record for this member." };
  }
  if (access.active !== true) {
    return { ok: false, code: "inactive", message: "This member's access is disabled. Re-enable it first." };
  }
  if (leaseIsHeld(access, nowMs)) {
    return { ok: false, code: "busy", message: "Another password operation for this member is in progress. Try again in a minute." };
  }
  return { ok: true };
}

/**
 * What to do with an incoming request that names an operation ID. A known ID
 * is a retry and only ever reports the earlier outcome: it must never run a
 * second Auth mutation, and it never returns the password again.
 */
export function planOperationRequest(
  existing: OperationRecord | null,
  callerUid: string,
  type: OperationType,
): { kind: "proceed" } | { kind: "replay"; phase: OperationPhase } | { kind: "reject"; code: string } {
  if (!existing) return { kind: "proceed" };
  if (existing.callerUid !== callerUid) return { kind: "reject", code: "operation-owned-by-another-admin" };
  if (existing.type !== type) return { kind: "reject", code: "operation-type-mismatch" };
  return { kind: "replay", phase: existing.phase };
}

// ── Password setup completion ──────────────────────────────────────────────────

export type CompletionDecision =
  | { result: "already-ready" }
  | { result: "complete" }
  | { result: "needs-password" }
  | { result: "stale-version"; currentVersion: number }
  | { result: "not-eligible"; code: string }
  | { result: "retry"; code: string };

/**
 * Decide whether the caller's password setup is finished. The only evidence
 * accepted is Auth's own passwordUpdatedAt moving past the baseline recorded
 * when the temporary password was set; the client never declares completion.
 * Works the same for an in-app updatePassword and an email reset.
 */
export function evaluateCompletion(
  access: AccessRecord | null,
  callerVersion: number,
  passwordUpdatedAtMs: number | null,
): CompletionDecision {
  if (!access) return { result: "not-eligible", code: "no-access" };
  if (access.active !== true) return { result: "not-eligible", code: "inactive" };
  if (callerVersion !== access.credentialVersion) {
    if (access.credentialState === "ready") return { result: "already-ready" };
    return { result: "stale-version", currentVersion: access.credentialVersion };
  }
  if (access.credentialState === "ready") return { result: "already-ready" };
  if (access.credentialState !== "temporary") {
    return { result: "not-eligible", code: `state-${access.credentialState}` };
  }
  const baseline = access.passwordBaselineMs;
  if (typeof baseline !== "number" || !Number.isFinite(baseline)) {
    return { result: "retry", code: "missing-baseline" };
  }
  if (passwordUpdatedAtMs === null || !Number.isFinite(passwordUpdatedAtMs)) {
    return { result: "retry", code: "lookup-unavailable" };
  }
  if (passwordUpdatedAtMs > baseline) return { result: "complete" };
  return { result: "needs-password" };
}

// ── Auth account review ────────────────────────────────────────────────────────

export interface AuthAccountSummary {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  providerIds: string[];
}

/**
 * Reasons an existing Auth account must be looked at by a person before the
 * roster claims it, verifies it, or sets a password on it. Email-link and
 * password sign-in are both the "password" provider, so a legitimate member
 * shows only that (or no providers yet).
 */
export function reviewFlagsForAccount(
  account: AuthAccountSummary,
  expectedEmail: string,
  rosterUid: string | null,
): string[] {
  const flags: string[] = [];
  if ((account.email || "").toLowerCase() !== expectedEmail) flags.push("email-mismatch");
  if (!account.emailVerified) flags.push("unverified");
  if (account.disabled) flags.push("disabled");
  if (account.providerIds.some((p) => p !== "password")) flags.push("unexpected-provider");
  if (rosterUid && rosterUid !== account.uid) flags.push("uid-mismatch");
  return flags;
}

/** Sign-in recency check for credential administration. */
export function isRecentAuth(authTimeSeconds: unknown, nowMs: number): boolean {
  if (typeof authTimeSeconds !== "number" || !Number.isFinite(authTimeSeconds)) return false;
  const ageSeconds = nowMs / 1000 - authTimeSeconds;
  return ageSeconds >= -60 && ageSeconds <= RECENT_AUTH_WINDOW_SECONDS;
}
