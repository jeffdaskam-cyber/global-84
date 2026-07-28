import { zoneForCity } from "../config/timezones";

/**
 * Format a trip timestamp in the destination city's wall clock.
 *
 * The `city` argument is what makes this reliable: rendering in the device's
 * timezone means two members standing in the same room read different times off
 * the same event whenever one phone has picked up local time and the other has
 * not. The zone label is always appended so the displayed time stays
 * unambiguous even to someone whose phone is still on Denver time.
 *
 * @param {Date|{toDate: function}} ts
 * @param {string} city - A key of CITY_TIME_ZONES; unknown values fall back to
 *   the default trip city, never to the device.
 */
export function fmtDateTime(ts, city) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";

  const { zone, label } = zoneForCity(city);

  const formatted = d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  });

  return `${formatted} ${label}`;
}
