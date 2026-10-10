// Security rules tests for the Program Leader role.
//
// Run with the emulators (needs Java):
//   npm.cmd run test:rules
//
// Program Leaders (cohorts/{c}/programLeaders/{uid}.enabled) can manage
// announcements and do light moderation: delete cohort chat messages and
// photos, and delete event chat messages only in events they've joined. They
// get nothing else, and no existing admin-only rule widens.

import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const COHORT = "cohort84";
const PROJECT = "demo-global84-leaders";

let env;

const users = {
  member: { uid: "mem1", email: "a.member@du.edu" },
  leader: { uid: "lead1", email: "a.professor@du.edu" },
  formerLeader: { uid: "lead2", email: "b.professor@du.edu" },
  tempLeader: { uid: "lead3", email: "c.professor@du.edu" },
  admin: { uid: "admin1", email: "admin.one@du.edu" },
};

function as(u) {
  return env.authenticatedContext(u.uid, { email: u.email, email_verified: true });
}

const path = (rest) => `cohorts/${COHORT}/${rest}`;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const access = (u, state = "ready") =>
      setDoc(doc(db, path(`access/${u.uid}`)), {
        uid: u.uid, email: u.email, active: true, credentialState: state, credentialVersion: 1,
      });
    const now = Timestamp.now();
    await Promise.all([
      ...Object.values(users).map((u) => access(u, u === users.tempLeader ? "temporary" : "ready")),
      setDoc(doc(db, path(`admins/${users.admin.uid}`)), { enabled: true }),
      setDoc(doc(db, path(`programLeaders/${users.leader.uid}`)), { enabled: true }),
      setDoc(doc(db, path(`programLeaders/${users.formerLeader.uid}`)), { enabled: false }),
      setDoc(doc(db, path(`programLeaders/${users.tempLeader.uid}`)), { enabled: true }),
      setDoc(doc(db, path("announcements/byAdmin")), {
        title: "Admin post", body: "b", pinned: false, status: "active",
        createdAt: now, createdByUid: users.admin.uid, createdByName: "Admin",
      }),
      setDoc(doc(db, path("announcements/byLeader")), {
        title: "Leader post", body: "b", pinned: false, status: "active",
        createdAt: now, createdByUid: users.leader.uid, createdByName: "Prof", authorRole: "programLeader",
      }),
      setDoc(doc(db, path("messages/m1")), { text: "hi", createdByUid: users.member.uid }),
      setDoc(doc(db, path("photos/p1")), { uploaderUid: users.member.uid, storagePath: "x" }),
      setDoc(doc(db, path("events/joined")), { title: "Joined", createdByUid: users.member.uid }),
      setDoc(doc(db, path(`events/joined/rsvps/${users.leader.uid}`)), { uid: users.leader.uid, status: "going" }),
      setDoc(doc(db, path("events/joined/messages/em1")), { text: "hi", createdByUid: users.member.uid }),
      setDoc(doc(db, path("events/notJoined")), { title: "Not joined", createdByUid: users.member.uid }),
      setDoc(doc(db, path(`events/notJoined/rsvps/${users.leader.uid}`)), {
        uid: users.leader.uid, status: "not_going",
      }),
      setDoc(doc(db, path(`events/notJoined/rsvps/${users.member.uid}`)), {
        uid: users.member.uid, status: "going",
      }),
      setDoc(doc(db, path("events/notJoined/messages/em2")), { text: "hi", createdByUid: users.member.uid }),
      setDoc(doc(db, path("itinerary/i1")), { title: "Day 1" }),
      setDoc(doc(db, path("explore/x1")), { title: "Place" }),
      setDoc(doc(db, path("media/md1")), { title: "Video" }),
      setDoc(doc(db, path("teams/t1")), { name: "Team" }),
      setDoc(doc(db, path(`roster/${users.member.email}`)), { email: users.member.email }),
    ]);
  });
});

function newAnnouncement(u, extra = {}) {
  return addDoc(collection(as(u).firestore(), path("announcements")), {
    title: "T", body: "B", pinned: false, status: "active",
    createdAt: serverTimestamp(), createdByUid: u.uid, createdByName: "Name",
    ...extra,
  });
}

