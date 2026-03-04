// src/pages/Media.jsx
// Curated media links (YouTube videos + articles) for Singapore & HCMC.
// Admin-managed: admins can add and delete items. All cohort members can view.

import { useState, useEffect } from "react";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db, COHORT_ID } from "../lib/firebase.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const CITIES = [
  { key: "all",       label: "All" },
  { key: "singapore", label: "🇸🇬 Singapore" },
  { key: "vietnam",   label: "🇻🇳 Vietnam" },
];

const TYPES = [
  { key: "video",   label: "Videos",   icon: "▶️" },
  { key: "article", label: "Articles", icon: "📰" },
];

// ── Firestore helpers ─────────────────────────────────────────────────────────
function mediaCol() {
  return collection(db, "cohorts", COHORT_ID, "media");
}

function subscribeMedia(callback) {
  const q = query(mediaCol(), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

async function addMediaItem(item) {
  await addDoc(mediaCol(), { ...item, createdAt: serverTimestamp() });
}

async function deleteMediaItem(id) {
  await deleteDoc(doc(db, "cohorts", COHORT_ID, "media", id));
}

// ── YouTube thumbnail helper ──────────────────────────────────────────────────
function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.includes("/embed/")) return u.pathname.split("/embed/")[1].split("?")[0];
      return u.searchParams.get("v");
    }
    return null;
  } catch {
    return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Media({ isAdmin }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeCity, setActiveCity] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [addOpen, setAddOpen]     = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeMedia((data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = items.filter((item) => {
    const cityMatch = activeCity === "all" || item.city === activeCity;
    const typeMatch = activeType === "all" || item.type === activeType;
    return cityMatch && typeMatch;
  });

  const videos   = filtered.filter((i) => i.type === "video");
  const articles = filtered.filter((i) => i.type === "article");

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#0d0d0d]/95 backdrop-blur border-b border-white/10 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white tracking-tight">Media</h1>
          {isAdmin && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 bg-[#BA0C2F] hover:bg-[#9a0a27] text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <span className="text-base leading-none">+</span> Add
            </button>
          )}
        </div>

        {/* City filter */}
        <div className="flex gap-2 mb-2">
          {CITIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveCity(c.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeCity === c.key
                  ? "bg-[#BA0C2F] text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveType("all")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeType === "all"
                ? "bg-white/20 text-white"
                : "bg-white/8 text-white/50 hover:bg-white/15"
            }`}
          >
            All
          </button>
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeType === t.key
                  ? "bg-white/20 text-white"
                  : "bg-white/8 text-white/50 hover:bg-white/15"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 py-4 space-y-6">
        {loading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState isAdmin={isAdmin} onAdd={() => setAddOpen(true)} />
        ) : (
          <>
            {/* Videos section */}
            {videos.length > 0 && (
              <section>
                <SectionHeader icon="▶️" label="Videos" count={videos.length} />
                <div className="space-y-3">
                  {videos.map((item) => (
                    <VideoCard
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onPlay={() => setLightboxUrl(item.url)}
                      onDelete={() => deleteMediaItem(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Articles section */}
            {articles.length > 0 && (
              <section>
                <SectionHeader icon="📰" label="Articles" count={articles.length} />
                <div className="space-y-3">
                  {articles.map((item) => (
                    <ArticleCard
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onDelete={() => deleteMediaItem(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ── YouTube lightbox ── */}
      {lightboxUrl && (
        <VideoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* ── Add modal ── */}
      {addOpen && (
        <AddMediaModal
          onClose={() => setAddOpen(false)}
          onSave={async (item) => {
            await addMediaItem(item);
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, label, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{icon}</span>
      <span className="text-white font-semibold text-sm tracking-wide">{label}</span>
      <span className="text-white/30 text-xs">({count})</span>
      <div className="flex-1 h-px bg-white/10 ml-1" />
    </div>
  );
}

// ── Video card ────────────────────────────────────────────────────────────────
function VideoCard({ item, isAdmin, onPlay, onDelete }) {
  const thumb = getYouTubeThumbnail(item.url);
  const cityLabel = item.city === "singapore" ? "🇸🇬 Singapore" : "🇻🇳 Vietnam";

  async function handleDelete(e) {
    e.stopPropagation();
    if (!window.confirm("Remove this video?")) return;
    await onDelete();
  }

  return (
   <div
      onClick={() => getYouTubeId(item.url) ? onPlay() : window.open(item.url, "_blank")}
      className="flex gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl overflow-hidden cursor-pointer transition-all active:scale-[0.98]"
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-28 h-20 bg-black rounded-l-xl overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/10">
            <span className="text-2xl">▶️</span>
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
            <span className="text-white text-xs ml-0.5">▶</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 py-2.5 pr-3 min-w-0">
        <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{item.title}</p>
        {item.description && (
          <p className="text-white/50 text-xs mt-1 line-clamp-1">{item.description}</p>
        )}
        <p className="text-white/30 text-xs mt-1.5">{cityLabel}</p>
      </div>

      {/* Admin delete */}
      {isAdmin && (
        <button
          onClick={handleDelete}
          className="self-start mt-2 mr-2 text-white/30 hover:text-red-400 transition-colors p-1"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Article card ──────────────────────────────────────────────────────────────
function ArticleCard({ item, isAdmin, onDelete }) {
  const cityLabel = item.city === "singapore" ? "🇸🇬 Singapore" : "🇻🇳 Vietnam";

  async function handleDelete(e) {
    e.stopPropagation();
    if (!window.confirm("Remove this article?")) return;
    await onDelete();
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3.5 transition-all active:scale-[0.98] block"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
        <span className="text-lg">📰</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{item.title}</p>
        {item.description && (
          <p className="text-white/50 text-xs mt-1 line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <p className="text-white/30 text-xs">{cityLabel}</p>
          {item.source && (
            <>
              <span className="text-white/20 text-xs">·</span>
              <p className="text-white/30 text-xs truncate">{item.source}</p>
            </>
          )}
        </div>
      </div>

      {/* Arrow + admin delete */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <svg className="w-4 h-4 text-white/30 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {isAdmin && (
          <button
            onClick={handleDelete}
            className="text-white/20 hover:text-red-400 transition-colors p-0.5"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </a>
  );
}

// ── YouTube lightbox ──────────────────────────────────────────────────────────
function VideoLightbox({ url, onClose }) {
  const videoId = getYouTubeId(url);
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1`
    : url;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ aspectRatio: "16/9" }}
      >
        <iframe
          src={embedUrl}
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video"
        />
      </div>
    </div>
  );
}

