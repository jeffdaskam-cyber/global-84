/**
 * lookupFlight — Firebase Cloud Function (HTTPS)
 *
 * Looks up a scheduled flight by designator + departure date and returns a
 * provider-neutral result the flight editor drops straight into its fields.
 * The flight-data API key is held in Firebase Secret Manager and never touches
 * the browser bundle — same boundary as translateImage.
 *
 * Three things sit in front of the paid API call:
 *   1. Member auth — a verified @du.edu Firebase ID token, like every other
 *      function here.
 *   2. A per-user, fail-closed rate limit — stops one member (or a stolen
 *      token) from looping the endpoint and running up the bill.
 *   3. A shared, server-only cache keyed on designator+date — serves one real
 *      lookup to every traveller on the same flight, which is the whole point
 *      of a cohort trip tool. There is no scheduler: results refresh on demand
 *      (a normal lookup within the TTL is served from cache; the editor's
 *      Refresh button sets forceRefresh to fetch live).
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import corsLib from "cors";

// Initialize the Admin SDK once (used to verify caller ID tokens and to read
// and write the cache / rate-limit collections with server privileges).
if (getApps().length === 0) {
  initializeApp();
}

// Keep in sync with VITE_ALLOWED_EMAIL_DOMAIN and firestore.rules.
const ALLOWED_EMAIL_DOMAIN = "du.edu";

// Per-user rate limit. Auth stops strangers; this stops a single authenticated
// member from spraying unique designators (which miss the cache and each cost a
// real API call). Counts live in a top-level `flightLookupRateLimits`
// collection with no match block in firestore.rules, so it is default-denied to
// every client — only this Admin SDK code can touch it.
const RATE_LIMIT_MAX = 60;                     // lookups allowed per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;   // rolling window length: 1 hour

// How long a cached result is considered fresh. Long enough to dedupe the burst
// of cohort members entering the same flight and to keep routine re-opens off
// the API; short enough that day-of gate/terminal changes surface within a few
// hours. The Refresh button bypasses this entirely for an up-to-the-minute read.
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;       // 3 hours

// Server-side shape of the lookup key. The client validates too, but the
// endpoint is public at the platform level, so never trust the body.
const DESIGNATOR_RE = /^[A-Z0-9]{2}[0-9]{1,4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * One normalized flight option. The departure and arrival times are absolute
 * UTC instants (ISO) plus the airport's IANA zone, which is exactly what the editor
 * needs: it sets the zone dropdown and derives the local wall clock with its
 * existing instantToWallClock helper. Terminal/gate/aircraft are optional —
 * they are frequently unpublished until close to departure.
 */
interface FlightMatch {
  designator: string;
  airlineName: string;
  iataCode: string;
  departureAirport: string;      // IATA
  arrivalAirport: string;        // IATA
  departureAirportName: string;
  arrivalAirportName: string;
  departureTimeUtc: string | null;   // ISO instant
  arrivalTimeUtc: string | null;
  departureTimeZone: string | null;  // IANA
  arrivalTimeZone: string | null;
  departureTerminal: string | null;
  arrivalTerminal: string | null;
  departureGate: string | null;
  arrivalGate: string | null;
  aircraftType: string | null;
  status: string | null;
}

/**
 * Fixed-window rate limit for one member, enforced atomically in a Firestore
 * transaction so a burst of concurrent requests from the same uid can't race
 * past the ceiling. Mirrors the translateImage limiter.
 */
