import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db, COHORT_ID } from "./firebase.js";
import { watch } from "./subscribe.js";

// ── Trip time zones ──────────────────────────────────────────────────────────
//
// A member's itinerary crosses several zones on the way from the US to
// Singapore and Vietnam, so every leg carries its own IANA zone rather than
// leaning on a single trip default. The list below leads with the zones the
// cohort actually departs from and arrives in; the connecting-hub zones follow
// so a SFO→NRT→SIN routing can be entered accurately. The label is the short
// abbreviation shown next to a rendered time.

export const FLIGHT_TIME_ZONES = [
  { zone: "America/Denver", label: "Denver (MT)" },
  { zone: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { zone: "Asia/Singapore", label: "Singapore (SGT)" },
  { zone: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City (ICT)" },
  { zone: "America/New_York", label: "New York (ET)" },
  { zone: "America/Chicago", label: "Chicago (CT)" },
  { zone: "Asia/Tokyo", label: "Tokyo (JST)" },
  { zone: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
  { zone: "Asia/Seoul", label: "Seoul (KST)" },
  { zone: "Asia/Taipei", label: "Taipei (CST)" },
  { zone: "Asia/Bangkok", label: "Bangkok (ICT)" },
  { zone: "Asia/Dubai", label: "Dubai (GST)" },
  { zone: "Europe/London", label: "London (GMT/BST)" },
  { zone: "UTC", label: "UTC" },
];

export const DEFAULT_DEPARTURE_ZONE = "America/Denver";
export const DEFAULT_ARRIVAL_ZONE = "Asia/Singapore";

export const CABIN_CLASSES = [
  "Economy",
  "Premium Economy",
  "Business",
  "First",
];

// ── Ref helpers ────────────────────────────────────────────────────────────────

function flightsColRef(uid) {
  return collection(db, "cohorts", COHORT_ID, "members", uid, "flights");
}

function flightDocRef(uid, flightId) {
  return doc(db, "cohorts", COHORT_ID, "members", uid, "flights", flightId);
}

// ── Time-zone math ───────────────────────────────────────────────────────────
//
// Flight times are stored as absolute instants (Firestore timestamps) alongside
// the IANA zone they were entered in, so the wall clock a member reads off a
// card is always the local airport clock regardless of where their phone thinks
// it is. The two helpers below convert between a `datetime-local` string and an
// instant for an arbitrary IANA zone — the same approach as config/timezones.js,
// but parameterised by zone rather than by trip city.

/**
 * How far `timeZone` is ahead of UTC at the given instant, in milliseconds.
 * Derived from Intl so it stays correct across DST for any zone.
 */
function offsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );

  return asUTC - date.getTime();
}

/**
 * Read a `datetime-local` value ("2026-08-05T19:00") as wall-clock time in the
 * given IANA zone and return the instant it denotes.
 *
 * @param {string} wallClock - Value from an <input type="datetime-local">.
 * @param {string} timeZone - IANA zone, e.g. "America/Los_Angeles".
 * @returns {Date|null}
 */
export function wallClockToInstant(wallClock, timeZone) {
  if (!wallClock || !timeZone) return null;

  const naive = new Date(`${wallClock}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  // Sample the offset at the target instant, not at `naive`, so a DST edge
  // between the two does not shift the result by an hour. One refinement pass
  // converges for every real zone.
  const first = new Date(naive.getTime() - offsetMs(naive, timeZone));
  return new Date(naive.getTime() - offsetMs(first, timeZone));
}

/**
 * Inverse of wallClockToInstant: render an instant as the "YYYY-MM-DDTHH:mm"
 * string a datetime-local input expects, in the given IANA zone.
 *
 * @param {Date|{toDate: function}|number|string} tsOrDate
 * @param {string} timeZone - IANA zone.
 * @returns {string}
 */
export function instantToWallClock(tsOrDate, timeZone) {
  const date = toDate(tsOrDate);
  if (!date || !timeZone) return "";

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/**
 * Coerce a Firestore Timestamp, JS Date, epoch number, or ISO string into a
 * Date. Returns null for anything unparseable (including an unresolved
 * serverTimestamp, which reads back as null before the write lands).
 */
export function toDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date?.getTime?.()) ? null : date;
}

// ── Display helpers ──────────────────────────────────────────────────────────

/**
 * "Mon, Aug 17" in the leg's own zone.
 */
export function formatFlightDate(tsOrDate, timeZone) {
  const date = toDate(tsOrDate);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * "7:05 PM" in the leg's own zone.
 */
export function formatFlightTime(tsOrDate, timeZone) {
  const date = toDate(tsOrDate);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Short zone abbreviation for a rendered time, e.g. "PDT" or "SGT". Derived
 * from Intl at the given instant so it reflects DST where it applies.
 */
export function tzLabel(tsOrDate, timeZone) {
  const date = toDate(tsOrDate) || new Date(0);
  if (!timeZone) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
    hour: "numeric",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value || "";
}

// ── Layover ──────────────────────────────────────────────────────────────────

/**
 * Format a duration in milliseconds as "2h 45m" (or "45m", "1d 3h 20m").
 */
function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

/**
 * Layover between two consecutive segments, computed from their absolute
 * arrival/departure instants. Returns a formatted string (e.g. "2h 45m") or
 * null when the segments do not connect — that is, when there is no following
 * segment, when the arrival airport of the first does not match the departure
 * airport of the next, or when the times overlap/are missing. Because both
 * sides are absolute instants, the math is correct across the international
 * date line and stays correct when a segment time is edited.
 */
export function computeLayover(prevSegment, nextSegment) {
  if (!prevSegment || !nextSegment) return null;

  const arrival = toDate(prevSegment.arrivalDateTime);
  const departure = toDate(nextSegment.departureDateTime);
  if (!arrival || !departure) return null;

  // Only a genuine connection through the same airport counts as a layover.
  const arrAirport = normalizeAirport(prevSegment.arrivalAirport);
  const depAirport = normalizeAirport(nextSegment.departureAirport);
  if (!arrAirport || !depAirport || arrAirport !== depAirport) return null;

  const diff = departure.getTime() - arrival.getTime();
  if (diff <= 0) return null;

  return formatDuration(diff);
}

function normalizeAirport(value) {
  return (value || "").trim().toUpperCase();
}

// ── Validation ─────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  ["airline", "Airline"],
  ["flightNumber", "Flight number"],
  ["departureAirport", "Departure airport"],
  ["arrivalAirport", "Arrival airport"],
  ["departureDateTime", "Departure date and time"],
  ["arrivalDateTime", "Arrival date and time"],
  ["departureTimeZone", "Departure time zone"],
  ["arrivalTimeZone", "Arrival time zone"],
];

/**
 * Validate an assembled flight-segment payload.
 * departureDateTime / arrivalDateTime are expected as Date instants here.
 *
 * @returns {{ valid: boolean, errors: Object<string,string> }}
 */
export function validateFlight(data) {
  const errors = {};
  const d = data || {};

  for (const [key, label] of REQUIRED_FIELDS) {
    const value = d[key];
    const missing =
      value == null ||
      (typeof value === "string" && value.trim() === "");
    if (missing) errors[key] = `${label} is required.`;
  }

  // Instants must actually parse.
  if (!errors.departureDateTime && !toDate(d.departureDateTime)) {
    errors.departureDateTime = "Departure date and time is invalid.";
  }
  if (!errors.arrivalDateTime && !toDate(d.arrivalDateTime)) {
    errors.arrivalDateTime = "Arrival date and time is invalid.";
  }

  // Arrival must not precede departure once both are absolute instants.
  const dep = toDate(d.departureDateTime);
  const arr = toDate(d.arrivalDateTime);
  if (dep && arr && arr.getTime() < dep.getTime()) {
    errors.arrivalDateTime = "Arrival cannot be before departure.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ── Payload shaping ──────────────────────────────────────────────────────────

const OPTIONAL_STRING_FIELDS = [
  "confirmationNumber",
  "seatNumber",
  "cabinClass",
  "terminal",
  "gate",
  "bookingClass",
  "notes",
];

/**
 * Build the Firestore payload from editor data, trimming strings and dropping
 * empty optionals so a document never carries blank noise.
 */
function shapePayload(data) {
  const payload = {
    airline: (data.airline || "").trim(),
    flightNumber: (data.flightNumber || "").trim(),
    departureAirport: (data.departureAirport || "").trim(),
    arrivalAirport: (data.arrivalAirport || "").trim(),
    departureDateTime: toDate(data.departureDateTime),
    arrivalDateTime: toDate(data.arrivalDateTime),
    departureTimeZone: data.departureTimeZone,
    arrivalTimeZone: data.arrivalTimeZone,
  };

  for (const key of OPTIONAL_STRING_FIELDS) {
    payload[key] = (data[key] || "").trim();
  }

  return payload;
}

// ── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Subscribe to a user's flight segments in travel order (segmentOrder asc).
 * Returns an unsubscribe function.
 */
export function subscribeFlights(uid, callback, onError) {
  const q = query(flightsColRef(uid), orderBy("segmentOrder", "asc"));
  return watch(
    "user-flights",
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError
  );
}

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Validate and add a flight segment. Assigns the next segmentOrder (max
 * existing + 1) so new legs land at the end of the timeline, and stamps
 * createdAt/updatedAt server timestamps.
 *
 * @returns {Promise<string>} the new document ID.
 */
export async function addFlight(uid, data) {
  const { valid, errors } = validateFlight(data);
  if (!valid) {
    const err = new Error("Please fix the highlighted fields.");
    err.fieldErrors = errors;
    throw err;
  }

  const segmentOrder = await nextSegmentOrder(uid);

  const docRef = await addDoc(flightsColRef(uid), {
    ...shapePayload(data),
    segmentOrder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * The next segmentOrder for a new segment: one past the current maximum, or 0
 * when the member has no segments yet.
 */
async function nextSegmentOrder(uid) {
  const q = query(
    flightsColRef(uid),
    orderBy("segmentOrder", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;
  const top = snap.docs[0].data().segmentOrder;
  return typeof top === "number" ? top + 1 : 0;
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Validate and update a flight segment, refreshing updatedAt. segmentOrder is
 * left untouched — use reorderFlights to change position.
 */
export async function updateFlight(uid, flightId, data) {
  const { valid, errors } = validateFlight(data);
  if (!valid) {
    const err = new Error("Please fix the highlighted fields.");
    err.fieldErrors = errors;
    throw err;
  }

  await updateDoc(flightDocRef(uid, flightId), {
    ...shapePayload(data),
    updatedAt: serverTimestamp(),
  });
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Delete a flight segment.
 */
export async function deleteFlight(uid, flightId) {
  await deleteDoc(flightDocRef(uid, flightId));
}

// ── Reorder ────────────────────────────────────────────────────────────────────

/**
 * Batch-write new segmentOrder values from an ordered list of segment IDs, so
 * the timeline re-sorts to match. Order is the array index (0,1,2…).
 */
export async function reorderFlights(uid, orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;

  const batch = writeBatch(db);
  orderedIds.forEach((flightId, index) => {
    batch.update(flightDocRef(uid, flightId), {
      segmentOrder: index,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/**
 * Trip-level confirmation number: the shared PNR when every segment carries the
 * same non-empty confirmationNumber, otherwise null (callers then show it
 * per-segment). Keeps the common single-booking case tidy without hiding a
 * split booking.
 */
export function tripConfirmationNumber(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const values = segments.map((s) => (s.confirmationNumber || "").trim());
  if (values.some((v) => v === "")) return null;
  const first = values[0].toUpperCase();
  return values.every((v) => v.toUpperCase() === first) ? values[0] : null;
}