// ── Add media modal (admin only) ──────────────────────────────────────────────
function AddMediaModal({ onClose, onSave }) {
  const [type, setType]         = useState("video");
  const [city, setCity]         = useState("singapore");
  const [title, setTitle]       = useState("");
  const [url, setUrl]           = useState("");
  const [description, setDesc]  = useState("");
  const [source, setSource]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (!url.trim())   { setError("URL is required."); return; }
    // no URL format validation — YouTube gets auto-thumbnail, others just won't
    setError("");
    setSaving(true);
    try {
      await onSave({
        type, city, title: title.trim(),
        url: url.trim(),
        description: description.trim(),
        source: source.trim(),
      });
    } catch {
      setError("Save failed. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(160deg, #1a0508 0%, #0d0103 100%)", border: "1px solid rgba(196,150,42,0.25)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(196,150,42,0.15)" }}>
          <h2 style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: "18px", fontWeight: 700 }}>
            Add Media
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors text-xl">✕</button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">

          {/* Type toggle */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  type === t.key ? "bg-[#BA0C2F] text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* City */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">City</label>
            <div className="flex gap-2">
              {[{ key: "singapore", label: "🇸🇬 Singapore" }, { key: "vietnam", label: "🇻🇳 Vietnam" }].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCity(c.key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    city === c.key ? "bg-white/20 text-white" : "bg-white/8 text-white/50 hover:bg-white/15"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "video" ? "e.g. Singapore: A Food Paradise" : "e.g. The Ultimate Guide to HCMC"}
              className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#BA0C2F]"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
              {type === "video" ? "YouTube URL *" : "Article URL *"}
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={type === "video" ? "https://www.youtube.com/watch?v=..." : "https://..."}
              className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#BA0C2F]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
              Short description <span className="text-white/25 normal-case font-normal">(optional)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="A brief note about this resource..."
              className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#BA0C2F]"
            />
          </div>

          {/* Source (articles only) */}
          {type === "article" && (
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
                Source <span className="text-white/25 normal-case font-normal">(optional, e.g. CNN Travel)</span>
              </label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Lonely Planet"
                className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#BA0C2F]"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #C4962A 0%, #a07820 100%)", color: "#0d0103" }}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-3 bg-white/5 rounded-xl overflow-hidden animate-pulse">
          <div className="w-28 h-20 bg-white/10 flex-shrink-0" />
          <div className="flex-1 py-3 pr-3 space-y-2">
            <div className="h-3 bg-white/10 rounded w-4/5" />
            <div className="h-3 bg-white/10 rounded w-3/5" />
            <div className="h-2.5 bg-white/10 rounded w-1/4 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ isAdmin, onAdd }) {
  return (
    <div className="text-center py-20 text-white/40">
      <span className="text-5xl block mb-4">🎬</span>
      <p className="text-sm font-medium text-white/50">No media yet</p>
      {isAdmin ? (
        <button
          onClick={onAdd}
          className="mt-4 px-4 py-2 rounded-lg bg-[#BA0C2F] text-white text-sm font-semibold hover:bg-[#9a0a27] transition-colors"
        >
          Add the first item
        </button>
      ) : (
        <p className="text-xs mt-2 text-white/30">Videos and articles will appear here.</p>
      )}
    </div>
  );
}
