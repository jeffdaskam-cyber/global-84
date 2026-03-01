import { useEffect, useState } from "react";
import { subscribeAnnouncements } from "../lib/announcements";
import AnnouncementCard from "../components/features/AnnouncementCard.jsx";
import AnnouncementEditorModal from "../components/features/AnnouncementEditorModal.jsx";
import { subscribeIsAdmin } from "../lib/admins";

// ── Weather ───────────────────────────────────────────────────────────────────
const WEATHER_CITIES = [
  { label: "Singapore", flag: "🇸🇬", lat: 1.3521,  lon: 103.8198 },
  { label: "HCMC",      flag: "🇻🇳", lat: 10.8231, lon: 106.6297 },
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

function WeatherWidget() {
  const [weather, setWeather] = useState([null, null]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const results = await Promise.all(
          WEATHER_CITIES.map(c => fetchWeather(c.lat, c.lon))
        );
        if (!cancelled) { setWeather(results); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="px-6 pb-4">
      <div className="flex gap-3">
        {WEATHER_CITIES.map((city, i) => {
          const w    = weather[i];
          const desc = w ? describeCode(w.code) : null;
          return (
            <div
              key={city.label}
              className="flex-1 bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card px-4 py-3"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">{city.flag}</span>
                <span className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark">
                  {city.label}
                </span>
              </div>
              {loading || !w ? (
                <div className="h-8 w-16 rounded bg-surface-border dark:bg-surface-darkBorder animate-pulse" />
              ) : (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl">{desc.emoji}</span>
                    <span className="text-2xl font-bold text-ink-main dark:text-ink-onDark">
                      {w.tempF}°F
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
                    {desc.condition}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [items, setItems]     = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsub = subscribeIsAdmin(setIsAdmin);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeAnnouncements(setItems);
    return () => unsub();
  }, []);

  return (
    <div>
      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden" style={{ minHeight: "272px" }}>
        <div className="absolute inset-0" style={{
          background: "linear-gradient(150deg, #0d0103 0%, #1c0408 35%, #BA0C2F 72%, #8a0a22 100%)",
        }} />
        {[320, 230, 150].map((size, i) => (
          <div key={size} className="absolute rounded-full" style={{
            width: size, height: size,
            top: -size / 2.5, right: -size / 2.5,
            border: `1px solid rgba(196,150,42,${0.08 + i * 0.05})`,
          }} />
        ))}
        <div className="absolute" style={{
          width: "1px", height: "120px", right: "36px", bottom: "28px",
          background: "linear-gradient(to bottom, transparent, rgba(196,150,42,0.5), transparent)",
          transform: "rotate(12deg)",
        }} />
        <div className="absolute bottom-0 left-0 right-0" style={{
          height: "40px",
          background: "linear-gradient(to bottom, transparent, rgba(13,1,3,0.15))",
        }} />

        <div className="relative px-6 pt-10 pb-8">
          <p className="transition-all duration-700 ease-out" style={{
            fontFamily: "Georgia, serif", fontSize: "10px",
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: "rgba(196,150,42,0.85)",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(6px)",
            transitionDelay: "0ms",
          }}>
            University of Denver
          </p>

          <div className="flex items-baseline gap-3 mt-2 transition-all duration-700 ease-out" style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(14px)",
            transitionDelay: "80ms",
          }}>
            <span style={{
              fontFamily: "Georgia, serif", fontSize: "52px", fontWeight: 700,
              lineHeight: 1, color: "#ffffff", letterSpacing: "-0.5px",
            }}>Global</span>
            <span style={{
              fontFamily: "Georgia, serif", fontSize: "56px", fontWeight: 700,
              lineHeight: 1, letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>84</span>
          </div>

          <div className="flex items-center gap-2 mt-3 transition-all duration-700 ease-out" style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(10px)",
            transitionDelay: "160ms",
          }}>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)" }}>🇸🇬 Singapore</span>
            <span style={{ color: "rgba(196,150,42,0.5)", fontSize: "8px" }}>◆</span>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)" }}>🇻🇳 Vietnam</span>
          </div>

          <div className="mt-4 transition-all duration-700 ease-out" style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "scaleX(1)" : "scaleX(0)",
            transformOrigin: "left center", transitionDelay: "240ms",
          }}>
            <div style={{
              height: "2px", width: "52px", borderRadius: "2px",
              background: "linear-gradient(to right, #C4962A, rgba(196,150,42,0.25))",
            }} />
          </div>

          <div className="flex items-end justify-between mt-3 transition-all duration-700 ease-out" style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(8px)",
            transitionDelay: "320ms",
          }}>
            <p style={{
              fontFamily: "Georgia, serif", fontSize: "12px",
              fontStyle: "italic", color: "rgba(255,255,255,0.4)",
            }}>Creating Global Leaders</p>
            {isAdmin && (
              <button
                className="rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{
                  padding: "8px 16px",
                  background: "linear-gradient(135deg, #C4962A 0%, #a07820 100%)",
                  color: "#0d0103", fontWeight: 700,
                }}
                onClick={() => setOpenNew(true)}
              >
                + Announce
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Announcements ── */}
      <div className="p-6 space-y-4 bg-surface-light dark:bg-surface-dark" style={{ minHeight: "calc(100vh - 272px - 120px)" }}>
        <div>
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Announcements</div>
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">Pinned items appear first.</div>
        </div>

        {items.length === 0 ? (
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

      {/* ── Weather widget — sits just above the nav bar ── */}
      <div className="bg-surface-light dark:bg-surface-dark">
        <WeatherWidget />
      </div>

      <AnnouncementEditorModal open={openNew} onClose={() => setOpenNew(false)} />
    </div>
  );
}
