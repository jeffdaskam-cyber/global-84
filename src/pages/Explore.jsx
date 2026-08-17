// src/pages/Explore.jsx
// Navigation flow: City cards → Dining/Activity → Type filter → List
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  subscribeExplore,
  deleteExploreItem,
  importExploreItems,
  isCohortFavorite,
  getFavoriteCount,
  COHORT_FAVORITE_THRESHOLD,
} from "../lib/explore";
import { fetchSheetData, parseSheetCSV } from "../lib/sheetsSync";
import { subscribeFavorites, toggleFavorite } from "../lib/favorites";
import { listenerErrorMessage } from "../lib/subscribe";
import ListenerError from "../components/ListenerError.jsx";
import { ACCOMMODATIONS, getMapsUrl } from "../config/accommodations";

// ── Constants ─────────────────────────────────────────────────────────────────
const CITIES = [
  {
    key: "Singapore",
    label: "Singapore",
    description: "The Lion City",
    bgGradient: "from-red-900 via-red-700 to-orange-500",
    bgImage: "/Singapore.jpg",
    bgImageLandscape: "/Singapore-landscape.jpg",
  },
  {
    key: "Ho Chi Minh City",
    label: "Ho Chi Minh City",
    description: "The Pearl of the Far East",
    bgGradient: "from-yellow-800 via-red-700 to-red-900",
    bgImage: "/HCMC.jpg",
    bgImageLandscape: "/HCMC-landscape.jpg",
  },
];

const DINING_TYPES   = ["Restaurant", "Coffee", "Bar", "Rooftop Bar", "Hawker Stall"];
const ACTIVITY_TYPES = ["Museum", "Temple", "Market", "Shopping", "Spa", "Nightlife", "Nature", "Tour", "Adventure"];

// The "Denver night" hero gradient used for the category footer bars and the
// accommodation overlays. Kept inline (matching the SideDrawer treatment in
// App.jsx) rather than as a Tailwind utility so the exact PMS 200 stops carry.
const HERO_GRADIENT = "linear-gradient(150deg,#0d0103 0%,#1c0408 35%,#BA0C2F 72%,#8a0a22 100%)";

// Category cards on the picker. The gradient + emoji is the fallback shown
// until a per-city photo (see CATEGORY_IMAGES) loads, so the card always works.
const CATEGORY_CARDS = [
  { key: "dining",   label: "Dining",     emoji: "🍽️", types: DINING_TYPES,   gradient: "from-du-crimson to-red-800" },
  { key: "activity", label: "Activities", emoji: "🗺️", types: ACTIVITY_TYPES, gradient: "from-amber-700 to-yellow-600" },
];

// Per-city background photos for the Dining / Activities cards. Files live in
// public/. A missing file falls back to the card's branded gradient (onError).
const CATEGORY_IMAGES = {
  "Singapore":       { dining: "/dining-singapore.jpg", activity: "/activities-singapore.jpg" },
  "Ho Chi Minh City": { dining: "/dining-hcmc.jpg",      activity: "/activities-hcmc.jpg" },
};

// ── Root component ────────────────────────────────────────────────────────────
export default function Explore({ isAdmin, onCreateEvent }) {
  const [nav, setNav] = useState(null);
  const [favorites, setFavorites] = useState(new Set());

  // A dropped favorites listener degrades to "nothing favorited" rather than
  // blocking the page; the place list below reports its own load failure.
  useEffect(() => {
    const unsub = subscribeFavorites(setFavorites, () => setFavorites(new Set()));
    return () => unsub();
  }, []);

  if (!nav) return <CityPicker isAdmin={isAdmin} onSelect={(city) => setNav({ city })} />;
  if (!nav.category) return (
    <CategoryPicker
      city={nav.city}
      onSelect={(category) => setNav({ ...nav, category })}
      onBack={() => setNav(null)}
    />
  );
  // Step 2b: hardcoded hotel screen — no Firestore, no listing view.
  if (nav.category === "accommodations") return (
    <AccommodationDetail
      city={nav.city}
      onBack={() => setNav({ city: nav.city })}
    />
  );
  return (
    <PlaceList
      city={nav.city}
      category={nav.category}
      isAdmin={isAdmin}
      favorites={favorites}
      onBack={() => setNav({ city: nav.city })}
      onCreateEvent={onCreateEvent}
    />
  );
}

