import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { subscribeItinerary } from "../../lib/itinerary";
import { subscribeEventsByCity, subscribeMyRsvps } from "../../lib/events";
import { subscribeFlights, toDate, formatFlightTime } from "../../lib/userFlights";
import { formatRelative } from "../../lib/trip";

// The two trip cities, with the IANA zone their local times are shown in so a
// pre-trip member in the US still reads the on-the-ground clock.
const CITY_TZ = {
  Singapore: "Asia/Singapore",
  "Ho Chi Minh City": "Asia/Ho_Chi_Minh",
};

// Pill styling per row type. Kept inline (exact hex) since these garnet/crimson/
// gold tints aren't all in the Tailwind token set.
const TYPE_META = {
  Itinerary: { label: "Itinerary", bg: "#F4F1E6", fg: "#8A1538" },
  Going: { label: "Going", bg: "#F8E6EA", fg: "#8E0A24" },
  Interested: { label: "Interested", bg: "#F4F1E6", fg: "#8A6D1E" },
  Flight: { label: "Flight", bg: "#F4F1E6", fg: "#BA0C2F" },
};

function formatWhen(ms, timeZone) {
  if (!ms) return "";
  const opts = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (timeZone) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(ms));
}

export default function UpNextCard() {
  const navigate = useNavigate();
  const [uid, setUid] = useState(null);

  const [itinerary, setItinerary] = useState([]);
  const [sgEvents, setSgEvents] = useState([]);
  const [hcmcEvents, setHcmcEvents] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [flights, setFlights] = useState([]);

  // Re-tick each minute so the relative countdowns ("in 3h") stay honest and
  // items drop off once their time passes, without a reload.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  // All listeners degrade to empty on error — Up Next is a convenience surface,
  // not a source of record, so a dropped listener should quietly show less
  // rather than error the whole Home page.
  useEffect(() => subscribeItinerary(setItinerary, () => setItinerary([])), []);
  useEffect(() => subscribeEventsByCity("Singapore", setSgEvents, () => setSgEvents([])), []);
  useEffect(() => subscribeEventsByCity("Ho Chi Minh City", setHcmcEvents, () => setHcmcEvents([])), []);

  useEffect(() => {
    if (!uid) return;
    return subscribeMyRsvps(uid, setRsvps, () => setRsvps([]));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeFlights(uid, setFlights, () => setFlights([]));
  }, [uid]);

  const rows = useMemo(() => {
    const out = [];

    // Itinerary — admin-posted, no detail screen so these don't navigate.
    for (const it of itinerary) {
      const ms = toDate(it.startTime)?.getTime();
      if (!ms) continue;
      out.push({
        key: `itin-${it.id}`,
        type: "Itinerary",
        title: it.title,
        whenMs: ms,
        tz: CITY_TZ[it.city] || null,
        subtitle: it.locationName || it.city || "",
      });
    }

    // RSVP'd events (going / interested), joined against the loaded event list.
    const byId = new Map();
    for (const e of [...sgEvents, ...hcmcEvents]) byId.set(e.id, e);
    for (const r of rsvps) {
      const e = byId.get(r.eventId);
      if (!e) continue;
      const ms = toDate(e.startTime)?.getTime();
      if (!ms) continue;
      out.push({
        key: `evt-${e.id}`,
        type: r.status === "going" ? "Going" : "Interested",
        title: e.title,
        whenMs: ms,
        tz: CITY_TZ[e.city] || null,
        subtitle: [e.locationName, e.city].filter(Boolean).join(" · "),
        to: "/events",
      });
    }

    // Next upcoming flight only — Me stays the place for the full itinerary.
    const upcomingFlights = flights
      .map((f) => ({ f, ms: toDate(f.departureDateTime)?.getTime() }))
      .filter((x) => x.ms && x.ms > nowMs)
      .sort((a, b) => a.ms - b.ms);
    if (upcomingFlights.length) {
      const { f, ms } = upcomingFlights[0];
      const code = f.iataCode || f.airline || "";
      out.push({
        key: `flt-${f.id}`,
        type: "Flight",
        title: `${`${code} ${f.flightNumber || ""}`.trim()} · ${f.departureAirport} → ${f.arrivalAirport}`,
        whenMs: ms,
        tz: f.departureTimeZone || null,
        subtitle: `Departs ${formatFlightTime(f.departureDateTime, f.departureTimeZone)}${f.gate ? ` · Gate ${f.gate}` : ""}`,
        to: "/me",
      });
    }

    return out
      .filter((r) => r.whenMs > nowMs)
      .sort((a, b) => a.whenMs - b.whenMs)
      .slice(0, 4);
  }, [itinerary, sgEvents, hcmcEvents, rsvps, flights, nowMs]);

  // Nothing coming up: hide the whole module so Home doesn't carry an empty
  // shell before the trip leader seeds the itinerary. Layout reflows via gap.
  if (rows.length === 0) return null;

  return (
    <div className="px-6 pt-4 pb-2 bg-surface-light dark:bg-surface-dark">
      <div
        className="rounded-2xl bg-surface-card dark:bg-surface-darkCard shadow-card overflow-hidden"
        style={{ border: "1px solid #E8E6E1", borderLeft: "3px solid #BA0C2F" }}
      >
        <div className="px-4 pt-3.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-du-crimson">
            Up Next
          </div>
          <div className="mt-2 h-px bg-surface-border dark:bg-surface-darkBorder" />
        </div>

        <div className="px-4">
          {rows.map((row, i) => {
            const meta = TYPE_META[row.type];
            const tappable = Boolean(row.to);
            const Tag = tappable ? "button" : "div";
            return (
              <div key={row.key}>
                {i > 0 && <div className="h-px bg-surface-border dark:bg-surface-darkBorder" />}
                <Tag
                  onClick={tappable ? () => navigate(row.to) : undefined}
                  className={`w-full flex items-center gap-3 py-3 text-left ${
                    tappable ? "active:scale-[0.99] transition-transform" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink-main dark:text-ink-onDark truncate">
                        {row.title}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: meta.bg, color: meta.fg }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-sub dark:text-ink-subOnDark flex-wrap">
                      <span>{formatWhen(row.whenMs, row.tz)}</span>
                      {row.subtitle ? <span className="opacity-70">· {row.subtitle}</span> : null}
                      <span className="font-semibold text-du-crimson">{formatRelative(row.whenMs, nowMs)}</span>
                    </div>
                  </div>
                  {tappable && (
                    <svg className="w-4 h-4 flex-shrink-0 text-ink-sub dark:text-ink-subOnDark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </Tag>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => navigate("/chat")}
          className="w-full flex items-center justify-between px-4 py-3 text-left border-t border-surface-border dark:border-surface-darkBorder active:scale-[0.99] transition-transform"
        >
          <span className="text-sm text-ink-sub dark:text-ink-subOnDark">💬 Jump into Chat</span>
          <span className="text-sm font-semibold" style={{ color: "#c4862a" }}>Open →</span>
        </button>
      </div>
    </div>
  );
}
