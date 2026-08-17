import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { subscribeAnnouncements } from "../lib/announcements";
import AnnouncementCard from "../components/features/AnnouncementCard.jsx";
import AnnouncementEditorModal from "../components/features/AnnouncementEditorModal.jsx";
import { listenerErrorMessage } from "../lib/subscribe";
import ListenerError from "../components/ListenerError.jsx";
import TripCountdown from "../components/TripCountdown.jsx";
import UpNextCard from "../components/features/UpNextCard.jsx";
import { isTripStarted } from "../lib/trip";

// ── Weather ───────────────────────────────────────────────────────────────────
const WEATHER_CITIES = [
  { label: "Singapore", lat: 1.3521,  lon: 103.8198, tz: "Asia/Singapore" },
  { label: "HCMC",      lat: 10.8231, lon: 106.6297, tz: "Asia/Ho_Chi_Minh" },
];

function describeCode(code) {
  if (code === 0)                    return { condition: "Clear",         emoji: "☀️" };
  if (code === 1)                    return { condition: "Mostly Clear",  emoji: "🌤️" };
  if (code === 2)                    return { condition: "Partly Cloudy", emoji: "⛅" };
  if (code === 3)                    return { condition: "Overcast",      emoji: "☁️" };
  if ([45, 48].includes(code))       return { condition: "Foggy",         emoji: "🌫️" };
  if ([51, 53, 55].includes(code))   return { condition: "Drizzle",       emoji: "🌦️" };
  if ([61, 63, 65].includes(code))   return { condition: "Rain",          emoji: "🌧️" };
  if ([71, 73, 75].includes(code))   return { condition: "Snow",          emoji: "❄️" };
  if ([80, 81, 82].includes(code))   return { condition: "Showers",       emoji: "🌦️" };
  if ([95, 96, 99].includes(code))   return { condition: "Thunderstorm",  emoji: "⛈️" };
  return { condition: "—", emoji: "🌡️" };
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto`;
  const res  = await fetch(url);
  const data = await res.json();
  return {
    tempF: Math.round(data.current.temperature_2m),
    code:  data.current.weathercode,
  };
}

function localTime(tz) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(new Date());
}

// Compact single-line weather strip with two states gated by tripStarted:
//  • pre-trip  — soft-gold band, just the two destination temps.
//  • on-trip   — full-bleed crimson gradient, white text, plus a "Denver" home
//                clock so members can gut-check the time back home at a glance.
function WeatherStrip() {
  const [weather, setWeather] = useState([null, null]);
  const [, setNow] = useState(new Date());
  const started = isTripStarted();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const results = await Promise.all(
          WEATHER_CITIES.map(c => fetchWeather(c.lat, c.lon))
        );
        if (!cancelled) setWeather(results);
      } catch {
        /* leave the last-known values in place on a failed refresh */
      }
    }
    load();
    const weatherInterval = setInterval(load, 30 * 60 * 1000);
    const clockInterval = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => { cancelled = true; clearInterval(weatherInterval); clearInterval(clockInterval); };
  }, []);

  const segments = WEATHER_CITIES.map((city, i) => {
    const w = weather[i];
    const desc = w ? describeCode(w.code) : null;
    return w ? `${city.label} ${desc.emoji} ${w.tempF}°F` : `${city.label} …`;
  });
  if (started) segments.push(`Denver ${localTime("America/Denver")}`);

  const text = segments.join("  ·  ");

  if (started) {
    return (
      <div
        className="w-full text-center py-2.5 px-4 text-sm font-medium text-white"
        style={{ background: "linear-gradient(135deg, #1c0408 0%, #BA0C2F 100%)" }}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      className="w-full text-center py-2.5 px-4 text-sm font-medium text-ink-main"
      style={{ background: "#F4F1E6", borderTop: "1px solid #E8E6E1", borderBottom: "1px solid #E8E6E1" }}
    >
      {text}
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
// isAdmin comes from App, which already watches the admin doc for every other
// route. Subscribing again here meant two listeners on the same document.
export default function Home({ isAdmin, onOpenDrawer }) {
  const [items, setItems]     = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mounted, setMounted] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  // The drawer's admin "Post Announcement" routes here with this flag, since the
  // announcement editor lives on Home. Open it once, then clear the flag from
  // history so a back/forward or refresh doesn't reopen the editor.
  useEffect(() => {
    if (!(isAdmin && location.state?.openAnnounce)) return;
    // Defer the open so we're not calling setState synchronously in the effect
    // body (same reason the mounted flag above uses a timeout). Clear the flag
    // from history immediately so a refresh or back/forward won't reopen it.
    const t = setTimeout(() => setOpenNew(true), 0);
    navigate(location.pathname, { replace: true, state: null });
    return () => clearTimeout(t);
  }, [isAdmin, location.pathname, location.state, navigate]);

  useEffect(() => {
    const unsub = subscribeAnnouncements(setItems, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
    return () => unsub();
  }, []);

  return (
    <div>
      {/* ── Compact header (~90px) ── */}
      <div className="relative overflow-hidden" style={{ minHeight: "90px" }}>
        <div className="absolute inset-0" style={{
          background: "linear-gradient(150deg, #0d0103 0%, #1c0408 40%, #BA0C2F 100%)",
        }} />
        <div className="absolute rounded-full" style={{
          width: 180, height: 180, top: -90, right: -60,
          border: "1px solid rgba(196,150,42,0.12)",
        }} />

        <div className="relative flex items-center justify-between px-5 py-4">
          <div className="transition-all duration-700 ease-out" style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(10px)",
          }}>
            <div className="flex items-baseline gap-2">
              <span style={{
                fontFamily: "Georgia, serif", fontSize: "28px", fontWeight: 700,
                lineHeight: 1, color: "#ffffff", letterSpacing: "-0.4px",
              }}>Global</span>
              <span style={{
                fontFamily: "Georgia, serif", fontSize: "30px", fontWeight: 700,
                lineHeight: 1, letterSpacing: "-0.4px",
                background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>84</span>
            </div>
            <div className="flex items-center gap-2 mt-1" style={{
              fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "13px", color: "rgba(255,255,255,0.9)",
            }}>
              <span>Singapore</span>
              <span style={{ fontSize: "8px" }}>◆</span>
              <span>Vietnam</span>
            </div>
          </div>

          {/* Hamburger menu button — the only entry point to the drawer */}
          <button
            onClick={onOpenDrawer}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 transition-all active:scale-95"
            aria-label="Open menu"
          >
            {[0,1,2].map(i => (
              <span key={i} style={{ display: "block", width: "18px", height: "2px", borderRadius: "2px", background: "#ffffff" }} />
            ))}
          </button>
        </div>
      </div>

      {/* ── Up Next ── */}
      <UpNextCard />

      {/* ── Trip countdown (hides once the trip starts) ── */}
      <TripCountdown />

      {/* ── Weather strip ── */}
      <WeatherStrip />

      {/* ── Announcements ── */}
      <div className="p-6 space-y-4 bg-surface-light dark:bg-surface-dark" style={{ minHeight: "40vh" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Announcements</div>
            <div className="text-xs text-ink-sub dark:text-ink-subOnDark">Pinned items appear first.</div>
          </div>
          {isAdmin && (
            <button
              className="rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{
                padding: "6px 14px",
                background: "linear-gradient(135deg, #C4962A 0%, #a07820 100%)",
                color: "#0d0103", fontWeight: 700,
              }}
              onClick={() => setOpenNew(true)}
            >
              + Announce
            </button>
          )}
        </div>

        {loadError ? (
          <ListenerError message={loadError} />
        ) : items.length === 0 ? (
          <div className="bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-4">
            <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">No announcements yet</div>
            <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
              {isAdmin ? "Post the first update for the cohort." : "Admins will post updates here."}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((a) => (
              <AnnouncementCard key={a.id} item={a} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>

      <AnnouncementEditorModal open={openNew} onClose={() => setOpenNew(false)} />
    </div>
  );
}
