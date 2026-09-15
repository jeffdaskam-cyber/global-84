import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { subscribeItinerary } from "../../lib/itinerary";
import { subscribeEventsByCity, subscribeMyRsvps } from "../../lib/events";
import { subscribeFlights, toDate, formatFlightTime } from "../../lib/userFlights";
import { formatRelative } from "../../lib/trip";
import { CITY_TIME_ZONES } from "../../config/timezones";

const EVENT_CITIES = Object.keys(CITY_TIME_ZONES);

const TYPE_META = {
  Itinerary: { label: "Itinerary", bg: "#F4F1E6", fg: "#8A1538" },
  Going: { label: "Going", bg: "#F8E6EA", fg: "#8E0A24" },
  Interested: { label: "Interested", bg: "#F4F1E6", fg: "#8A6D1E" },
  Flight: { label: "Flight", bg: "#F4F1E6", fg: "#BA0C2F" },
};

const CATEGORIES = {
  visit: { label: "Company visit", color: "#BA0C2F" },
  meal: { label: "Group meal", color: "#76918B" },
  social: { label: "Cultural / social", color: "#C4962A" },
  travel: { label: "Travel / transfers", color: "#375060" },
  teamEvent: { label: "Team event", color: "#000000" },
  rsvpEvent: { label: "RSVP event", color: "#CCBA8C" },
};

const TINT_ALPHA = 0.20;

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatWhen(ms, timeZone) {
  if (!ms) return "";
  const opts = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (timeZone) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(ms));
}

const LEGEND_ITEMS = Object.values(CATEGORIES).map((c) => ({
  label: c.label,
  color: c.color,
  tintBg: hexToRgba(c.color, TINT_ALPHA),
}));

export default function UpNextCard() {
  const navigate = useNavigate();
  const [uid, setUid] = useState(null);

  const [itinerary, setItinerary] = useState([]);
  const [eventsByCity, setEventsByCity] = useState({});
  const [rsvps, setRsvps] = useState([]);
  const [flights, setFlights] = useState([]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  useEffect(() => subscribeItinerary(setItinerary, () => setItinerary([])), []);
  useEffect(() => {
    const setCity = (city, list) => setEventsByCity((prev) => ({ ...prev, [city]: list }));
    const unsubs = EVENT_CITIES.map((city) =>
      subscribeEventsByCity(city, (list) => setCity(city, list), () => setCity(city, []))
    );
    return () => unsubs.forEach((unsub) => unsub?.());
  }, []);

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

    for (const it of itinerary) {
      const ms = toDate(it.startTime)?.getTime();
      if (!ms) continue;
      out.push({
        key: `itin-${it.id}`,
        type: "Itinerary",
        title: it.title,
        whenMs: ms,
        tz: CITY_TIME_ZONES[it.city]?.zone || null,
        subtitle: it.locationName || it.city || "",
        cat: it.category || null,
      });
    }

    const byId = new Map();
    for (const list of Object.values(eventsByCity)) {
      for (const e of list) byId.set(e.id, e);
    }
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
        tz: CITY_TIME_ZONES[e.city]?.zone || null,
        subtitle: [e.locationName, e.city].filter(Boolean).join(" · "),
        to: "/events",
        cat: "rsvpEvent",
      });
    }

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
        cat: "travel",
      });
    }

    return out
      .filter((r) => r.whenMs > nowMs)
      .sort((a, b) => a.whenMs - b.whenMs);
  }, [itinerary, eventsByCity, rsvps, flights, nowMs]);

  if (rows.length === 0) return null;

  const hasCategories = rows.some((r) => r.cat);

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

          {hasCategories && (
            <div className="flex flex-wrap mt-2" style={{ gap: "8px 10px" }}>
              {LEGEND_ITEMS.map((cat) => (
                <div key={cat.label} className="flex items-center" style={{ gap: "5px" }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: cat.tintBg,
                      border: `1px solid ${cat.color}`,
                    }}
                  />
                  <span className="text-[10px] text-ink-muted">{cat.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2.5 h-px bg-surface-border dark:bg-surface-darkBorder" />
        </div>

        <div className="px-4 py-2.5 max-h-80 overflow-y-auto flex flex-col" style={{ gap: "6px" }}>
          {rows.map((row) => {
            const meta = TYPE_META[row.type];
            const catDef = row.cat ? CATEGORIES[row.cat] : null;
            const tintBg = catDef ? hexToRgba(catDef.color, TINT_ALPHA) : "transparent";
            const tappable = Boolean(row.to);
            const Tag = tappable ? "button" : "div";
            return (
              <Tag
                key={row.key}
                onClick={tappable ? () => navigate(row.to) : undefined}
                className={`w-full flex items-center text-left ${
                  tappable ? "active:scale-[0.99] transition-transform" : ""
                }`}
                style={{
                  gap: "10px",
                  padding: "9px 10px 9px 8px",
                  borderRadius: "10px",
                  background: tintBg,
                  borderLeft: `3px solid ${catDef ? catDef.color : "transparent"}`,
                }}
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
