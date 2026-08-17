/**
 * airlines.js — Airline name ↔ IATA code table and search.
 *
 * Drives the airline autocomplete in the flight editor. The member sees and
 * picks a carrier by name; the app stores the display name (for the timeline
 * cards, which render `{airline} {flightNumber}` verbatim) alongside the
 * 2-character IATA code, which is what the flight-lookup API keys on.
 *
 * The list leads with the carriers this cohort's US↔Singapore/Vietnam itinerary
 * actually uses, then common long-haul and low-cost carriers so a member on an
 * off-itinerary connection can still find their flight. Extend it as real
 * bookings come in — a name that isn't here still works as free text, it just
 * doesn't seed an API lookup.
 *
 * IATA airline codes are two characters and may carry a digit in either
 * position (U2 easyJet, B6 JetBlue, 3K Jetstar Asia), so the code column is not
 * purely alphabetic — validation must allow the digit.
 */

export const AIRLINES = [
  // Carriers the cohort is most likely to fly into/through Asia.
  { name: "Singapore Airlines", iata: "SQ" },
  { name: "United Airlines", iata: "UA" },
  { name: "Delta Air Lines", iata: "DL" },
  { name: "American Airlines", iata: "AA" },
  { name: "Cathay Pacific", iata: "CX" },
  { name: "Japan Airlines", iata: "JL" },
  { name: "ANA", iata: "NH" },
  { name: "Korean Air", iata: "KE" },
  { name: "EVA Air", iata: "BR" },
  { name: "Vietnam Airlines", iata: "VN" },
  { name: "Thai Airways", iata: "TG" },
  { name: "Malaysia Airlines", iata: "MH" },
  { name: "Qatar Airways", iata: "QR" },
  { name: "Emirates", iata: "EK" },
  { name: "Scoot", iata: "TR" },
  { name: "Jetstar Asia", iata: "3K" },

  // Common US and European carriers for the outbound/return legs.
  { name: "Southwest Airlines", iata: "WN" },
  { name: "JetBlue Airways", iata: "B6" },
  { name: "Alaska Airlines", iata: "AS" },
  { name: "Hawaiian Airlines", iata: "HA" },
  { name: "British Airways", iata: "BA" },
  { name: "Air France", iata: "AF" },
  { name: "Lufthansa", iata: "LH" },
  { name: "KLM", iata: "KL" },
  { name: "Turkish Airlines", iata: "TK" },
  { name: "Qantas", iata: "QF" },
  { name: "easyJet", iata: "U2" },
  { name: "Ryanair", iata: "FR" },
];

/**
 * Uppercase, whitespace-trimmed IATA code, or "" for anything falsy.
 */
export function normalizeIataCode(code) {
  return (code || "").trim().toUpperCase();
}

/**
 * Find an airline by its IATA code (case-insensitive). Returns the entry or
 * null.
 */
export function findAirlineByCode(code) {
  const wanted = normalizeIataCode(code);
  if (!wanted) return null;
  return AIRLINES.find((a) => a.iata === wanted) || null;
}

/**
 * Find an airline by exact display name (case-insensitive). Returns the entry
 * or null. Used to recover the IATA code when an existing record only stored
 * the name.
 */
export function findAirlineByName(name) {
  const wanted = (name || "").trim().toLowerCase();
  if (!wanted) return null;
  return AIRLINES.find((a) => a.name.toLowerCase() === wanted) || null;
}

/**
 * Search the table for the autocomplete. Matches the query against both the
 * airline name and its IATA code, so typing "SQ", "singapore", or "sing" all
 * surface Singapore Airlines. Case- and whitespace-insensitive.
 *
 * Ranking: a code exact-match first, then name-prefix matches, then anything
 * else that contains the query — so the most likely pick sits at the top of the
 * dropdown. Preserves the table's own order within each tier (itinerary
 * carriers before the long tail).
 *
 * @param {string} query
 * @param {number} [limit=8] - Max results to return.
 * @returns {Array<{name: string, iata: string}>}
 */
export function searchAirlines(query, limit = 8) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return AIRLINES.slice(0, limit);

  const exactCode = [];
  const namePrefix = [];
  const contains = [];

  for (const airline of AIRLINES) {
    const name = airline.name.toLowerCase();
    const code = airline.iata.toLowerCase();

    if (code === q) {
      exactCode.push(airline);
    } else if (name.startsWith(q)) {
      namePrefix.push(airline);
    } else if (name.includes(q) || code.includes(q)) {
      contains.push(airline);
    }
  }

  return [...exactCode, ...namePrefix, ...contains].slice(0, limit);
}