// "On the ground" entry cards. Currency + Translate are the tools a member
// reaches for in the same real-world moment as the map, so they live at the
// foot of Explore rather than buried in the drawer. Each pushes into that
// tool's existing full-screen route — only the entry point moved.
const ON_THE_GROUND = [
  {
    to: "/currency",
    icon: "💰",
    title: "Currency Converter",
    subtitle: "Live USD ↔ SGD, VND rates",
  },
  {
    to: "/translate",
    icon: "📷",
    title: "Photo Translator",
    subtitle: "Signage, menus & documents to English",
  },
];

// ── Step 1: City cards ────────────────────────────────────────────────────────
function CityPicker({ isAdmin, onSelect }) {
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  async function handleSheetSync() {
    setIsSyncing(true);
    setSyncStatus("Fetching from Google Sheets...");
    try {
      const csvText = await fetchSheetData();
      const rows = parseSheetCSV(csvText);
      setSyncStatus(`Syncing ${rows.length} items to Firestore...`);
      const result = await importExploreItems(rows, { fileName: "Google Sheets sync" });
      setSyncStatus(
        `Sync complete. ${result.imported} added, ${result.updated} updated, ${result.skipped} skipped.` +
        (result.removedDuplicates ? ` Removed ${result.removedDuplicates} duplicates.` : "")
      );
    } catch (err) {
      console.error("[sheets sync] error:", err);
      setSyncStatus(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  const isError = syncStatus.startsWith("Sync failed");
  const isSuccess = syncStatus.startsWith("Sync complete");

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-ink-main dark:text-ink-onDark tracking-tight">Explore</h1>
        <p className="mt-1 text-sm text-ink-sub dark:text-ink-subOnDark">Choose a destination</p>
      </div>
      <div className="px-4 space-y-4">
        {CITIES.map((city) => (
          <button
            key={city.key}
            onClick={() => onSelect(city.key)}
            className="w-full relative overflow-hidden rounded-2xl h-44 shadow-lg group focus:outline-none focus:ring-2 focus:ring-du-crimson"
          >
            {city.bgImage ? (
              <picture style={{ display: "contents" }}>
                <source media="(min-width: 768px)" srcSet={city.bgImageLandscape} />
                <img
                  src={city.bgImage}
                  alt={city.label}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </picture>
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${city.bgGradient} transition-transform duration-500 group-hover:scale-105`} />
            )}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors duration-300" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 text-left">
              <div className="text-3xl mb-1">{city.emoji}</div>
              <div className="text-white font-bold text-2xl leading-tight drop-shadow">
                {city.shortLabel || city.label}
              </div>
              <div className="text-white/80 text-sm mt-0.5 drop-shadow">{city.description}</div>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}

        {/* ── On the ground: currency + translate entry points ── */}
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-sub">
              On the ground
            </span>
            <div className="flex-1 h-px bg-surface-border" />
          </div>
          <div className="space-y-3">
            {ON_THE_GROUND.map((tool) => (
              <button
                key={tool.to}
                onClick={() => navigate(tool.to)}
                className="w-full flex items-center gap-3.5 rounded-2xl transition-all active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-du-crimson text-left"
                style={{
                  background: "linear-gradient(160deg, #1c0408, #2a0a10)",
                  border: "1px solid rgba(196,150,42,0.2)",
                  padding: "14px 16px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(196,150,42,0.14)",
                    fontSize: 18,
                  }}
                >
                  {tool.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-white"
                    style={{ fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700 }}
                  >
                    {tool.title}
                  </span>
                  <span className="block" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {tool.subtitle}
                  </span>
                </span>
                <span className="flex-shrink-0" style={{ color: "rgba(196,150,42,0.7)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Admin: Google Sheets sync — only visible to admins */}
        {isAdmin && (
          <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder p-4 space-y-3">
            <button
              onClick={handleSheetSync}
              disabled={isSyncing}
              className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSyncing && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isSyncing ? "Syncing..." : "Sync from Google Sheets"}
            </button>
            <p className="text-xs text-ink-sub dark:text-ink-subOnDark">
              Pulls the latest data from the shared Google Sheet. New items are added; existing items (matched by name + city) are not overwritten.
            </p>
            {syncStatus && (
              <p className={`text-sm font-medium ${isError ? "text-du-crimson" : isSuccess ? "text-green-600 dark:text-green-400" : "text-ink-sub dark:text-ink-subOnDark"}`}>
                {syncStatus}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Dining vs Activity ────────────────────────────────────────────────
function CategoryPicker({ city, onSelect, onBack }) {
  const cityData = CITIES.find((c) => c.key === city);
  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark pb-24">
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-ink-main dark:text-ink-onDark tracking-tight">
            {cityData?.shortLabel || cityData?.label || city}
          </h1>
          <p className="text-sm text-ink-sub dark:text-ink-subOnDark">What are you looking for?</p>
        </div>
      </div>
      <div className="px-4 space-y-4 mt-2">
        {CATEGORY_CARDS.map((card) => {
          const image = CATEGORY_IMAGES[city]?.[card.key];
          return (
          <button
            key={card.key}
            onClick={() => onSelect(card.key)}
            className="w-full flex flex-col text-left relative overflow-hidden rounded-2xl h-56 shadow-lg group focus:outline-none focus:ring-2 focus:ring-du-crimson"
          >
            {/* Photo area — the branded gradient is an underlay so a missing or
                slow photo still reads; the emoji only shows without a photo. */}
            <div className="relative flex-1 min-h-0">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} transition-transform duration-500 group-hover:scale-105`} />
              {image && (
                <img
                  src={image}
                  alt={card.label}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-black/15 group-hover:bg-black/5 transition-colors" />
              {!image && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-5xl drop-shadow-lg">{card.emoji}</span>
                </div>
              )}
            </div>
            {/* Footer bar — hero gradient with label, type list, chevron */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3" style={{ background: HERO_GRADIENT }}>
              <div className="min-w-0">
                <div className="text-white font-bold text-lg leading-tight">{card.label}</div>
                <div className="text-white/60 text-[10px] mt-0.5 truncate">{card.types.join(" · ")}</div>
              </div>
              <svg className="ml-auto flex-shrink-0 w-[18px] h-[18px] text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
          );
        })}

        {/* Secondary option — deliberately lighter weight than Dining/Activities */}
        <button
          onClick={() => onSelect("accommodations")}
          className="w-full flex items-center gap-2 rounded-full border border-surface-border dark:border-surface-darkBorder bg-surface-card dark:bg-surface-darkCard px-4 py-2.5 text-sm font-semibold text-ink-sub dark:text-ink-subOnDark hover:border-du-crimson hover:text-du-crimson transition-colors focus:outline-none focus:ring-2 focus:ring-du-crimson"
        >
          <span className="text-base leading-none">🏨</span>
          <span>Accommodations</span>
          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Step 2b: Accommodation detail (hardcoded, no Firestore) ───────────────────
function AccommodationDetail({ city, onBack }) {
  const cityData = CITIES.find((c) => c.key === city);
  const hotel = ACCOMMODATIONS[city];
  const cityLabel = cityData?.shortLabel || cityData?.label || city;

  // Empty state keeps a plain back header — no hero to show without a hotel.
  if (!hotel) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark pb-24">
        <div className="px-4 pt-6 pb-4 flex items-center gap-3">
          <button onClick={onBack} className="text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-ink-main dark:text-ink-onDark">
            Accommodations
            <span className="ml-2 text-ink-sub dark:text-ink-subOnDark font-normal text-base">· {cityLabel}</span>
          </h1>
        </div>
        <div className="text-center py-16 text-ink-sub dark:text-ink-subOnDark text-sm">
          Accommodations not yet added for this city.
        </div>
      </div>
    );
  }

  // Prefer the hotel photo; fall back to the city photo if it fails to load.
  const heroSrc = hotel.photo || cityData?.bgImage;

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Full-bleed hero */}
      {heroSrc && (
        <img
          src={heroSrc}
          alt={hotel.name}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            if (cityData?.bgImage && !e.currentTarget.src.endsWith(cityData.bgImage)) {
              e.currentTarget.src = cityData.bgImage;
            }
          }}
        />
      )}
      {/* Bottom scrim for the floating card + top scrim for the controls */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(10,2,4,0.85) 0%, rgba(10,2,4,0.15) 42%, rgba(0,0,0,0) 60%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(10,2,4,0.45) 0%, rgba(0,0,0,0) 20%)" }} />

      {/* Back button */}
      <button
        onClick={onBack}
        aria-label="Back"
        className="absolute top-5 left-4 w-9 h-9 rounded-full flex items-center justify-center text-white focus:outline-none focus:ring-2 focus:ring-white/70"
        style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)" }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Eyebrow */}
      <div className="absolute top-5 left-16 right-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 leading-9">
          Accommodations · {cityLabel}
        </div>
      </div>

      {/* Floating info card — sits above the app's bottom nav */}
      <div
        className="absolute left-4 right-4 bottom-24 rounded-2xl bg-surface-card dark:bg-surface-darkCard p-5 flex flex-col gap-3.5"
        style={{ boxShadow: "0 20px 48px rgba(0,0,0,0.28)" }}
      >
        <div>
          <div className="text-lg font-bold text-ink-main dark:text-ink-onDark leading-snug">{hotel.name}</div>
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark mt-1 leading-normal">{hotel.address}</div>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href={hotel.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-surface-border dark:border-surface-darkBorder px-3.5 py-2.5 text-sm font-semibold text-du-crimson hover:border-du-crimson transition-colors"
          >
            <span>🔗</span>
            <span>Hotel Website</span>
          </a>
          <a
            href={getMapsUrl(hotel)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-surface-border dark:border-surface-darkBorder px-3.5 py-2.5 text-sm font-semibold text-du-crimson hover:border-du-crimson transition-colors"
          >
            <span>📍</span>
            <span>Map View</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Place list with type filter ───────────────────────────────────────
function PlaceList({ city, category, isAdmin, favorites, onBack, onCreateEvent }) {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [activeType, setActiveType]   = useState("All");
  const [search, setSearch]           = useState("");
  const [deleting, setDeleting]       = useState(null);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [showCohortFavOnly, setShowCohortFavOnly] = useState(false);

  const cityData = CITIES.find((c) => c.key === city);
  const typeList = category === "dining" ? DINING_TYPES : ACTIVITY_TYPES;

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    const unsub = subscribeExplore(
      { city, category },
      (data) => {
        setItems(data);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setLoadError(listenerErrorMessage(err));
      }
    );
    return unsub;
  }, [city, category]);

  const filtered = useMemo(() => {
    let result = items;
    if (activeType !== "All") result = result.filter((i) => i.type === activeType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((i) =>
        [i.name, i.neighborhood, i.notes, i.recommendedBy, ...(i.tags || [])]
          .join(" ").toLowerCase().includes(q)
      );
    }
    // The Cohort Favorites chip doubles as a sort: most-favorited first, ties
    // alphabetical. Done in memory since the full list is already loaded.
    if (showCohortFavOnly) {
      result = result
        .filter((i) => isCohortFavorite(i))
        .sort((a, b) =>
          getFavoriteCount(b) - getFavoriteCount(a) ||
          (a.name || "").localeCompare(b.name || "")
        );
    }
    return result;
  }, [items, activeType, search, showCohortFavOnly]);

  // Split into favorited and non-favorited
  const favoritedItems = filtered.filter((i) => favorites.has(i.id));
  const otherItems     = filtered.filter((i) => !favorites.has(i.id));
  const visibleOthers  = showFavOnly ? [] : otherItems;

  async function handleDelete(id) {
    if (!window.confirm("Remove this place? This cannot be undone.")) return;
    setDeleting(id);
    try { await deleteExploreItem(id); }
    finally { setDeleting(null); }
  }

  function renderCard(item) {
    return (
      <PlaceCard
        key={item.id}
        item={item}
        isAdmin={isAdmin}
        isFavorited={favorites.has(item.id)}
        deleting={deleting === item.id}
        onDelete={() => handleDelete(item.id)}
        onCreateEvent={onCreateEvent}
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark pb-24">
      <div className="sticky top-0 z-10 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur border-b border-surface-border dark:border-surface-darkBorder px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-ink-main dark:text-ink-onDark">
            {category === "dining" ? "Dining" : "Activities"}
            <span className="ml-2 text-ink-sub dark:text-ink-subOnDark font-normal text-base">
              · {cityData?.shortLabel || city}
            </span>
          </h1>
        </div>

        {/* Search + Favorites toggle */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Search places..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-crimson"
          />
          <button
            onClick={() => setShowFavOnly((v) => !v)}
            title={showFavOnly ? "Show all" : "Show favorites only"}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
              showFavOnly
                ? "bg-amber-400 border-amber-400 text-white"
                : "border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark hover:border-amber-400 hover:text-amber-500"
            }`}
          >
            <span>{showFavOnly ? "★" : "☆"}</span>
            <span className="hidden sm:inline">Favorites</span>
          </button>
          <button
            onClick={() => setShowCohortFavOnly((v) => !v)}
            title={
              showCohortFavOnly
                ? "Show all"
                : `Show places favorited by more than ${COHORT_FAVORITE_THRESHOLD} cohort members`
            }
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
              showCohortFavOnly
                ? "bg-du-gold border-du-gold text-white"
                : "border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark hover:border-du-gold hover:text-du-gold"
            }`}
          >
            <span>⭐</span>
            <span className="hidden sm:inline">Cohort</span>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {["All", ...typeList].map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeType === t
                  ? "bg-du-crimson text-white"
                  : "bg-surface-border/60 dark:bg-surface-darkBorder/60 text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border dark:hover:bg-surface-darkBorder"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder p-4 animate-pulse">
              <div className="h-4 bg-surface-border dark:bg-surface-darkBorder rounded w-2/3 mb-2" />
              <div className="h-3 bg-surface-border dark:bg-surface-darkBorder rounded w-1/3" />
            </div>
          ))
        ) : loadError ? (
          <ListenerError message={loadError} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-ink-sub dark:text-ink-subOnDark text-sm">
            {items.length === 0
              ? "No places added yet."
              : showCohortFavOnly
                ? `No cohort favorites yet. Places saved by more than ${COHORT_FAVORITE_THRESHOLD} members show up here.`
                : "No results match your search."}
          </div>
        ) : (
          <>
            {/* ── Favorites section ── */}
            {favoritedItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">★ My Favorites</span>
                  <div className="flex-1 h-px bg-amber-200 dark:bg-amber-900/40" />
                </div>
                {favoritedItems.map(renderCard)}
              </div>
            )}

            {/* ── Divider between sections ── */}
            {favoritedItems.length > 0 && visibleOthers.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark uppercase tracking-wide">All Places</span>
                <div className="flex-1 h-px bg-surface-border dark:bg-surface-darkBorder" />
              </div>
            )}

            {/* ── Empty state when filter is on and nothing saved ── */}
            {showFavOnly && favoritedItems.length === 0 ? (
              <div className="text-center py-16 text-ink-sub dark:text-ink-subOnDark text-sm">
                No favorites saved yet. Tap ☆ on any place to save it.
              </div>
            ) : (
              visibleOthers.map(renderCard)
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Place card ────────────────────────────────────────────────────────────────
function PlaceCard({ item, isAdmin, isFavorited, deleting, onDelete, onCreateEvent }) {
  const [expanded, setExpanded]   = useState(false);
  const [toggling, setToggling]   = useState(false);

  const favoriteCount  = getFavoriteCount(item);
  const cohortFavorite = isCohortFavorite(item);

  async function handleFavorite(e) {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    try { await toggleFavorite(item.id, isFavorited); }
    finally { setToggling(false); }
  }

  return (
    <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-sm overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink-main dark:text-ink-onDark text-base leading-tight">{item.name}</span>
              {item.price && (
                <span className="text-xs font-medium text-du-gold bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">{item.price}</span>
              )}
              {cohortFavorite && (
                <span
                  title={`Saved by ${favoriteCount} cohort members`}
                  className="text-xs font-semibold text-du-gold bg-du-goldSoft dark:bg-du-gold/20 border border-du-goldDeep dark:border-du-gold/50 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                >
                  ⭐ Cohort Favorite
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-sub dark:text-ink-subOnDark flex-wrap">
              <span className="font-medium text-du-crimson">{item.type}</span>
              {item.neighborhood && <><span>·</span><span>{item.neighborhood}</span></>}
              {item.hours && <><span>·</span><span>{item.hours}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Star favorite button */}
            <button
              onClick={handleFavorite}
              disabled={toggling}
              title={isFavorited ? "Remove from favorites" : "Save to favorites"}
              className={`p-1.5 rounded-lg transition-all disabled:opacity-40 ${
                isFavorited
                  ? "text-amber-400 hover:text-amber-500"
                  : "text-ink-sub dark:text-ink-subOnDark hover:text-amber-400"
              }`}
            >
              <span className="text-lg leading-none">{isFavorited ? "★" : "☆"}</span>
            </button>
            {isAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={deleting}
                className="text-xs font-semibold text-du-crimson hover:text-red-800 disabled:opacity-40 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                {deleting ? "..." : "Remove"}
              </button>
            )}
            <svg
              className={`w-4 h-4 text-ink-sub dark:text-ink-subOnDark transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border dark:border-surface-darkBorder pt-3 space-y-2">
          {item.notes && <p className="text-sm text-ink-main dark:text-ink-onDark">{item.notes}</p>}
          {item.recommendedBy && (
            <p className="text-xs text-ink-sub dark:text-ink-subOnDark">
              Recommended by <span className="font-semibold">{item.recommendedBy}</span>
            </p>
          )}
          {/* System-generated tag — styled apart from the admin-entered chips below */}
          {cohortFavorite && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs font-semibold text-du-gold bg-du-goldSoft dark:bg-du-gold/20 border border-du-goldDeep dark:border-du-gold/50 px-2 py-0.5 rounded-full">
                ⭐ Cohort Favorite · saved by {favoriteCount} members
              </span>
            </div>
          )}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span key={tag} className="text-xs bg-surface-border/60 dark:bg-surface-darkBorder/60 text-ink-sub dark:text-ink-subOnDark px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            {item.googleMapsUrl && (
              <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-du-crimson hover:underline">
                📍 Maps
              </a>
            )}
            {item.reservationUrl && (
              <a href={item.reservationUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-du-crimson hover:underline">
                🔗 Reserve
              </a>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateEvent?.({ title: item.name, locationName: item.name, city: item.city });
              }}
              className="text-xs font-semibold text-du-crimson hover:underline"
            >
              📅 Create Event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
