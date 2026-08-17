/**
 * flightLookup.js — Client-side helper for the flight auto-fill feature.
 *
 * Normalizes an airline code + flight number + departure date into the API's
 * lookup key, then POSTs it to the Firebase Cloud Function that holds the
 * AeroDataBox key server-side. This module never sees the API key, mirrors the
 * auth-token flow in translate.js, and returns a provider-neutral result the
 * flight editor can drop straight into its fields.
 *
 * Usage:
 *   import { lookupFlight } from "./lib/flightLookup.js";
 *   const { matches } = await lookupFlight({ iataCode: "SQ", flightNumber: "37", date: "2026-09-14" });
 */

import { auth } from "./firebase";
import { normalizeIataCode } from "./airlines";

/**
 * Strip a flight number down to the 1–4 digit core the API expects.
 *
 * Removes everything that isn't a digit (so a pasted "SQ 37" or "AA-100"
 * collapses to the number) and drops leading zeros ("0100" → "100"). Returns
 * "" when nothing usable remains, which the validators below treat as invalid —
 * airlines don't operate a flight 0.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeFlightNumber(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  const trimmed = digits.replace(/^0+/, "");
  return trimmed;
}

/**
 * Concatenate a validated IATA code and flight number into the API designator,
 * e.g. "SQ" + "37" → "SQ37". Returns "" if either part is missing.
 */
export function buildDesignator(iataCode, flightNumber) {
  const code = normalizeIataCode(iataCode);
  const number = normalizeFlightNumber(flightNumber);
  if (!code || !number) return "";
  return `${code}${number}`;
}

const FLIGHT_NUMBER_RE = /^\d{1,4}$/;
const IATA_CODE_RE = /^[A-Z0-9]{2}$/; // two chars, digit allowed in either slot
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in ISO YYYY-MM-DD form. Guards against
 * "2026-13-40" slipping through the regex by round-tripping through Date and
 * confirming the parts survive unchanged.
 */
function isRealIsoDate(value) {
  if (!ISO_DATE_RE.test(value || "")) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Validate the lookup inputs before spending an API call. Fails fast on the
 * client so a malformed key never reaches the (rate-limited, billed) function.
 *
 * @param {{iataCode: string, flightNumber: string, date: string}} input
 * @returns {{valid: boolean, errors: Object<string,string>, designator: string}}
 */
export function validateLookupInput({ iataCode, flightNumber, date } = {}) {
  const errors = {};

  const code = normalizeIataCode(iataCode);
  if (!code) {
    errors.iataCode = "Pick an airline from the list first.";
  } else if (!IATA_CODE_RE.test(code)) {
    errors.iataCode = "Airline code must be two characters.";
  }

  const number = normalizeFlightNumber(flightNumber);
  if (!number) {
    errors.flightNumber = "Enter a flight number.";
  } else if (!FLIGHT_NUMBER_RE.test(number)) {
    errors.flightNumber = "Flight number must be 1 to 4 digits.";
  }

  if (!date) {
    errors.date = "Choose the departure date.";
  } else if (!isRealIsoDate(date)) {
    errors.date = "Departure date is invalid.";
  }

  const valid = Object.keys(errors).length === 0;
  return { valid, errors, designator: valid ? buildDesignator(code, number) : "" };
}

/**
 * Look up a flight by airline code + number + departure date.
 *
 * @param {{iataCode: string, flightNumber: string, date: string, forceRefresh?: boolean}} input
 *   - iataCode: 2-char IATA airline code (from the airline dropdown).
 *   - flightNumber: raw flight number; normalized here.
 *   - date: departure date in the departure airport's local zone, ISO
 *     YYYY-MM-DD. This is the red-eye-safe key: a flight leaving 23:55 belongs
 *     to that day in the departure zone.
 *   - forceRefresh: when true, ask the server to bypass its shared cache and
 *     fetch live (the editor's Refresh button). Costs a rate-limit slot.
 * @returns {Promise<{matches: Array<object>}>} A normalized result. `matches`
 *   is an array because a number can operate more than once a day or cover a
 *   multi-leg journey; the editor auto-fills on a single match and shows a
 *   chooser for several. An empty array means no flight was found — the caller
 *   falls back to manual entry.
 * @throws {Error} on validation failure, missing config, missing auth, or a
 *   non-OK response from the Cloud Function.
 */
export async function lookupFlight(input) {
  const { valid, errors, designator } = validateLookupInput(input);
  if (!valid) {
    const err = new Error("Please fix the flight lookup fields.");
    err.fieldErrors = errors;
    throw err;
  }

  const functionUrl = import.meta.env.VITE_LOOKUP_FLIGHT_FUNCTION_URL;
  if (!functionUrl) {
    throw new Error(
      "Flight lookup is not configured. VITE_LOOKUP_FLIGHT_FUNCTION_URL is missing."
    );
  }

  // The Cloud Function only spends its API budget for verified cohort members,
  // so it requires a Firebase ID token — same boundary as the translator.
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please sign in to look up flights.");
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      designator,
      date: input.date,
      forceRefresh: input.forceRefresh === true,
    }),
  });

  if (!response.ok) {
    let message = `Flight lookup failed (HTTP ${response.status}).`;
    try {
      const errData = await response.json();
      if (errData.error) message = errData.error;
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new Error(message);
  }

  const data = await response.json();
  return { matches: Array.isArray(data.matches) ? data.matches : [] };
}
