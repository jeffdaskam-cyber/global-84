import {
  addDoc,
  collection,
  deleteDoc,
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

// Admin-posted cohort itinerary: the shared, dated plan (arrivals, company
// visits, group dinners) the trip leader publishes. Distinct from Events (which
// members create and RSVP to) and Announcements (which carry no time). Feeds the
// Home "Up Next" module alongside a member's RSVP'd events and next flight.
//
// cohorts/{COHORT_ID}/itinerary/{id}

export function itineraryCol() {
  return collection(db, "cohorts", COHORT_ID, "itinerary");
}

export function itineraryDoc(id) {
  return doc(db, "cohorts", COHORT_ID, "itinerary", id);
}

/**
 * Create an itinerary item (admin only, enforced by rules).
 * @param {{title:string, startTime:Date, locationName?:string, city?:string}} data
 */
export async function createItineraryItem(data) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");

  const payload = {
    title: (data.title || "").trim(),
    startTime: data.startTime, // Date ok; Firestore stores as Timestamp
    locationName: (data.locationName || "").trim(),
    city: (data.city || "").trim(),
    status: "active",
    createdAt: serverTimestamp(),
    createdByUid: u.uid,
    createdByName: await myDisplayName("Admin"),
  };

  if (!payload.title) throw new Error("Title is required.");
  if (!payload.startTime) throw new Error("Date and time is required.");

  const ref = await addDoc(itineraryCol(), payload);
  return ref.id;
}

/**
 * Update itinerary fields (admin only). Only provided fields are written.
 */
export async function updateItineraryItem(id, patch) {
  const payload = {};
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if (patch.startTime) payload.startTime = patch.startTime;
  if (typeof patch.locationName === "string") payload.locationName = patch.locationName.trim();
  if (typeof patch.city === "string") payload.city = patch.city.trim();

  if (Object.keys(payload).length === 0) return;
  await updateDoc(itineraryDoc(id), payload);
}

/**
 * Hard-delete an itinerary item (admin only).
 */
export async function deleteItineraryItem(id) {
  await deleteDoc(itineraryDoc(id));
}

/**
 * Subscribe to active itinerary items in chronological order. Returns an
 * unsubscribe function.
 */
export function subscribeItinerary(cb, onError) {
  const q = query(
    itineraryCol(),
    where("status", "==", "active"),
    orderBy("startTime", "asc"),
    limit(50)
  );
  return watch("itinerary", q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}