async function checkRateLimit(uid: string): Promise<RateLimitResult> {
  const ref = getFirestore().collection("flightLookupRateLimits").doc(uid);
  const now = Date.now();

  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { windowStartMs?: number; count?: number } | undefined;

    const windowStartMs = data?.windowStartMs ?? 0;
    const count = data?.count ?? 0;

    if (now - windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStartMs: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (count >= RATE_LIMIT_MAX) {
      const retryAfterSeconds = Math.ceil(
        (windowStartMs + RATE_LIMIT_WINDOW_MS - now) / 1000,
      );
      return { allowed: false, retryAfterSeconds };
    }

    tx.update(ref, { count: FieldValue.increment(1) });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

// Reference the secret stored in Firebase Secret Manager.
// Set it once with: firebase functions:secrets:set AERODATABOX_API_KEY
const aeroDataBoxKey = defineSecret("AERODATABOX_API_KEY");

/**
 * Verify the Firebase ID token and confirm the caller is a verified member of
 * the allowed domain. Returns the uid, or null. Identical boundary to the other
 * functions: `invoker: "public"` only gets past the platform, this is the real
 * gate that protects the API budget from direct (curl) callers.
 */
async function verifyMember(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) return null;

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const email = (decoded.email || "").toLowerCase();
    if (!decoded.email_verified) return null;
    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

const cors = corsLib({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === "http://localhost:5173" ||
      origin.endsWith(".vercel.app")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// ── Provider adapter ─────────────────────────────────────────────────────────
//
// AeroDataBox is the primary provider. Everything provider-specific lives behind
// fetchFlights(), so swapping in AviationStack later is a single-file change:
// implement the same (designator, date) → FlightMatch[] contract and the rest
// of the function is untouched.
//
// IMPORTANT: the exact response field paths below are AeroDataBox's documented
// v1 shape at time of writing. API shapes drift — confirm against live docs when
// the key is wired, and adjust the readers in mapAeroDataBoxFlight only. The
// readers are written defensively (optional chaining, nulls) so a missing field
// degrades to "unknown" rather than throwing.

const AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";

/**
 * AeroDataBox returns scheduled times as { utc: "2026-09-14 15:30Z",
 * local: "2026-09-14 11:30-04:00" }. Turn the space-separated UTC form into a
 * proper ISO instant ("2026-09-14T15:30:00Z"); return null if absent/unparseable.
 */
function toIsoInstant(utc: string | undefined | null): string | null {
  if (!utc) return null;
  const normalized = utc.trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Map one AeroDataBox flight object to our normalized FlightMatch.
 */
function mapAeroDataBoxFlight(flight: any, fallbackDesignator: string): FlightMatch {
  const dep = flight?.departure ?? {};
  const arr = flight?.arrival ?? {};
  const depAirport = dep.airport ?? {};
  const arrAirport = arr.airport ?? {};

  return {
    designator: str(flight?.number)?.replace(/\s+/g, "") ?? fallbackDesignator,
    airlineName: str(flight?.airline?.name) ?? "",
    iataCode: str(flight?.airline?.iata) ?? "",
    departureAirport: str(depAirport.iata) ?? "",
    arrivalAirport: str(arrAirport.iata) ?? "",
    departureAirportName: str(depAirport.name) ?? "",
    arrivalAirportName: str(arrAirport.name) ?? "",
    departureTimeUtc: toIsoInstant(dep.scheduledTime?.utc),
    arrivalTimeUtc: toIsoInstant(arr.scheduledTime?.utc),
    departureTimeZone: str(depAirport.timeZone),
    arrivalTimeZone: str(arrAirport.timeZone),
    departureTerminal: str(dep.terminal),
    arrivalTerminal: str(arr.terminal),
    departureGate: str(dep.gate),
    arrivalGate: str(arr.gate),
    aircraftType: str(flight?.aircraft?.model),
    status: str(flight?.status),
  };
}

/**
 * Fetch flights from AeroDataBox for a designator + date.
 *
 * @returns FlightMatch[] — empty when the number isn't found for that date.
 * @throws Error tagged with `.upstreamStatus` when the provider errors, so the
 *   handler can map it to a 502 without leaking provider detail to the client.
 */
async function fetchFlights(
  designator: string,
  date: string,
  apiKey: string,
): Promise<FlightMatch[]> {
  // withLeg/withAircraftImage/etc. default off; we only need schedule fields.
  const url =
    `https://${AERODATABOX_HOST}/flights/number/${encodeURIComponent(designator)}/${encodeURIComponent(date)}` +
    `?withAircraftImage=false&withLocation=false`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": AERODATABOX_HOST,
    },
  });

  // A 204/404 from AeroDataBox means "no flight for that number+date" — a normal
  // zero-match result, not an error. Fall back to manual entry on the client.
  if (response.status === 204 || response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("lookupFlight: provider error", { status: response.status, body });
    const err = new Error(`Provider returned HTTP ${response.status}`) as Error & {
      upstreamStatus?: number;
    };
    err.upstreamStatus = response.status;
    throw err;
  }

  const data = await response.json().catch(() => null);
  // The by-number endpoint returns an array of flight objects (one per operating
  // occurrence / leg). Guard against a single-object or wrapped response too.
  const flights: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.flights)
      ? data.flights
      : data
        ? [data]
        : [];

  return flights.map((f) => mapAeroDataBoxFlight(f, designator));
}

// ── Cache ────────────────────────────────────────────────────────────────────

/**
 * Cache doc id for a designator+date. Both parts are already validated to safe
 * characters, so the composite is a legal Firestore document id.
 */
function cacheKey(designator: string, date: string): string {
  return `${designator}|${date}`;
}

interface CacheDoc {
  matches: FlightMatch[];
  fetchedAt: Timestamp;
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * Expected POST body (JSON):
 *   { designator: string, date: string, forceRefresh?: boolean }
 *
 * Response (JSON):
 *   { matches: FlightMatch[], cached: boolean }
 *
 * Left in the default us-central1 region (unlike translateImage's Singapore
 * pin): there is no large upload here, and the two chatty dependencies — the
 * rate-limit transaction and the cache read/write — both live in the nam5
 * (US) Firestore, so colocating with them is the win. The one cross-region hop
 * is the provider call, which is the same distance from anywhere.
 */
export const lookupFlight = onRequest(
  {
    secrets: [aeroDataBoxKey],
    invoker: "public",
  },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed. Use POST." });
        return;
      }

      const uid = await verifyMember(req.headers.authorization);
      if (!uid) {
        res.status(401).json({ error: "Unauthorized. Sign in to use this feature." });
        return;
      }

      const { designator: rawDesignator, date, forceRefresh } = req.body as {
        designator?: string;
        date?: string;
        forceRefresh?: boolean;
      };

      const designator = (rawDesignator || "").trim().toUpperCase();
      if (!DESIGNATOR_RE.test(designator)) {
        res.status(400).json({ error: "Invalid flight designator." });
        return;
      }
      if (!ISO_DATE_RE.test(date || "")) {
        res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
        return;
      }

      const db = getFirestore();
      const cacheRef = db.collection("flightLookups").doc(cacheKey(designator, date as string));

      // Serve a fresh cache hit without touching the rate limit or the provider:
      // a cached read costs nothing and shouldn't count against the member.
      if (!forceRefresh) {
        try {
          const snap = await cacheRef.get();
          if (snap.exists) {
            const cached = snap.data() as CacheDoc;
            const fetchedMs = cached.fetchedAt?.toMillis?.() ?? 0;
            if (Date.now() - fetchedMs < CACHE_TTL_MS) {
              res.status(200).json({ matches: cached.matches ?? [], cached: true });
              return;
            }
          }
        } catch (err) {
          // A cache read failure is not fatal — fall through to a live fetch.
          logger.warn("lookupFlight: cache read failed, fetching live", err);
        }
      }

      // Cache miss (or forced refresh): this will spend an API call, so
      // rate-limit first, fail-closed like translateImage.
      let rate: RateLimitResult;
      try {
        rate = await checkRateLimit(uid);
      } catch (err) {
        logger.error("lookupFlight: rate-limit check failed", err);
        res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
        return;
      }
      if (!rate.allowed) {
        res.set("Retry-After", String(rate.retryAfterSeconds));
        res.status(429).json({
          error: "You've hit the flight lookup limit for now. Please try again later.",
        });
        return;
      }

      let matches: FlightMatch[];
      try {
        logger.info("lookupFlight: calling provider", { designator, date });
        matches = await fetchFlights(designator, date as string, aeroDataBoxKey.value());
      } catch (err) {
        const status = (err as { upstreamStatus?: number }).upstreamStatus;
        if (status) {
          res.status(502).json({
            error: `Flight data service error (${status}). Please try again.`,
          });
        } else {
          logger.error("lookupFlight: unexpected error", err);
          res.status(500).json({ error: "An unexpected error occurred. Please try again." });
        }
        return;
      }

      // Cache only non-empty results. A "not found" is often a schedule that
      // simply isn't published yet, and we don't want to pin that miss for the
      // whole TTL — let the next member's lookup try the provider again.
      if (matches.length > 0) {
        try {
          await cacheRef.set({ matches, fetchedAt: FieldValue.serverTimestamp() });
        } catch (err) {
          // Losing the cache write only costs a future duplicate call; still
          // return the result we already have.
          logger.warn("lookupFlight: cache write failed", err);
        }
      }

      res.status(200).json({ matches, cached: false });
    });
  },
);
