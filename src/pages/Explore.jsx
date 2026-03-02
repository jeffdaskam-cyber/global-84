// src/pages/Explore.jsx
// Navigation flow: City cards → Dining/Activity → Type filter → List
import { useState, useEffect, useMemo } from "react";
import { subscribeExplore, deleteExploreItem } from "../lib/explore";
import { subscribeFavorites, toggleFavorite } from "../lib/favorites";

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

// ── Root component ────────────────────────────────────────────────────────────
export default function Explore({ isAdmin, onCreateEvent }) {
  const [nav, setNav] = useState(null);
  const [favorites, setFavorites] = useState(new Set());

  useEffect(() => {
    const unsub = subscribeFavorites(setFavorites);
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

// ── Step 1: City cards ────────────────────────────────────────────────────────
function CityPicker({ isAdmin, onSelect }) {
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

        {/* Admin import link — only visible to admins, only on this screen */}
        {isAdmin && (
          <a
            href="/explore-import"
            className="block w-full text-center rounded-lg border border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark px-3 py-2 text-xs font-semibold hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder/60 transition"
          >
            Admin: Import Explore CSV
          </a>
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
        <button
          onClick={() => onSelect("dining")}
          className="w-full relative overflow-hidden rounded-2xl h-40 shadow-lg group focus:outline-none focus:ring-2 focus:ring-du-crimson"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-du-crimson to-red-800 transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 text-left">
            <div className="text-3xl mb-1">🍽️</div>
            <div className="text-white font-bold text-2xl drop-shadow">Dining</div>
            <div className="text-white/70 text-xs mt-1">{DINING_TYPES.join("  ·  ")}</div>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 group-hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
        <button
          onClick={() => onSelect("activity")}
          className="w-full relative overflow-hidden rounded-2xl h-40 shadow-lg group focus:outline-none focus:ring-2 focus:ring-du-crimson"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-700 to-yellow-600 transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 text-left">
            <div className="text-3xl mb-1">🗺️</div>
            <div className="text-white font-bold text-2xl drop-shadow">Activities</div>
            <div className="text-white/70 text-xs mt-1">{ACTIVITY_TYPES.join("  ·  ")}</div>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 group-hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Place list with type filter ───────────────────────────────────────
function PlaceList({ city, category, isAdmin, favorites, onBack, onCreateEvent }) {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeType, setActiveType]   = useState("All");
  const [search, setSearch]           = useState("");
  const [deleting, setDeleting]       = useState(null);
  const [showFavOnly, setShowFavOnly] = useState(false);

  const cityData = CITIES.find((c) => c.key === city);
  const typeList = category === "dining" ? DINING_TYPES : ACTIVITY_TYPES;

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeExplore({ city, category }, (data) => {
      setItems(data);
      setLoading(false);
    });
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
    return result;
  }, [items, activeType, search]);

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
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-ink-sub dark:text-ink-subOnDark text-sm">
            {items.length === 0 ? "No places added yet." : "No results match your search."}
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
