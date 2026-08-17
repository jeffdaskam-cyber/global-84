# Flight Info Auto-Fill — Implementation Plan (revised)

**App:** Global 84 Travel Hub
**Status:** Validated against the repo. Ready to build.
**Decisions locked:** on-demand refresh only (no scheduler); keep airline display name + add IATA code; server-side via Firebase Cloud Function.

This revises the original spec after reading the actual code. It replaces the spec's open assumptions with what the repo really does, and drops the parts that were over-scoped for a private cohort trip tool.

---

## 1. Confirmed current state (spec §2 answered)

| Spec question | Answer from the repo |
|---|---|
| Flight data model / schema | `cohorts/{cohortId}/members/{uid}/flights/{flightId}`, defined in `src/lib/userFlights.js`. Per-member subcollection. |
| Manual-entry form + validation | `src/components/features/FlightEditorModal.jsx`; validation is `validateFlight()` in `src/lib/userFlights.js`. |
| How date/timezone is stored | **Absolute instants** (`departureDateTime` / `arrivalDateTime` Firestore Timestamps) **plus separate IANA zones** (`departureTimeZone` / `arrivalTimeZone`). There is **no standalone date field.** |
| HTTP client / API-key secret pattern | Yes: `functions/src/translateImage.ts` — Firebase v2 `onRequest` + Secret Manager (`defineSecret`) + ID-token auth + per-user rate limit. Client side: `src/lib/translate.js`. |
| Server-side vs client-only | Both surfaces exist (Firebase `functions/`, Vercel `api/`). The secret-holding pattern lives in `functions/`. Use it. |

**Existing flight fields:** `airline` (display name), `flightNumber`, `departureAirport`, `arrivalAirport`, `departureDateTime`, `arrivalDateTime`, `departureTimeZone`, `arrivalTimeZone`, `terminal`, `gate`, `seatNumber`, `cabinClass`, `bookingClass`, `confirmationNumber`, `notes`, `segmentOrder`, `createdAt`, `updatedAt`.

**No migration needed.** Firestore is schemaless; new fields are additive and old docs keep rendering.

---

## 2. Data model changes

Add these optional fields to a flight document (all nullable / omitted when empty, consistent with `OPTIONAL_STRING_FIELDS`):

- `iataCode` — 2-char airline IATA code (the lookup key; separate from `airline` display name).
- `flightStatus` — e.g. `on time` / `delayed` / `departed` / `landed` (from API `status`).
- `aircraftType` — optional (API `aircraft.model`).
- `source` — `"manual"` (default) or `"api"`; marks the record as auto-filled.
- `autoFilledFields` — optional array of field keys the API populated, so the UI can badge them and edits read as overrides.
- `lastLookupAt` — server timestamp of the most recent successful lookup (for the Refresh button / cache freshness).

`shapePayload()` and the editor state extend to carry these. `validateFlight()` is unchanged for required fields; `iataCode` is validated only in the lookup path (§4), not as a hard requirement (manual entry must still save without it).

---

## 3. UX flow (revised for the instant-based model)

1. **Airline** — searchable dropdown driven by a name→IATA table (spec §9). Stores **both** `airline` (name, for cards) and `iataCode` (for lookup). Free-text remains possible as fallback (leaves `iataCode` empty).
2. **Flight number** — numeric, normalized to `^\d{1,4}$`.
3. **Departure date** — **new** date-only input (departure airport local date), used *only* as the lookup key. This resolves the spec's chicken-and-egg: for a new flight the departure instant doesn't exist yet, so we can't "reuse" it. This small field seeds the lookup; the API then fills the actual departure/arrival instants.
4. **Look up flight** button (explicit, not on-blur — cheaper and clearer):
   - **1 match:** auto-fill airports, both instants, both IANA zones, terminal/gate/status/aircraft. Fields stay editable; auto-filled ones get an "auto" badge.
   - **Multiple matches:** compact chooser (origin→destination + departure time); user picks.
   - **0 matches / error:** silently fall back to manual entry; nothing is lost.
5. **Refresh** button on an existing API-sourced segment re-runs the lookup on demand (no automatic polling).

**Timezone auto-fill is a headline feature, not a footnote.** Today the user hand-picks IANA zones from a 14-entry dropdown — the most error-prone step. The API's airport codes + local/UTC times let us set both zones and convert to instants via the **existing** `wallClockToInstant()`. Needs an airport-IATA → IANA lookup (small static table for the trip's airports, or derive the offset from the API's paired local/UTC times).

---

## 4. Normalization & lookup key

Canonical key: `<IATA><flightNumber>` + `<YYYY-MM-DD>` (departure local date). Example: `SQ` + `37` + `2026-09-14` → `SQ37`, `2026-09-14`.

