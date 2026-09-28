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

export const EVENT_KINDS = ["scheduled", "adhoc"];

/**
 * An event's kind. Docs written before ad hoc events existed have no `kind`
 * field and are treated as scheduled — they are not migrated.
 */
export function eventKind(event) {
  return event?.kind === "adhoc" ? "adhoc" : "scheduled";
}

/**
 * Create an event doc, and auto-RSVP the creator as "going".
 *
 * kind "scheduled" (default) requires a start time and a location. kind
 * "adhoc" only requires a title and city; time and meeting point are optional.
 */
export async function createEvent(data) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const kind = data.kind === "adhoc" ? "adhoc" : "scheduled";
  const name = await myDisplayName();

  const payload = {
    title: (data.title || "").trim(),
    city: data.city,
    kind,
    // Always write the key, even as null. subscribeEventsByCity orders by
    // startTime, and Firestore silently drops docs that are *missing* an
    // orderBy field (null values are kept and sort first). Never strip nulls
    // from this payload.
    startTime: data.startTime ?? null, // Date ok; Firestore stores as Timestamp
    locationName: (data.locationName || "").trim(),
    description: (data.description || "").trim(),
    status: "active",
    createdAt: serverTimestamp(),
    createdByUid: u.uid,
    createdByName: name,
  };

  if (!payload.title) throw new Error("Title is required.");
  if (!payload.city) throw new Error("City is required.");
  if (kind === "scheduled") {
    if (!payload.startTime) throw new Error("Start time is required.");
    if (!payload.locationName) throw new Error("Location name is required.");
  }

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
  if (patch.kind === "adhoc" || patch.kind === "scheduled") payload.kind = patch.kind;
  // `in` rather than a truthy check so an ad hoc event's time can be cleared.
  // Written as null (never deleted) — see createEvent.
  if ("startTime" in patch) payload.startTime = patch.startTime ?? null; // Date ok
  if (typeof patch.locationName === "string") payload.locationName = patch.locationName.trim();
  if (typeof patch.description === "string") payload.description = patch.description.trim();

  // A scheduled event must keep a time and a location. When the patch doesn't
  // say which kind it is, the Firestore rules enforce the same invariant.
  if (payload.kind === "scheduled") {
    if (!payload.startTime) throw new Error("Start time is required.");
    if (!payload.locationName) throw new Error("Location name is required.");
  }

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
 *
 * The orderBy on startTime only works because every event doc carries a
 * `startTime` key — undated ad hoc events store it as null. Firestore excludes
 * docs *missing* an orderBy field from the results without any error, so
 * startTime must never be omitted from a write.
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