describe("announcements", () => {
  test("a Program Leader can post, badged", async () => {
    await assertSucceeds(newAnnouncement(users.leader, { authorRole: "programLeader" }));
    await assertSucceeds(newAnnouncement(users.leader));
  });

  test("members, disabled leaders, and leaders without ready access cannot post", async () => {
    await assertFails(newAnnouncement(users.member));
    await assertFails(newAnnouncement(users.member, { authorRole: "programLeader" }));
    await assertFails(newAnnouncement(users.formerLeader, { authorRole: "programLeader" }));
    await assertFails(newAnnouncement(users.tempLeader, { authorRole: "programLeader" }));
  });

  test("admins post without the badge, and cannot claim it", async () => {
    await assertSucceeds(newAnnouncement(users.admin));
    await assertFails(newAnnouncement(users.admin, { authorRole: "programLeader" }));
    await assertFails(newAnnouncement(users.admin, { authorRole: "admin" }));
  });

  test("nobody can post as someone else", async () => {
    await assertFails(newAnnouncement(users.leader, { createdByUid: users.admin.uid }));
  });

  test("a Program Leader can pin and archive anyone's announcement", async () => {
    const db = as(users.leader).firestore();
    await assertSucceeds(updateDoc(doc(db, path("announcements/byAdmin")), { pinned: true }));
    await assertSucceeds(updateDoc(doc(db, path("announcements/byAdmin")), { status: "archived", pinned: false }));
    await assertSucceeds(updateDoc(doc(db, path("announcements/byLeader")), { pinned: true }));
    await assertSucceeds(deleteDoc(doc(db, path("announcements/byLeader"))));
  });

  test("authorship fields are immutable, for leaders and admins alike", async () => {
    for (const u of [users.leader, users.admin]) {
      const ref = doc(as(u).firestore(), path("announcements/byLeader"));
      await assertFails(updateDoc(ref, { createdByUid: users.member.uid }));
      await assertFails(updateDoc(ref, { createdByName: "Someone" }));
      await assertFails(updateDoc(ref, { authorRole: "admin" }));
      await assertFails(updateDoc(ref, { createdAt: Timestamp.now() }));
    }
    const adminPost = doc(as(users.leader).firestore(), path("announcements/byAdmin"));
    await assertFails(updateDoc(adminPost, { authorRole: "programLeader" }));
  });

  test("members still cannot manage announcements", async () => {
    const db = as(users.member).firestore();
    await assertSucceeds(getDoc(doc(db, path("announcements/byAdmin"))));
    await assertFails(updateDoc(doc(db, path("announcements/byAdmin")), { pinned: true }));
    await assertFails(deleteDoc(doc(db, path("announcements/byAdmin"))));
  });
});

describe("moderation", () => {
  test("a Program Leader can delete cohort chat messages and photo docs", async () => {
    const db = as(users.leader).firestore();
    await assertSucceeds(deleteDoc(doc(db, path("messages/m1"))));
    await assertSucceeds(deleteDoc(doc(db, path("photos/p1"))));
  });

  test("members and disabled leaders cannot", async () => {
    for (const u of [users.member, users.formerLeader]) {
      const db = as(u).firestore();
      await assertFails(deleteDoc(doc(db, path("messages/m1"))));
      await assertFails(deleteDoc(doc(db, path("photos/p1"))));
    }
  });

  test("event chat: a leader deletes only in events they've joined", async () => {
    const db = as(users.leader).firestore();
    await assertSucceeds(deleteDoc(doc(db, path("events/joined/messages/em1"))));
    await assertFails(deleteDoc(doc(db, path("events/notJoined/messages/em2"))));
  });

  test("event chat: a leader gets no extra read access", async () => {
    const db = as(users.leader).firestore();
    await assertFails(getDocs(collection(db, path("events/notJoined/messages"))));
    await assertSucceeds(getDocs(collection(db, path("events/joined/messages"))));
  });

  test("event chat: admins keep read and delete everywhere", async () => {
    const db = as(users.admin).firestore();
    await assertSucceeds(getDocs(collection(db, path("events/notJoined/messages"))));
    await assertSucceeds(deleteDoc(doc(db, path("events/notJoined/messages/em2"))));
  });
});

describe("everything else stays admin-only", () => {
  test("a Program Leader cannot write itinerary, explore, media, or teams", async () => {
    const db = as(users.leader).firestore();
    for (const p of ["itinerary/i1", "explore/x1", "media/md1", "teams/t1"]) {
      await assertFails(updateDoc(doc(db, path(p)), { title: "changed" }), p);
      await assertFails(deleteDoc(doc(db, path(p))), p);
    }
  });

  test("a Program Leader cannot edit or delete other members' events or RSVPs", async () => {
    const db = as(users.leader).firestore();
    await assertFails(updateDoc(doc(db, path("events/joined")), { title: "changed" }));
    await assertFails(deleteDoc(doc(db, path("events/joined"))));
    await assertFails(deleteDoc(doc(db, path(`events/notJoined/rsvps/${users.member.uid}`))));
  });

  test("a Program Leader cannot read the roster or access records", async () => {
    const db = as(users.leader).firestore();
    await assertFails(getDocs(collection(db, path("roster"))));
    await assertFails(getDocs(collection(db, path("access"))));
  });
});

describe("programLeaders allowlist", () => {
  test("no client can write it, not even an admin", async () => {
    for (const u of [users.member, users.leader, users.admin]) {
      await assertFails(setDoc(doc(as(u).firestore(), path(`programLeaders/${u.uid}`)), { enabled: true }));
    }
    await assertFails(updateDoc(doc(as(users.admin).firestore(), path(`programLeaders/${users.leader.uid}`)), {
      enabled: false,
    }));
  });

  test("members read only their own doc; admins read all", async () => {
    await assertSucceeds(getDoc(doc(as(users.leader).firestore(), path(`programLeaders/${users.leader.uid}`))));
    await assertSucceeds(getDoc(doc(as(users.member).firestore(), path(`programLeaders/${users.member.uid}`))));
    await assertFails(getDoc(doc(as(users.member).firestore(), path(`programLeaders/${users.leader.uid}`))));
    await assertSucceeds(getDocs(collection(as(users.admin).firestore(), path("programLeaders"))));
    await assertFails(getDocs(collection(as(users.leader).firestore(), path("programLeaders"))));
  });

  test("a Program Leader doc never grants admin-only reads", async () => {
    await assertFails(getDocs(collection(as(users.leader).firestore(), path("admins"))));
  });
});
