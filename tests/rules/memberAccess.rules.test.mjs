// Security rules tests for roster-based membership.
//
// Run with the emulators (needs Java):
//   npm.cmd run test:rules
//
// Covers the authorization acceptance criteria that do not need real Firebase
// Auth: who can read trip data in Firestore and Storage, who can read access
// and roster records, and the collection-group RSVP read.

import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getMetadata, ref, uploadString } from "firebase/storage";

const COHORT = "cohort84";
const OTHER = "cohort85";
const PROJECT = "demo-global84";

let env;

const users = {
  ready: { uid: "ready1", email: "ready.member@du.edu" },
  ready2: { uid: "ready2", email: "second.member@du.edu" },
  temp: { uid: "temp1", email: "temp.member@du.edu" },
  pending: { uid: "pend1", email: "pending.member@du.edu" },
  issuing: { uid: "iss1", email: "issuing.member@du.edu" },
  error: { uid: "err1", email: "error.member@du.edu" },
  inactive: { uid: "off1", email: "off.member@du.edu" },
  legacy: { uid: "leg1", email: "legacy.member@du.edu" },
  expired: { uid: "exp1", email: "expired.member@du.edu" },
  admin: { uid: "admin1", email: "admin.one@du.edu" },
  tempAdmin: { uid: "admin2", email: "admin.two@du.edu" },
  mismatch: { uid: "mis1", email: "mismatch.member@du.edu" },
  stranger: { uid: "str1", email: "not.rostered@du.edu" },
};

function access(u, state, extra = {}) {
  return {
    uid: u.uid,
    email: u.email,
    active: true,
    credentialState: state,
    credentialVersion: 1,
    ...extra,
  };
}

function as(u, tokenOverrides = {}) {
  return env.authenticatedContext(u.uid, { email: u.email, email_verified: true, ...tokenOverrides });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const a = (u, data) => setDoc(doc(db, `cohorts/${COHORT}/access/${u.uid}`), data);
    const future = Timestamp.fromMillis(Date.now() + 86_400_000);
    const past = Timestamp.fromMillis(Date.now() - 1000);
    await Promise.all([
      a(users.ready, access(users.ready, "ready")),
      a(users.ready2, access(users.ready2, "ready")),
      a(users.temp, access(users.temp, "temporary")),
      a(users.pending, access(users.pending, "pending")),
      a(users.issuing, access(users.issuing, "issuing")),
      a(users.error, access(users.error, "error")),
      a(users.inactive, access(users.inactive, "ready", { active: false })),
      a(users.legacy, access(users.legacy, "legacy", { legacyUntil: future })),
      a(users.expired, access(users.expired, "legacy", { legacyUntil: past })),
      a(users.admin, access(users.admin, "ready")),
      a(users.tempAdmin, access(users.tempAdmin, "temporary")),
      a(users.mismatch, access({ uid: users.mismatch.uid, email: "someone.else@du.edu" }, "ready")),
      setDoc(doc(db, `cohorts/${COHORT}/admins/${users.admin.uid}`), { enabled: true }),
      setDoc(doc(db, `cohorts/${COHORT}/admins/${users.tempAdmin.uid}`), { enabled: true }),
      setDoc(doc(db, `cohorts/${COHORT}/roster/${users.ready.email}`), { email: users.ready.email }),
      setDoc(doc(db, `cohorts/${COHORT}/credentialOperations/op1`), { type: "reset" }),
      setDoc(doc(db, `cohorts/${COHORT}/announcements/a1`), { title: "Hello" }),
      setDoc(doc(db, `cohorts/${OTHER}/announcements/a1`), { title: "Other cohort" }),
      setDoc(doc(db, `cohorts/${COHORT}/members/${users.ready.uid}/files/f1`), { name: "visa.pdf" }),
      setDoc(doc(db, `cohorts/${COHORT}/events/e1`), { title: "Dinner" }),
      setDoc(doc(db, `cohorts/${COHORT}/events/e1/rsvps/${users.ready.uid}`), {
        uid: users.ready.uid, status: "going",
      }),
      setDoc(doc(db, `cohorts/${COHORT}/events/e1/rsvps/${users.ready2.uid}`), {
        uid: users.ready2.uid, status: "going",
      }),
    ]);
  });
});

const announcement = (ctx, cohort = COHORT) => getDoc(doc(ctx.firestore(), `cohorts/${cohort}/announcements/a1`));

describe("trip data", () => {
  test("ready and unexpired legacy members can read", async () => {
    await assertSucceeds(announcement(as(users.ready)));
    await assertSucceeds(announcement(as(users.legacy)));
  });

  test("every unfinished or revoked state is denied", async () => {
    for (const key of ["temp", "pending", "issuing", "error", "inactive", "expired", "mismatch"]) {
      await assertFails(announcement(as(users[key])), key);
    }
  });

  test("a verified DU account not on the roster is denied", async () => {
    await assertFails(announcement(as(users.stranger)));
  });

  test("unverified, non-DU, and signed-out callers are denied", async () => {
    await assertFails(announcement(as(users.ready, { email_verified: false })));
    await assertFails(announcement(as(users.ready, { email: "ready.member@gmail.com" })));
    await assertFails(announcement(env.unauthenticatedContext()));
  });

  test("access in one cohort does not open another", async () => {
    await assertFails(announcement(as(users.ready), OTHER));
  });

  test("private files stay owner-only, even for admins", async () => {
    const path = `cohorts/${COHORT}/members/${users.ready.uid}/files/f1`;
    await assertSucceeds(getDoc(doc(as(users.ready).firestore(), path)));
    await assertFails(getDoc(doc(as(users.admin).firestore(), path)));
  });
});