Client-side, before spending a call:
- `iataCode`: non-empty, 2 chars, uppercased (from dropdown).
- `flightNumber`: strip non-digits and leading zeros; must match `^\d{1,4}$`.
- Concatenate to the designator; pass date as ISO.

Put this in a new `src/lib/flightLookup.js` (mirrors `translate.js`): validate → get `idToken` → POST to the Cloud Function.

---

## 5. Server: Cloud Function (clone the translateImage pattern)

New `functions/src/lookupFlight.ts`, registered in `functions/src/index.ts`:

- `onRequest` v2, `region: "asia-southeast1"` (same as translate; cohort is US↔Asia).
- Secret: `AERODATABOX_API_KEY` via `defineSecret` (set once with `firebase functions:secrets:set`).
- Auth: reuse the `verifyMember()` shape — verified `du.edu` ID token required.
- **Per-user rate limit:** reuse the fail-closed Firestore-transaction limiter (`flightLookupRateLimits` collection, no rules match block → default-denied).
- **Shared cache (dedupe across members):** top-level `flightLookups/{designator|date}` doc, admin-only (no rules match block). On request: return the cached doc if fresh; otherwise call AeroDataBox, write the doc, return it. This is what serves "one lookup to all travelers on the same flight" without any scheduler.
- CORS: same allowlist (localhost:5173, `*.vercel.app`).
- **Provider adapter:** a thin `provider` module so AeroDataBox is swappable (AviationStack fallback per spec §5). Build against the *observed* AeroDataBox response, mapping to the field table below. Confirm RapidAPI headers (`X-RapidAPI-Key`, `X-RapidAPI-Host`) and the `/flights/number/{designator}/{date}` path against live docs at build time.

Response → normalized shape returned to the client:

| Returned field | AeroDataBox source (verify live) |
|---|---|
| `departureAirport` | `departure.airport.iata` |
| `arrivalAirport` | `arrival.airport.iata` |
| `departureLocal` / `departureUtc` | `departure.scheduledTime.local` / `.utc` |
| `arrivalLocal` / `arrivalUtc` | `arrival.scheduledTime.local` / `.utc` |
| `departureTimeZoneName` / `arrivalTimeZoneName` | derived from airport → IANA |
| `terminal` / `gate` (dep/arr) | `departure.terminal` / `.gate`, etc. (often null) |
| `aircraftType` | `aircraft.model` |
| `flightStatus` | `status` |
| `matches[]` | array when the number runs more than once that day |

Null terminals/gates are expected until close to departure — treat as optional everywhere.

---

## 6. Client wiring

- `src/lib/airlines.js` — name→IATA table (spec §9 starter set, extended to the trip's real carriers; allow a digit in either position, e.g. `U2`, `B6`).
- `src/lib/flightLookup.js` — the fetch helper (§4).
- `FlightEditorModal.jsx` — swap the airline `Field` for an autocomplete backed by `airlines.js`; add the departure-date lookup input, the "Look up flight" button, the multiple-match chooser, and "auto" badges on populated fields. On a successful single match, set the existing editor state (airports, walls, zones, terminal, gate) so the rest of the form and `wallClockToInstant` work unchanged.
- `Me.jsx` — optionally show `flightStatus` on the card; card title stays `{airline} {flightNumber}` (unchanged, since we kept the display name).

---

## 7. Explicitly out of scope for v1

- **Automatic day-of polling / Cloud Scheduler.** No scheduler exists in this project today, and gen-2 scheduled deploys carry the Eventarc first-deploy quirk. On-demand + manual Refresh covers a ~12–15-flight trip. Revisit as v2 if wanted.
- Aircraft position / map tracking, booking, pricing (spec non-goals).

---

## 8. Cost & licensing

Private du.edu EMBA cohort tool, not commercial. On-demand + shared cache keeps calls to roughly one per unique flight plus occasional refreshes — comfortably inside AeroDataBox's free tier. Confirm ToS permits the use at build time (spec open Q4).

---

## 9. Build order

1. `airlines.js` table + `flightLookup.js` client helper (pure, testable).
2. `lookupFlight.ts` Cloud Function (clone translateImage): secret, auth, rate limit, cache, adapter. Deploy; expect the gen-2 first-deploy retry.
3. Wire `VITE_LOOKUP_FLIGHT_FUNCTION_URL` into `.env.example` + Vercel env.
4. Editor UI: airline autocomplete, lookup date, Look-up button, match chooser, badges.
5. Model plumbing: extend `shapePayload` / editor state for `iataCode`, `flightStatus`, `aircraftType`, `source`, `autoFilledFields`, `lastLookupAt`.
6. Optional: surface `flightStatus` on the Me.jsx card.
