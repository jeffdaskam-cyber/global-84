/**
 * Trip timezones.
 *
 * Every time in this app describes something happening in one of the trip
 * cities, so both halves of the round trip — the datetime-local input an admin
 * types into, and the string a member reads off a card — are anchored to the
 * destination's wall clock rather than to whichever timezone the device
 * happens to be in.
 *
 * Without this anchor the app has two distinct failures. An admin planning
 * from Denver types "7:00 PM" meaning dinner in Singapore and stores 7pm
 * Denver, which is 9am the next morning in Singapore. And once abroad, members
 * whose phones have picked up local time read a different clock time off the
 * same event than members still on airplane mode or a manual timezone — the
 * cohort splits an hour apart at exactly the Singapore/Vietnam border.
 *
 * Neither Asia/Singapore nor Asia/Ho_Chi_Minh observes DST, so their offsets
 * (+08:00 and +07:00) are fixed year-round. The conversion below is written
 * against the IANA database anyway rather than hardcoding those numbers.
 */

export const CITY_TIME_ZONES = {
  "Singapore": { zone: "Asia/Singapore", label: "SGT" },
  "Ho Chi Minh City": { zone: "Asia/Ho_Chi_Minh", label: "ICT" },
};

export const DEFAULT_TRIP_CITY = "Singapore";

/**
 * Resolve a city name to its zone. Unknown or missing cities fall back to the
 * default trip city rather than to the device, so a malformed city value can
 * never silently reintroduce device-local rendering.
 */
export function zoneForCity(city) {
  return CITY_TIME_ZONES[city] || CITY_TIME_ZONES[DEFAULT_TRIP_CITY];
}

/**
 * How far `timeZone` is ahead of UTC at the given instant, in milliseconds.
 * Derived from Intl rather than a table so it stays correct if the trip ever
 * adds a city that does observe DST.
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
    // Some engines render midnight as hour "24" under hour12:false.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );

  return asUTC - date.getTime();
}

/**
 * Read a `datetime-local` value ("2026-08-05T19:00") as wall-clock time in the
 * given city and return the instant it denotes.
 *
 * @param {string} wallClock - Value straight from an <input type="datetime-local">.
 * @param {string} city - A key of CITY_TIME_ZONES.
 * @returns {Date}
 */
export function wallClockToInstant(wallClock, city) {
  if (!wallClock) return null;
  const { zone } = zoneForCity(city);

  // Read the typed digits as if they were UTC, then subtract the zone's offset.
  const naive = new Date(`${wallClock}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  // The offset must be sampled at the target instant, not at `naive`, or a
  // DST transition between the two would shift the result by an hour. One
  // refinement pass converges for every real zone.
  const first = new Date(naive.getTime() - offsetMs(naive, zone));
  return new Date(naive.getTime() - offsetMs(first, zone));
}

/**
 * Inverse of wallClockToInstant: render an instant as the "YYYY-MM-DDTHH:mm"
 * string a datetime-local input expects, in the city's wall clock.
 *
 * @param {Date|{toDate: function}} tsOrDate
 * @param {string} city - A key of CITY_TIME_ZONES.
 * @returns {string}
 */
export function instantToWallClock(tsOrDate, city) {
  if (!tsOrDate) return "";
  const date = tsOrDate?.toDate ? tsOrDate.toDate() : new Date(tsOrDate);
  if (Number.isNaN(date.getTime())) return "";

  const { zone } = zoneForCity(city);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
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