describe("access, roster, and operations", () => {
  test("members can read only their own access record, at any setup stage", async () => {
    await assertSucceeds(getDoc(doc(as(users.temp).firestore(), `cohorts/${COHORT}/access/${users.temp.uid}`)));
    await assertSucceeds(getDoc(doc(as(users.pending).firestore(), `cohorts/${COHORT}/access/${users.pending.uid}`)));
    await assertFails(getDoc(doc(as(users.temp).firestore(), `cohorts/${COHORT}/access/${users.ready.uid}`)));
    await assertFails(getDocs(collection(as(users.ready).firestore(), `cohorts/${COHORT}/access`)));
  });

  test("nobody can write access records from a client", async () => {
    const ref = (u) => doc(as(u).firestore(), `cohorts/${COHORT}/access/${u.uid}`);
    await assertFails(setDoc(ref(users.temp), access(users.temp, "ready")));
    await assertFails(setDoc(ref(users.admin), access(users.admin, "ready")));
    await assertFails(setDoc(ref(users.stranger), access(users.stranger, "ready")));
  });

  test("admins with ready access can read the roster and access records", async () => {
    await assertSucceeds(getDocs(collection(as(users.admin).firestore(), `cohorts/${COHORT}/roster`)));
    await assertSucceeds(getDocs(collection(as(users.admin).firestore(), `cohorts/${COHORT}/access`)));
    await assertFails(getDocs(collection(as(users.ready).firestore(), `cohorts/${COHORT}/roster`)));
  });

  test("an admin allowlist entry without ready access grants nothing", async () => {
    await assertFails(getDocs(collection(as(users.tempAdmin).firestore(), `cohorts/${COHORT}/roster`)));
    await assertFails(announcement(as(users.tempAdmin)));
  });

  test("credential operations are never client-readable", async () => {
    await assertFails(getDoc(doc(as(users.admin).firestore(), `cohorts/${COHORT}/credentialOperations/op1`)));
  });
});

describe("collection-group RSVPs", () => {
  const mine = (u) => query(
    collectionGroup(as(u).firestore(), "rsvps"),
    where("uid", "==", u.uid),
    where("status", "in", ["going", "interested"]),
  );

  test("a ready member can query their own RSVPs", async () => {
    const snap = await assertSucceeds(getDocs(mine(users.ready)));
    if (snap.size !== 1) throw new Error(`expected 1 RSVP, got ${snap.size}`);
  });

  test("an unfiltered collection-group query is denied", async () => {
    await assertFails(getDocs(collectionGroup(as(users.ready).firestore(), "rsvps")));
  });

  test("querying someone else's RSVPs is denied", async () => {
    await assertFails(getDocs(query(
      collectionGroup(as(users.ready).firestore(), "rsvps"),
      where("uid", "==", users.ready2.uid),
    )));
  });

  test("members without usable access are denied", async () => {
    await assertFails(getDocs(mine(users.temp)));
    await assertFails(getDocs(mine(users.stranger)));
  });
});

describe("storage", () => {
  const put = (u, path, type = "application/pdf") =>
    uploadString(ref(as(u).storage(), path), "x", "raw", { contentType: type });
  const read = (u, path) => getMetadata(ref(as(u).storage(), path));

  test("private files: ready owner only", async () => {
    const path = `userFiles/${users.ready.uid}/visa.pdf`;
    await assertSucceeds(put(users.ready, path));
    await assertSucceeds(read(users.ready, path));
    await assertFails(read(users.admin, path));
    await assertFails(put(users.temp, `userFiles/${users.temp.uid}/visa.pdf`));
    await assertFails(put(users.stranger, `userFiles/${users.stranger.uid}/visa.pdf`));
  });

  test("photos: bound to the cohort in the path", async () => {
    const path = `photos/${COHORT}/${users.ready.uid}/p.jpg`;
    await assertSucceeds(put(users.ready, path, "image/jpeg"));
    await assertSucceeds(read(users.ready2, path));
    await assertFails(read(users.temp, path));
    await assertFails(read(users.stranger, path));
    await assertFails(put(users.ready, `photos/${OTHER}/${users.ready.uid}/p.jpg`, "image/jpeg"));
  });

  test("trip documents: ready or legacy members only", async () => {
    const path = `tripDocs/${COHORT}/plan.pdf`;
    await assertSucceeds(put(users.legacy, path));
    await assertSucceeds(read(users.ready, path));
    await assertFails(read(users.expired, path));
    await assertFails(read(users.pending, path));
  });
});
