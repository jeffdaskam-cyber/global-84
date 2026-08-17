// Single source of truth for the trip's start instant and the derived
// `tripStarted` flag. TripCountdown (which hides itself once the trip begins)
// and Home's weather strip (which swaps styling at the same moment) both read
// from here so they can never disagree about whether the trip has started.
//
// First day together in Singapore: Nov 3, 2026, 8:00 AM SGT (UTC+8). Hardcoded
// with an explicit offset so the boundary is identical for every viewer
// regardless of their device timezone.
export const TRIP_START = new Date("2026-11-03T08:00:00+08:00");

export function isTripStarted(now = Date.now()) {
  return now >= TRIP_START.getTime();
}

/**
 * Compact "time until" label for an upcoming instant: "in 20m", "in 3h",
 * "in 3 days". Returns "now" once the instant has passed. Used by the Up Next
 * rows so a flight and an itinerary item read the same way.
 *
 * @param {number} targetMs - epoch ms of the upcoming instant.
 * @param {number} [now] - epoch ms; defaults to Date.now().
 */
export function formatRelative(targetMs, now = Date.now()) {
  const ms = targetMs - now;
  if (ms <= 0) return "now";

  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;

  const days = Math.floor(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
