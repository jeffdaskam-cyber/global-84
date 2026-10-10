import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccessRecord,
  BLOCKED_FRAGMENTS,
  accessAllowsTripData,
  checkIssueEligibility,
  checkResetEligibility,
  evaluateCompletion,
  generateTemporaryPassword,
  isRecentAuth,
  isValidOperationId,
  normalizeDuEmail,
  parseRosterEmails,
  planOperationRequest,
  reviewFlagsForAccount,
} from "../src/memberAccessCore.js";
import { parsePasswordUpdatedAt } from "../src/authPasswordLookup.js";

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);

function access(overrides: Partial<AccessRecord> = {}): AccessRecord {
  return {
    uid: "uid1",
    email: "a.member@du.edu",
    active: true,
    credentialState: "temporary",
    credentialVersion: 1,
    passwordBaselineMs: NOW - 60_000,
    legacyUntilMs: null,
    activeOperationId: null,
    leaseExpiresMs: null,
    ...overrides,
  };
}

// ── Passwords ──────────────────────────────────────────────────────────────────

test("temporary passwords are one 8-letter consonant-vowel word", () => {
  for (let i = 0; i < 2000; i++) {
    const pw = generateTemporaryPassword();
    assert.match(pw, /^([bdfghjmnprstvwz][aeiou]){4}$/);
    for (const f of BLOCKED_FRAGMENTS) assert.ok(!pw.includes(f), `${pw} contains ${f}`);
  }
});

test("separate issuances almost never repeat", () => {
  // 31.6 million possible words; a handful of collisions in 2000 is chance.
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) seen.add(generateTemporaryPassword());
  assert.ok(seen.size >= 1990, `only ${seen.size} unique`);
});

test("a draw containing a blocked fragment is redrawn whole", () => {
  // First draw spells "nigabada" (n=7, i=2, g=3, a=0, b=0, ...); the rest cycle.
  const first = [7, 2, 3, 0, 0, 0, 0, 0];
  let n = 0;
  const rand = (max: number) => (n < first.length ? first[n++] : (n++ % max));
  const pw = generateTemporaryPassword(rand);
  assert.ok(!pw.startsWith("nig"));
  assert.ok(n > 8);
});

// ── Input validation ───────────────────────────────────────────────────────────

test("DU emails are normalized; others rejected", () => {
  assert.equal(normalizeDuEmail("  Jane.Doe@DU.edu "), "jane.doe@du.edu");
  assert.equal(normalizeDuEmail("jane@gmail.com"), null);
  assert.equal(normalizeDuEmail("jane@du.edu.evil.com"), null);
  assert.equal(normalizeDuEmail("jane@notdu.edu"), null);
  assert.equal(normalizeDuEmail(42), null);
});

test("roster batches dedupe and report invalid entries", () => {
  const parsed = parseRosterEmails(["a@du.edu", "A@du.edu", "bad", "b@gmail.com", "c@du.edu"]);
  assert.deepEqual(parsed, { valid: ["a@du.edu", "c@du.edu"], invalid: ["bad", "b@gmail.com"] });
  assert.equal(parseRosterEmails([]), null);
  assert.equal(parseRosterEmails(new Array(101).fill("a@du.edu")), null);
  assert.equal(parseRosterEmails(["a@du.edu", 5]), null);
});

test("operation IDs must be opaque and bounded", () => {
  assert.ok(isValidOperationId("0f8c1e2a-4b6d-4c1e-9a7b-2d3e4f5a6b7c"));
  assert.ok(!isValidOperationId("short"));
  assert.ok(!isValidOperationId("../../admins/x-abcdefghijklmnop"));
});

// ── Access decisions ───────────────────────────────────────────────────────────

