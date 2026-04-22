import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db, COHORT_ID } from "./firebase.js";

// ── Ref helpers ────────────────────────────────────────────────────────────────

function teamsRef() {
  return collection(db, "cohorts", COHORT_ID, "teams");
}
function teamRef(teamId) {
  return doc(db, "cohorts", COHORT_ID, "teams", teamId);
}
function membersRef(teamId) {
  return collection(db, "cohorts", COHORT_ID, "teams", teamId, "members");
}
function memberRef(teamId, uid) {
  return doc(db, "cohorts", COHORT_ID, "teams", teamId, "members", uid);
}
function messagesRef(teamId) {
  return collection(db, "cohorts", COHORT_ID, "teams", teamId, "messages");
}
function messageRef(teamId, messageId) {
  return doc(db, "cohorts", COHORT_ID, "teams", teamId, "messages", messageId);
}
function meetingsRef(teamId) {
  return collection(db, "cohorts", COHORT_ID, "teams", teamId, "meetings");
}
function meetingRef(teamId, meetingId) {
  return doc(db, "cohorts", COHORT_ID, "teams", teamId, "meetings", meetingId);
}
function cohortMemberRef(uid) {
  return doc(db, "cohorts", COHORT_ID, "members", uid);
}

// ── Team subscriptions ─────────────────────────────────────────────────────────

/** Admin: subscribe to all teams */
export function subscribeTeams(callback) {
  const q = query(teamsRef(), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Member: subscribe to this user's team.
 *
 * Instead of scanning all teams (unreliable, requires subcollection reads),
 * we store teamId on the member's own profile doc — which they already have
 * read access to. We watch that doc for teamId changes, then subscribe to
 * the actual team doc. Returns a single unsubscribe function.
 */
export function subscribeMyTeam(uid, callback) {
  let teamUnsub = null;

  const memberUnsub = onSnapshot(cohortMemberRef(uid), (memberSnap) => {
    const teamId = memberSnap.exists() ? memberSnap.data().teamId : null;

    // Clean up previous team listener if it exists
    if (teamUnsub) {
      teamUnsub();
      teamUnsub = null;
    }

    if (!teamId) {
      callback(null);
      return;
    }

    // Subscribe to the team doc directly
    teamUnsub = onSnapshot(teamRef(teamId), (teamSnap) => {
      if (!teamSnap.exists()) {
        callback(null);
      } else {
        callback({ id: teamSnap.id, ...teamSnap.data() });
      }
    });
  });

  return () => {
    memberUnsub();
    if (teamUnsub) teamUnsub();
  };
}

/** Subscribe to members of a specific team */
export function subscribeTeamMembers(teamId, callback) {
  const q = query(membersRef(teamId), orderBy("joinedAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}

// ── Team CRUD (admin only) ─────────────────────────────────────────────────────

export async function createTeam(name, createdByUid) {
  const ref = await addDoc(teamsRef(), {
    name,
    createdAt: serverTimestamp(),
    createdByUid,
  });
  return ref.id;
}

export async function updateTeam(teamId, name) {
  await updateDoc(teamRef(teamId), { name });
}

/**
 * Delete a team and all its subcollections.
 * Also clears teamId from every assigned member's profile doc.
 */
export async function deleteTeam(teamId) {
  const batch = writeBatch(db);

  // Clear teamId from cohort member profile docs first
  const memberSnap = await getDocs(membersRef(teamId));
  for (const m of memberSnap.docs) {
    batch.update(cohortMemberRef(m.id), { teamId: null });
  }

  // Delete all subcollection docs
  for (const subCol of [messagesRef(teamId), meetingsRef(teamId), membersRef(teamId)]) {
    const snap = await getDocs(subCol);
    snap.docs.forEach((d) => batch.delete(d.ref));
  }

  batch.delete(teamRef(teamId));
  await batch.commit();
}

// ── Member assignment (admin only) ────────────────────────────────────────────

/**
 * Assign a member to a team.
 * Two writes in one batch:
 *   1. teams/{teamId}/members/{uid}  — for Firestore rules access check
 *   2. cohorts/{cohortId}/members/{uid}.teamId — so subscribeMyTeam works instantly
 */
export async function assignMember(teamId, uid, displayName) {
  const batch = writeBatch(db);
  batch.set(memberRef(teamId, uid), { displayName, joinedAt: serverTimestamp() });
  batch.update(cohortMemberRef(uid), { teamId });
  await batch.commit();
}

/**
 * Remove a member from a team.
 * Clears teamId on their profile and removes them from the team's members subcollection.
 */
export async function removeMember(teamId, uid) {
  const batch = writeBatch(db);
  batch.delete(memberRef(teamId, uid));
  batch.update(cohortMemberRef(uid), { teamId: null });
  await batch.commit();
}

// ── Team chat ──────────────────────────────────────────────────────────────────

export function subscribeTeamMessages(teamId, callback) {
  const q = query(messagesRef(teamId), orderBy("createdAt", "asc"), limit(100));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function sendTeamMessage(teamId, text, uid, displayName) {
  await addDoc(messagesRef(teamId), {
    text,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: displayName,
  });
}

export async function deleteTeamMessage(teamId, messageId) {
  await deleteDoc(messageRef(teamId, messageId));
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export function subscribeTeamMeetings(teamId, callback) {
  const q = query(meetingsRef(teamId), orderBy("dateTime", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createMeeting(teamId, { title, dateTime, location, notes }, createdByUid) {
  await addDoc(meetingsRef(teamId), {
    title,
    dateTime,
    location: location || "",
    notes: notes || "",
    createdAt: serverTimestamp(),
    createdByUid,
  });
}

export async function updateMeeting(teamId, meetingId, fields) {
  await updateDoc(meetingRef(teamId, meetingId), fields);
}

export async function deleteMeeting(teamId, meetingId) {
  await deleteDoc(meetingRef(teamId, meetingId));
}
