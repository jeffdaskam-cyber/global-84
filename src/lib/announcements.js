import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, COHORT_ID } from "./firebase";

export function announcementsCol() {
  return collection(db, "cohorts", COHORT_ID, "announcements");
}

export function announcementDoc(id) {
  return doc(db, "cohorts", COHORT_ID, "announcements", id);
}

export async function createAnnouncement({ title, body, pinned }) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const payload = {
    title: (title || "").trim(),
    body: (body || "").trim(),
    pinned: !!pinned,
    status: "active",
    createdAt: serverTimestamp(),
    createdByUid: u.uid,                 // <-- IMPORTANT (spelling)
    createdByName: u.displayName || "Admin",
  };

  if (!payload.title) throw new Error("Title is required.");
  if (!payload.body) throw new Error("Body is required.");

  const ref = await addDoc(announcementsCol(), payload);
  return ref.id;
}

export async function setAnnouncementPinned(id, pinned) {
  await updateDoc(announcementDoc(id), { pinned: !!pinned });
}

export async function archiveAnnouncement(id) {
  await updateDoc(announcementDoc(id), { status: "archived", pinned: false });
}

export function subscribeAnnouncements(cb) {
  const q = query(
    announcementsCol(),
    where("status", "==", "active"),
    orderBy("pinned", "desc"),
    orderBy("createdAt", "desc"),
    limit(10)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}