test("trip data requires active + ready, or unexpired legacy", () => {
  assert.ok(accessAllowsTripData(access({ credentialState: "ready" }), NOW));
  assert.ok(!accessAllowsTripData(access({ credentialState: "ready", active: false }), NOW));
  for (const s of ["pending", "issuing", "temporary", "error"] as const) {
    assert.ok(!accessAllowsTripData(access({ credentialState: s }), NOW), s);
  }
  assert.ok(accessAllowsTripData(access({ credentialState: "legacy", legacyUntilMs: NOW + 1 }), NOW));
  assert.ok(!accessAllowsTripData(access({ credentialState: "legacy", legacyUntilMs: NOW }), NOW));
  assert.ok(!accessAllowsTripData(access({ credentialState: "legacy", legacyUntilMs: null }), NOW));
  assert.ok(!accessAllowsTripData(null, NOW));
});

test("initial issuance only for never-issued, active, unlocked members", () => {
  assert.deepEqual(checkIssueEligibility(null, 0, NOW), { ok: true });
  assert.deepEqual(checkIssueEligibility(access({ credentialState: "pending" }), 0, NOW), { ok: true });
  assert.deepEqual(checkIssueEligibility(access({ credentialState: "legacy" }), 0, NOW), { ok: true });
  assert.equal((checkIssueEligibility(access({ credentialState: "ready" }), 0, NOW) as { code: string }).code, "already-issued");
  assert.equal((checkIssueEligibility(access({ credentialState: "error" }), 1, NOW) as { code: string }).code, "already-issued");
  assert.equal((checkIssueEligibility(access({ credentialState: "pending", active: false }), 0, NOW) as { code: string }).code, "inactive");
  assert.equal(
    (checkIssueEligibility(access({ credentialState: "issuing", activeOperationId: "op", leaseExpiresMs: NOW + 1000 }), 0, NOW) as { code: string }).code,
    "busy",
  );
  // A first attempt whose lease expired can be retried with a new operation.
  assert.deepEqual(
    checkIssueEligibility(access({ credentialState: "issuing", activeOperationId: "op", leaseExpiresMs: NOW - 1 }), 0, NOW),
    { ok: true },
  );
});

test("reset never reactivates and respects the lease", () => {
  assert.deepEqual(checkResetEligibility(access({ credentialState: "ready" }), NOW), { ok: true });
  assert.deepEqual(checkResetEligibility(access({ credentialState: "error" }), NOW), { ok: true });
  assert.equal((checkResetEligibility(access({ active: false }), NOW) as { code: string }).code, "inactive");
  assert.equal((checkResetEligibility(null, NOW) as { code: string }).code, "not-found");
  assert.equal(
    (checkResetEligibility(access({ activeOperationId: "op", leaseExpiresMs: NOW + 1 }), NOW) as { code: string }).code,
    "busy",
  );
  assert.deepEqual(checkResetEligibility(access({ activeOperationId: "op", leaseExpiresMs: NOW - 1 }), NOW), { ok: true });
});

test("a repeated operation ID replays instead of resetting again", () => {
  assert.deepEqual(planOperationRequest(null, "admin1", "reset"), { kind: "proceed" });
  for (const phase of ["started", "auth_updated", "completed", "failed"] as const) {
    assert.deepEqual(
      planOperationRequest({ type: "reset", callerUid: "admin1", phase }, "admin1", "reset"),
      { kind: "replay", phase },
    );
  }
  assert.equal(planOperationRequest({ type: "reset", callerUid: "admin2", phase: "completed" }, "admin1", "reset").kind, "reject");
  assert.equal(planOperationRequest({ type: "issue", callerUid: "admin1", phase: "completed" }, "admin1", "reset").kind, "reject");
});

// ── Completion ─────────────────────────────────────────────────────────────────

test("completion requires Auth's timestamp strictly after the baseline", () => {
  const baseline = NOW - 60_000;
  const a = access({ passwordBaselineMs: baseline });
  assert.deepEqual(evaluateCompletion(a, 1, baseline + 1), { result: "complete" });
  assert.deepEqual(evaluateCompletion(a, 1, baseline), { result: "needs-password" });
  assert.deepEqual(evaluateCompletion(a, 1, baseline - 1), { result: "needs-password" });
});

