import {
  addDoc,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, COHORT_ID } from "./firebase";
import { myDisplayName } from "./members";
import { watch } from "./subscribe";

export function announcementsCol() {
  return collection(db, "cohorts", COHORT_ID, "announcements");
}

export function announcementDoc(id) {
  return doc(db, "cohorts", COHORT_ID, "announcements", id);
}

// authorRole is "programLeader" for Program Leaders who aren't admins, and
// undefined otherwise. The key is written only for Program Leaders, so admin
// posts stay identical to before; the rules reject it from anyone else.
export async function createAnnouncement({ title, body, pinned, authorRole }) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const isLeader = authorRole === "programLeader";
  const payload = {
    title: (title || "").trim(),
    body: (body || "").trim(),
    pinned: !!pinned,
    status: "active",
    createdAt: serverTimestamp(),
    createdByUid: u.uid,                 // <-- IMPORTANT (spelling)
    createdByName: await myDisplayName(isLeader ? "Program Leader" : "Admin"),
  };
  if (isLeader) payload.authorRole = "programLeader";

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

export function subscribeAnnouncements(cb, onError) {
  const q = query(
    announcementsCol(),
    where("status", "==", "active"),
    orderBy("pinned", "desc"),
    orderBy("createdAt", "desc"),
    limit(10)
  );
  return watch("announcements", q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}