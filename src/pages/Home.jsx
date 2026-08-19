import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { subscribeAnnouncements } from "../lib/announcements";
import AnnouncementCard from "../components/features/AnnouncementCard.jsx";
import AnnouncementEditorModal from "../components/features/AnnouncementEditorModal.jsx";
import { listenerErrorMessage } from "../lib/subscribe";
import ListenerError from "../components/ListenerError.jsx";
import TripCountdown from "../components/TripCountdown.jsx";
import UpNextCard from "../components/features/UpNextCard.jsx";
import { isTripStarted, TRIP_START } from "../lib/trip";

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
    return { label: city.label, detail: w ? `${desc.emoji} ${w.tempF}°F` : "…" };
  });
  if (started) segments.push({ label: "Denver", detail: localTime("America/Denver") });

  const cityColor = started ? "#fff" : "#1C1C1C";
  const dotColor  = started ? "#e8b84b" : "#C4962A";

  const stripStyle = started
    ? {
        display: "flex", alignItems: "center", justifyContent: "center",
        flexWrap: "wrap", rowGap: "6px", columnGap: "18px",
        padding: "14px 20px", fontSize: "13px", color: "#fff",
        background: "linear-gradient(135deg, #1c0408 0%, #5c0818 100%)",
      }
    : {
        display: "flex", alignItems: "center", justifyContent: "center",
        flexWrap: "wrap", rowGap: "6px", columnGap: "32px",
        padding: "16px 4px", fontSize: "14.5px", color: "#5C5C5C",
        background: "#F4F1E6", borderTop: "1px solid #E8E6E1", borderBottom: "1px solid #E8E6E1",
      };

  return (
    <div className="w-full font-medium" style={stripStyle}>
      {segments.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && <span style={{ color: dotColor }}>·</span>}
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <b style={{ color: cityColor }}>{s.label}</b> {s.detail}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

// ── Desktop homepage pieces (≥lg only) ─────────────────────────────────────────
// These render inside the photo hero of the desktop layout. Mobile keeps its own
// WeatherStrip + TripCountdown bands untouched.

function remainingUntilTrip(now) {
  const ms = TRIP_START.getTime() - now;
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

const heroGold = {
  fontFamily: "Georgia, serif",
  fontWeight: 700,
  background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

// Countdown pill embedded in the hero. Hides itself once the trip starts, the
// same rule TripCountdown follows on mobile.
function HeroCountdown() {
  const [left, setLeft] = useState(() => remainingUntilTrip(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(remainingUntilTrip(Date.now())), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  if (!left) return null;

  const units = [
    { value: left.days, suffix: "d" },
    { value: left.hours, suffix: "h" },
    { value: left.minutes, suffix: "m" },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 22px",
        borderRadius: "14px",
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(196,150,42,0.25)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        {units.map((u) => (
          <div key={u.suffix}>
            <span style={{ ...heroGold, fontSize: "24px" }}>{u.value}</span>
            <span style={{ fontSize: "10px", color: "rgba(255,250,243,0.6)", marginLeft: "2px" }}>{u.suffix}</span>
          </div>
        ))}
      </div>
      <div style={{ width: "1px", height: "22px", background: "rgba(196,150,42,0.3)" }} />
      <span style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "14px", color: "rgba(255,250,243,0.9)" }}>
        to Singapore
      </span>
    </div>
  );
}

// Single-line live weather + local clocks for the hero. Denver is always shown
// so members can gut-check the time back home.
function HeroWeather() {
  const [weather, setWeather] = useState([null, null]);
  const [, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const results = await Promise.all(WEATHER_CITIES.map((c) => fetchWeather(c.lat, c.lon)));
        if (!cancelled) setWeather(results);
      } catch {
        /* keep last-known values */
      }
    }
    load();
    const weatherInterval = setInterval(load, 30 * 60 * 1000);
    const clockInterval = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => { cancelled = true; clearInterval(weatherInterval); clearInterval(clockInterval); };
  }, []);

  const segments = WEATHER_CITIES.map((city, i) => {
    const w = weather[i];
    const desc = w ? describeCode(w.code) : null;
    const detail = w ? `${desc.emoji} ${w.tempF}°F · ${localTime(city.tz)}` : "…";
    return { label: city.label, detail };
  });
  segments.push({ label: "Denver", detail: localTime("America/Denver") });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", marginTop: "16px", fontSize: "13px", color: "rgba(255,255,255,0.75)", flexWrap: "wrap" }}>
      {segments.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && <span style={{ color: "rgba(196,150,42,0.5)" }}>·</span>}
          <span>
            <b style={{ color: "#fff" }}>{s.label}</b> {s.detail}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function DesktopHero() {
  return (
    <div className="relative overflow-hidden" style={{ minHeight: "220px" }}>
      <div className="absolute inset-0">
        <img src="/Singapore-landscape.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(13,1,3,0.88) 0%, rgba(28,4,8,0.75) 40%, rgba(186,12,47,0.6) 100%)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,2,4,0.95) 0%, transparent 60%)" }} />
      {/* Concentric gold rings */}
      <div className="absolute rounded-full" style={{ width: 260, height: 260, top: -100, right: -50, border: "1px solid rgba(196,150,42,0.1)" }} />
      <div className="absolute rounded-full" style={{ width: 200, height: 200, top: -70, right: -20, border: "1px solid rgba(196,150,42,0.15)" }} />

      <div className="relative" style={{ padding: "36px 40px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
          <div>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(196,150,42,0.75)" }}>
                Singapore &amp; Vietnam
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
              <span style={{ fontFamily: "Georgia, serif", fontSize: "44px", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Global</span>
              <span style={{ ...heroGold, fontSize: "48px", letterSpacing: "-0.5px" }}>84</span>
            </div>
            <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "16px", color: "rgba(255,255,255,0.85)", marginTop: "8px" }}>
              Creating Global Leaders
            </div>
          </div>
          <HeroCountdown />
        </div>
        <HeroWeather />
      </div>
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
    <>
    {/* ══ Mobile layout (< lg) ══ */}
    <div className="lg:hidden">
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
    </div>

    {/* ══ Desktop layout (≥ lg) ══ */}
    <div className="hidden lg:block">
      <DesktopHero />

      <div style={{ padding: "24px 40px 48px", maxWidth: "900px" }}>
        <UpNextCard />

        <div style={{ padding: "16px 24px 0" }}>
          <div className="flex items-start justify-between" style={{ marginBottom: "14px" }}>
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
                  color: "#0d0103",
                  fontWeight: 700,
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
            <div className="grid grid-cols-2 gap-4">
              {items.map((a) => (
                <AnnouncementCard key={a.id} item={a} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    <AnnouncementEditorModal open={openNew} onClose={() => setOpenNew(false)} />
    </>
  );
}
