// src/pages/Gallery.jsx
// Photo gallery for Global 84 — Singapore & Vietnam
// Anyone in the cohort can upload; admins can delete.

import { useState, useEffect, useRef, useCallback } from "react";
import { subscribePhotos, uploadPhoto, deletePhoto, toggleLike } from "../lib/gallery";
import { subscribeMember } from "../lib/members";

// ─── City tabs ────────────────────────────────────────────────────────────────
const CITIES = [
  { key: "all",       label: "All Photos" },
  { key: "singapore", label: "🇸🇬 Singapore" },
  { key: "vietnam",   label: "🇻🇳 Vietnam" },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function Gallery({ user, isAdmin }) {
  const [activeCity, setActiveCity]     = useState("all");
  const [photos, setPhotos]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [lightbox, setLightbox]         = useState(null); // photo object | null
  const [uploading, setUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCity, setUploadCity]     = useState("singapore");
  const [error, setError]               = useState(null);
  const fileInputRef                    = useRef(null);

  // ── Subscribe to member profile for display name ──────────────────────────
  const [memberDisplayName, setMemberDisplayName] = useState("");
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMember(user.uid, (m) => {
      setMemberDisplayName(m?.displayName || user.email);
    });
    return unsub;
  }, [user]);

  // ── Subscribe to photos ───────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const city = activeCity === "all" ? null : activeCity;
    const unsub = subscribePhotos((data) => {
      setPhotos(data);
      setLoading(false);
    }, city);
    return unsub;
  }, [activeCity]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setError(null);
      setUploading(true);
      setUploadProgress(0);

      try {
        await uploadPhoto(
          file,
          {
            city: uploadCity,
            uploaderUid:  user.uid,
            uploaderName: memberDisplayName || user.email,
          },
          (pct) => setUploadProgress(pct)
        );
      } catch (err) {
        setError(err.message || "Upload failed. Please try again.");
      } finally {
        setUploading(false);
        setUploadProgress(0);
        // Reset file input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [uploadCity, user]
  );

  // ── Like handler ──────────────────────────────────────────────────────────
  const handleLike = useCallback(
    async (photo) => {
      const liked = (photo.likes || []).includes(user.uid);
      try {
        await toggleLike(photo.id, user.uid, liked);
      } catch {
        setError("Couldn't update like. Please try again.");
      }
    },
    [user]
  );

  // ── Delete handler (admin only) ───────────────────────────────────────────
  const handleDelete = useCallback(
    async (photo) => {
      if (!window.confirm("Remove this photo? This cannot be undone.")) return;
      setError(null);
      try {
        await deletePhoto(photo);
        if (lightbox?.id === photo.id) setLightbox(null);
      } catch (err) {
        setError("Delete failed. Please try again.");
      }
    },
    [lightbox]
  );

  // ── Keyboard: close lightbox on Escape ───────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#0d0d0d]/95 backdrop-blur border-b border-white/10 px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-white tracking-tight mb-3">Gallery</h1>

        {/* City tabs */}
        <div className="flex gap-2">
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
      </div>

      {/* ── Upload bar ── */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
        {/* City picker for upload */}
        <select
          value={uploadCity}
          onChange={(e) => setUploadCity(e.target.value)}
          disabled={uploading}
          className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 focus:outline-none focus:border-[#BA0C2F]"
        >
          <option value="singapore">🇸🇬 Singapore</option>
          <option value="vietnam">🇻🇳 Vietnam</option>
        </select>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-[#BA0C2F] hover:bg-[#9a0a27] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              {uploadProgress}%
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Photo
            </>
          )}
        </button>

        {/* Upload progress bar */}
        {uploading && (
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#BA0C2F] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/40 border border-red-500/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ── Photo grid ── */}
      <div className="p-4">
        {loading ? (
          // Skeleton shimmer
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="w-full rounded-xl animate-pulse bg-white/10"
                style={{ height: `${[160, 200, 140, 220, 180, 200][i]}px` }}
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">No photos yet. Be the first to add one!</p>
          </div>
        ) : (
          // Masonry-style grid using CSS columns
          <div className="columns-2 sm:columns-3 gap-3">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                isAdmin={isAdmin}
                userUid={user.uid}
                onOpen={() => setLightbox(photo)}
                onDelete={() => handleDelete(photo)}
                onLike={() => handleLike(photo)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <Lightbox
          photo={lightbox}
          isAdmin={isAdmin}
          userUid={user.uid}
          onClose={() => setLightbox(null)}
          onDelete={() => handleDelete(lightbox)}
          onLike={() => handleLike(lightbox)}
        />
      )}
    </div>
  );
}

// ─── PhotoCard ────────────────────────────────────────────────────────────────
function PhotoCard({ photo, isAdmin, userUid, onOpen, onDelete, onLike }) {
  const formattedDate = photo.createdAt?.toDate
    ? photo.createdAt.toDate().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  const likeCount = (photo.likes || []).length;
  const liked = (photo.likes || []).includes(userUid);

  return (
    <div className="break-inside-avoid mb-3 group relative rounded-xl overflow-hidden cursor-pointer"
         onClick={onOpen}>
      <img
        src={photo.url}
        alt={`Photo by ${photo.uploaderName}`}
        className="w-full object-cover block transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Meta info + like on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between">
        <div>
          <p className="text-white text-xs font-medium truncate">{photo.uploaderName}</p>
          <p className="text-white/60 text-xs">{formattedDate}</p>
        </div>
        {/* Like button */}
        <button
          onClick={(e) => { e.stopPropagation(); onLike(); }}
          className="flex items-center gap-1 text-xs font-semibold transition-colors"
          style={{ color: liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }}
        >
          <span>{liked ? "❤️" : "🤍"}</span>
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
      </div>

      {/* Admin delete button */}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 hover:bg-red-700 text-white rounded-full p-1"
          title="Delete photo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ photo, isAdmin, userUid, onClose, onDelete, onLike }) {
  const formattedDate = photo.createdAt?.toDate
    ? photo.createdAt.toDate().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const cityLabel = photo.city === "singapore" ? "🇸🇬 Singapore" : "🇻🇳 Vietnam";
  const likeCount = (photo.likes || []).length;
  const liked = (photo.likes || []).includes(userUid);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image */}
      <img
        src={photo.url}
        alt={`Photo by ${photo.uploaderName}`}
        className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Meta bar */}
      <div
        className="mt-4 flex items-center justify-between w-full max-w-lg px-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-white font-semibold text-sm">{photo.uploaderName}</p>
          <p className="text-white/50 text-xs">{formattedDate} · {cityLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Like button */}
          <button
            onClick={onLike}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-sm font-semibold"
            style={{
              background: liked ? "rgba(244,63,94,0.2)" : "rgba(255,255,255,0.1)",
              color: liked ? "#f43f5e" : "rgba(255,255,255,0.6)",
            }}
          >
            <span>{liked ? "❤️" : "🤍"}</span>
            <span>{likeCount > 0 ? likeCount : "Like"}</span>
          </button>
          {/* Download button */}
          <a
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="text-white/60 hover:text-white transition-colors p-2"
            title="Download photo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          {/* Admin delete */}
          {isAdmin && (
            <button
              onClick={onDelete}
              className="text-red-400 hover:text-red-300 transition-colors p-2"
              title="Delete photo"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
