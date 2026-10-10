/**
 * Trusted operator tool for member access: inventory, legacy seeding, admin
 * bootstrap, and recovery. Runs locally with the operator's own Google
 * credentials and the same server code the callables use, so it works before
 * any administrator has a ready session (and if both admins lose theirs).
 *
 * Usage (from functions/):
 *   npx tsx scripts/memberAccessOperator.ts <command> --project global-84 --cohort cohort84 [options]
 *
 * Commands:
 *   inventory                              List profiles, Auth accounts, admins, and access state.
 *   seed-legacy --emails <file> --legacy-until <ISO date> [--apply]
 *                                          Approve the listed existing members onto the roster with
 *                                          time-limited legacy access. Never touches passwords.
 *   grant-admin --email <email> [--apply]  Enable an admins/{uid} allowlist entry.
 *   issue --email <email> --apply          First temporary password (prints it once).
 *   reset --email <email> --apply          Replacement temporary password (prints it once).
 *   mark-delivered --operation <id> --apply
 *                                          Record manual delivery of an operator-issued password.
 *   status --email <email>                 Roster, access, and last operation for one member.
 *   set-access --email <email> --active true|false --apply
 *
 * Everything that writes is a dry run unless --apply is given. See
 * docs/password-signin-runbook.md for credentials setup and the rollout order.
 * Never commit output from issue/reset: it contains a password.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

interface Args {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key.slice(2)] = true;
    } else {
      flags[key.slice(2)] = next;
      i++;
    }
  }
  return { command, flags };
}

function required(flags: Args["flags"], name: string): string {
  const v = flags[name];
  if (typeof v !== "string" || !v) throw new Error(`--${name} is required`);
  return v;
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "help") {
    console.log(readFileSync(__filename, "utf8").split("*/")[0]);
    return;
  }

  const project = required(flags, "project");
  const cohortId = required(flags, "cohort");
  const apply = flags.apply === true;
  process.env.GCLOUD_PROJECT = project;
  process.env.GOOGLE_CLOUD_PROJECT = project;

  // Imported after the project is set so the Admin SDK initializes against it.
  const core = await import("../src/memberAccessCore.js");
  const ops = await import("../src/memberAccessOps.js");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore, FieldValue, Timestamp } = await import("firebase-admin/firestore");

  if (!core.isAllowedCohort(cohortId)) {
    throw new Error(`Cohort ${cohortId} is not in ALLOWED_COHORT_IDS (memberAccessCore.ts).`);
  }
  console.log(`Project ${project}, cohort ${cohortId}${apply ? "" : " (dry run)"}`);

  const db = getFirestore();
  const emailFlag = () => {
    const email = core.normalizeDuEmail(required(flags, "email"));
    if (!email) throw new Error("--email must be a DU address");
    return email;
  };

  switch (command) {
  case "inventory": {
    const [members, admins, access] = await Promise.all([
      db.collection(`cohorts/${cohortId}/members`).get(),
      db.collection(`cohorts/${cohortId}/admins`).get(),
      db.collection(`cohorts/${cohortId}/access`).get(),
    ]);
    const adminIds = new Set(admins.docs.filter((d) => d.data().enabled === true).map((d) => d.id));
    const accessById = new Map(access.docs.map((d) => [d.id, ops.toAccessRecord(d.data())]));
    const rows = [];
    for (const m of members.docs) {
      const user = await getAuth().getUser(m.id).catch(() => null);
      const a = accessById.get(m.id);
      rows.push({
        email: user?.email ?? m.data().email ?? "",
        uid: m.id,
        name: m.data().displayName ?? "",
        verified: user?.emailVerified ?? "-",
        disabled: user?.disabled ?? "-",
        providers: user ? user.providerData.map((p) => p.providerId).join(",") : "no-auth",
        admin: adminIds.has(m.id),
        access: a ? `${a.credentialState}${a.active ? "" : " (inactive)"}` : "-",
      });
    }
    console.table(rows.sort((x, y) => String(x.email).localeCompare(String(y.email))));
    console.log(`${rows.length} profiles, ${adminIds.size} enabled admins, ${access.size} access records`);
    return;
  }

  case "seed-legacy": {
    const until = new Date(required(flags, "legacy-until"));
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      throw new Error("--legacy-until must be a future ISO date, e.g. 2026-11-15T23:59:59-07:00");
    }
    const lines = readFileSync(required(flags, "emails"), "utf8").split(/[\s,;]+/).filter(Boolean);
    const emails = [...new Set(lines.map((l) => core.normalizeDuEmail(l)))];
    if (emails.includes(null)) throw new Error("The emails file contains a non-DU or malformed address.");
    console.log(`Legacy access until ${until.toISOString()} for ${emails.length} approved emails.`);

    for (const email of emails as string[]) {
      const user = await getAuth().getUserByEmail(email).catch(() => null);
      if (!user) {
        console.log(`  ${email}: no Auth account. Add via Member Access and issue a password instead.`);
        continue;
      }
      const flagsFound = core.reviewFlagsForAccount(ops.summarizeAccount(user), email, null);
      if (flagsFound.length) {
        console.log(`  ${email}: NEEDS REVIEW (${flagsFound.join(", ")}). Skipped.`);
        continue;
      }
      const aRef = ops.accessRef(cohortId, user.uid);
      const rRef = ops.rosterRef(cohortId, email);
      const [aSnap, rSnap] = await Promise.all([aRef.get(), rRef.get()]);
      const rosterUid = rSnap.exists ? rSnap.data()?.uid : null;
      if (rosterUid && rosterUid !== user.uid) {
        console.log(`  ${email}: NEEDS REVIEW (roster uid ${rosterUid} differs from Auth ${user.uid}). Skipped.`);
        continue;
      }
      const plan = [
        rSnap.exists ? "roster exists" : "add to roster",
        aSnap.exists ? `access exists (${aSnap.data()?.credentialState}), unchanged` : "create legacy access",
      ].join("; ");
      console.log(`  ${email} (${user.uid}): ${plan}`);
      if (!apply) continue;
      if (!rSnap.exists) {
        await rRef.create({
          email,
          uid: user.uid,
          provisionalUid: false,
          approvedAt: FieldValue.serverTimestamp(),
          approvedByUid: "operator",
          reviewFlags: [],
          issuedVersion: 0,
          issuedAt: null,
          deliveredAt: null,
          deliveredVersion: 0,
          readyAt: null,
          currentOperationId: null,
          lastOperationPhase: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (!rosterUid) {
        await rRef.update({ uid: user.uid, updatedAt: FieldValue.serverTimestamp() });
      }
      if (!aSnap.exists) {
        await aRef.create({
          uid: user.uid,
          email,
          active: true,
          credentialState: "legacy",
          credentialVersion: 0,
          legacyUntil: Timestamp.fromDate(until),
          passwordBaselineMs: null,
          activeOperationId: null,
          leaseExpiresMs: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    return;
  }

  case "grant-admin": {
    const email = emailFlag();
    const user = await getAuth().getUserByEmail(email);
    console.log(`admins/${user.uid} <- enabled: true (${email})`);
    if (apply) {
      await ops.adminRef(cohortId, user.uid).set(
        { enabled: true, email, grantedBy: "operator", grantedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    return;
  }

  case "issue":
  case "reset": {
    const email = emailFlag();
    if (!apply) {
      console.log(`Would ${command} a temporary password for ${email}. Re-run with --apply.`);
      return;
    }
    let uid: string | undefined;
    if (command === "reset") {
      const rSnap = await ops.rosterRef(cohortId, email).get();
      uid = rSnap.data()?.uid;
      if (!uid) throw new Error("No roster uid for that email.");
    }
    const operationId = randomUUID();
    console.log(`Operation ${operationId}`);
    const result = await ops.runCredentialOperation({
      cohortId,
      actorUid: "operator",
      type: command,
      operationId,
      email: command === "issue" ? email : undefined,
      uid,
    });
    if (result.status !== "issued") {
      console.log(`Not issued: ${result.phase}`);
      return;
    }
    // The one place this tool prints a password. Deliver it individually and
    // clear the terminal scrollback afterwards.
    console.log(`\n  ${result.email}\n  Temporary password: ${result.temporaryPassword}\n`);
    console.log("After delivering it individually, record that with:");
    console.log(`  npx tsx scripts/memberAccessOperator.ts mark-delivered --project ${project} --cohort ${cohortId} --operation ${operationId} --apply`);
    return;
  }

  case "mark-delivered": {
    const operationId = required(flags, "operation");
    console.log(`Mark operation ${operationId} delivered`);
    if (!apply) return;
    console.log(JSON.stringify(await ops.markCredentialDelivered({ cohortId, actorUid: "operator", operationId })));
    return;
  }

  case "status": {
    const email = emailFlag();
    const rSnap = await ops.rosterRef(cohortId, email).get();
    const roster = rSnap.data();
    console.log("roster:", roster ? JSON.stringify({
      uid: roster.uid,
      issuedVersion: roster.issuedVersion,
      issuedAt: roster.issuedAt?.toDate?.(),
      deliveredVersion: roster.deliveredVersion,
      deliveredAt: roster.deliveredAt?.toDate?.(),
      readyAt: roster.readyAt?.toDate?.(),
      reviewFlags: roster.reviewFlags,
      currentOperationId: roster.currentOperationId,
      lastOperationPhase: roster.lastOperationPhase,
    }, null, 2) : "none");
    if (roster?.uid) {
      const a = ops.toAccessRecord((await ops.accessRef(cohortId, roster.uid).get()).data());
      console.log("access:", JSON.stringify(a, null, 2));
    }
    if (roster?.currentOperationId) {
      console.log("operation:", JSON.stringify(
        await ops.getCredentialOperationStatus({ cohortId, operationId: roster.currentOperationId }), null, 2,
      ));
    }
    return;
  }

  case "set-access": {
    const email = emailFlag();
    const active = required(flags, "active");
    if (active !== "true" && active !== "false") throw new Error("--active must be true or false");
    const rSnap = await ops.rosterRef(cohortId, email).get();
    const uid = rSnap.data()?.uid;
    if (!uid) throw new Error("No roster uid for that email.");
    console.log(`access/${uid}.active <- ${active}`);
    if (!apply) return;
    const result = await ops.setMemberAccess({
      cohortId, actorUid: "operator", uid, active: active === "true", operationId: randomUUID(),
    });
    console.log(JSON.stringify(result));
    return;
  }

  default:
    throw new Error(`Unknown command ${command}. Run with "help".`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    // Message only. Never print request objects or Auth responses here.
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