test("missing or failed lookups are retryable, never a guess", () => {
  assert.equal(evaluateCompletion(access(), 1, null).result, "retry");
  assert.equal(evaluateCompletion(access({ passwordBaselineMs: null }), 1, NOW).result, "retry");
});

test("an old completion cannot clear a newer reset", () => {
  // Member changed their password under version 1, then an admin reset to v2.
  const afterReset = access({ credentialVersion: 2, passwordBaselineMs: NOW });
  assert.deepEqual(evaluateCompletion(afterReset, 1, NOW - 10), { result: "stale-version", currentVersion: 2 });
  // Even with the current version, the pre-reset change is not after the new baseline.
  assert.deepEqual(evaluateCompletion(afterReset, 2, NOW - 10), { result: "needs-password" });
});

test("completion is idempotent once ready", () => {
  const ready = access({ credentialState: "ready" });
  assert.deepEqual(evaluateCompletion(ready, 1, null), { result: "already-ready" });
  assert.deepEqual(evaluateCompletion(ready, 0, null), { result: "already-ready" });
});

test("inactive, pending, and legacy members cannot complete setup", () => {
  assert.equal(evaluateCompletion(access({ active: false }), 1, NOW).result, "not-eligible");
  assert.equal(evaluateCompletion(access({ credentialState: "pending" }), 1, NOW).result, "not-eligible");
  assert.equal(evaluateCompletion(access({ credentialState: "legacy" }), 1, NOW).result, "not-eligible");
  assert.equal(evaluateCompletion(access({ credentialState: "issuing" }), 1, NOW).result, "not-eligible");
  assert.equal(evaluateCompletion(null, 1, NOW).result, "not-eligible");
});

test("passwordUpdatedAt parsing rejects values that are not milliseconds", () => {
  assert.equal(parsePasswordUpdatedAt(undefined), null);
  assert.equal(parsePasswordUpdatedAt(NOW), NOW);
  assert.equal(parsePasswordUpdatedAt(String(NOW)), NOW);
  assert.throws(() => parsePasswordUpdatedAt(Math.floor(NOW / 1000)));
  assert.throws(() => parsePasswordUpdatedAt("abc"));
});

// ── Account review and recency ─────────────────────────────────────────────────

test("suspicious Auth accounts are flagged for review", () => {
  const clean = { uid: "u", email: "a@du.edu", emailVerified: true, disabled: false, providerIds: ["password"] };
  assert.deepEqual(reviewFlagsForAccount(clean, "a@du.edu", null), []);
  assert.deepEqual(reviewFlagsForAccount({ ...clean, providerIds: [] }, "a@du.edu", "u"), []);
  assert.deepEqual(reviewFlagsForAccount({ ...clean, emailVerified: false }, "a@du.edu", null), ["unverified"]);
  assert.deepEqual(reviewFlagsForAccount({ ...clean, disabled: true }, "a@du.edu", null), ["disabled"]);
  assert.deepEqual(reviewFlagsForAccount({ ...clean, providerIds: ["password", "google.com"] }, "a@du.edu", null), ["unexpected-provider"]);
  assert.deepEqual(reviewFlagsForAccount(clean, "a@du.edu", "other"), ["uid-mismatch"]);
  assert.deepEqual(reviewFlagsForAccount(clean, "b@du.edu", null), ["email-mismatch"]);
});

test("recent authentication window is five minutes", () => {
  const nowS = NOW / 1000;
  assert.ok(isRecentAuth(nowS - 60, NOW));
  assert.ok(isRecentAuth(nowS - 300, NOW));
  assert.ok(!isRecentAuth(nowS - 301, NOW));
  assert.ok(!isRecentAuth(undefined, NOW));
});
