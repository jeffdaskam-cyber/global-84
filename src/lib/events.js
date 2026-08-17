import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, COHORT_ID } from "./firebase";
import { myDisplayName } from "./members";
import { watch } from "./subscribe";

/**
 * cohorts/{COHORT_ID}/events
 */
export function eventsCol() {
  return collection(db, "cohorts", COHORT_ID, "events");
}

/**
 * cohorts/{COHORT_ID}/events/{eventId}
 */
export function eventDoc(eventId) {
  return doc(db, "cohorts", COHORT_ID, "events", eventId);
}

/**
 * cohorts/{COHORT_ID}/events/{eventId}/rsvps
 */
export function rsvpsCol(eventId) {
  return collection(db, "cohorts", COHORT_ID, "events", eventId, "rsvps");
}

/**
 * cohorts/{COHORT_ID}/events/{eventId}/rsvps/{uid}
 */
export function rsvpDoc(eventId, uid) {
  return doc(db, "cohorts", COHORT_ID, "events", eventId, "rsvps", uid);
}

/**
 * Create an event doc, and auto-RSVP the creator as "going"
 */
export async function createEvent(data) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const name = await myDisplayName();

  const payload = {
    title: (data.title || "").trim(),
    city: data.city,
    startTime: data.startTime, // Date ok; Firestore stores as Timestamp
    locationName: (data.locationName || "").trim(),
    description: (data.description || "").trim(),
    status: "active",
    createdAt: serverTimestamp(),
    createdByUid: u.uid,
    createdByName: name,
  };

  if (!payload.title) throw new Error("Title is required.");
  if (!payload.city) throw new Error("City is required.");
  if (!payload.startTime) throw new Error("Start time is required.");
  if (!payload.locationName) throw new Error("Location name is required.");

  const ref = await addDoc(eventsCol(), payload);

  // Auto-RSVP creator. `uid` is stored on the doc (in addition to being the
  // doc id) so a collection-group query can filter "my RSVPs" across every
  // event — see subscribeMyRsvps.
  await setDoc(rsvpDoc(ref.id, u.uid), {
    uid: u.uid,
    status: "going",
    updatedAt: serverTimestamp(),
    name,
  });

  return ref.id;
}

/**
 * Update event fields (creator-only enforced by Firestore rules)
 */
export async function updateEvent(eventId, patch) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const ref = eventDoc(eventId);

  const payload = {};
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if (typeof patch.city === "string") payload.city = patch.city;
  if (patch.startTime) payload.startTime = patch.startTime; // Date ok
  if (typeof patch.locationName === "string") payload.locationName = patch.locationName.trim();
  if (typeof patch.description === "string") payload.description = patch.description.trim();

  if (Object.keys(payload).length === 0) return;

  await updateDoc(ref, payload);
}

/**
 * Soft-delete (archive) an event (creator-only enforced by Firestore rules)
 */
export async function archiveEvent(eventId) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  await updateDoc(eventDoc(eventId), { status: "archived" });
}

/**
 * RSVP for an event
 * status: "going" | "interested" | "not_going"
 */
export async function setRsvp(eventId, status) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const allowed = new Set(["going", "interested", "not_going"]);
  if (!allowed.has(status)) throw new Error("Invalid RSVP status.");

  await setDoc(
    rsvpDoc(eventId, u.uid),
    {
      uid: u.uid,
      status,
      updatedAt: serverTimestamp(),
      name: await myDisplayName(),
    },
    { merge: true }
  );
}

/**
 * Subscribe (real-time) to the current user's RSVPs across every event via a
 * collection-group query. Returns rsvp docs carrying { eventId, status }, so a
 * caller can join them against the event list without one listener per event.
 * Filtered to going/interested since those are the RSVPs Up Next surfaces.
 *
 * Note: only RSVPs written after the `uid` field was added (see setRsvp /
 * createEvent) are matched. Pre-existing RSVPs gain the field the next time the
 * member changes their RSVP.
 */
export function subscribeMyRsvps(uid, cb, onError) {
  const q = query(
    collectionGroup(db, "rsvps"),
    where("uid", "==", uid),
    where("status", "in", ["going", "interested"])
  );
  return watch("my-rsvps", q, (snap) => {
    cb(
      snap.docs.map((d) => ({
        eventId: d.ref.parent.parent?.id,
        status: d.data().status,
      }))
    );
  }, onError);
}

/**
 * Subscribe (real-time) to active events for a city.
 */
export function subscribeEventsByCity(city, cb, onError) {
  const q = query(
    eventsCol(),
    where("city", "==", city),
    where("status", "==", "active"),
    orderBy("startTime", "asc"),
    limit(50)
  );

  return watch("events", q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

/**
 * Subscribe (real-time) to RSVPs for an event.
 */
export function subscribeRsvps(eventId, cb, onError) {
  const q = query(rsvpsCol(eventId));
  return watch("rsvps", q, (snap) => {
    cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  }, onError);
}