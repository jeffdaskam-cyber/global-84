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
  setDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db, COHORT_ID } from "./firebase.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Team subscriptions ─────────────────────────────────────────────────────────

/** Admin: subscribe to all teams */
export function subscribeTeams(callback) {
  const q = query(teamsRef(), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Member: subscribe to the one team the current user belongs to.
 *  Calls callback with the team object (including id) or null. */
export function subscribeMyTeam(uid, callback) {
  // We subscribe to all teams and filter client-side for the member doc.
  // This is safe at cohort scale (< 30 teams max).
  const q = query(teamsRef(), orderBy("createdAt", "asc"));
  return onSnapshot(q, async (snap) => {
    for (const teamDoc of snap.docs) {
      const mSnap = await getDocs(membersRef(teamDoc.id));
      const found = mSnap.docs.some((m) => m.id === uid);
      if (found) {
        callback({ id: teamDoc.id, ...teamDoc.data() });
        return;
      }
    }
    callback(null);
  });
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

/** Delete team and all subcollections (messages, meetings, members).
 *  Firestore does not auto-delete subcollections, so we batch-delete them. */
export async function deleteTeam(teamId) {
  const batch = writeBatch(db);

  for (const subCol of [messagesRef(teamId), meetingsRef(teamId), membersRef(teamId)]) {
    const snap = await getDocs(subCol);
    snap.docs.forEach((d) => batch.delete(d.ref));
  }
  batch.delete(teamRef(teamId));
  await batch.commit();
}

// ── Member assignment (admin only) ────────────────────────────────────────────

export async function assignMember(teamId, uid, displayName) {
  await setDoc(memberRef(teamId, uid), {
    displayName,
    joinedAt: serverTimestamp(),
  });
}

export async function removeMember(teamId, uid) {
  await deleteDoc(memberRef(teamId, uid));
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
