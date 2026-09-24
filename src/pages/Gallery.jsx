import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDoc } from "firebase/firestore";
import { subscribePhotos, uploadPhoto, deletePhoto, toggleLike } from "../lib/gallery";
import { memberDoc } from "../lib/members";
import {
  downloadSingle,
  downloadZip,
  formatBytes,
  isCoarsePointer,
  planParts,
} from "../lib/galleryDownload";
import { listenerErrorMessage } from "../lib/subscribe";
import ListenerError from "../components/ListenerError.jsx";

const CITIES = [
  { key: "all", label: "All Photos" },
  { key: "singapore", label: "Singapore" },
  { key: "vietnam", label: "Vietnam" },
];

export default function Gallery({ user, isAdmin }) {
  const [activeCity, setActiveCity] = useState("all");
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCity, setUploadCity] = useState("singapore");
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [originalsSaving, setOriginalsSaving] = useState(0);
  const fileInputRef = useRef(null);

  // Select mode. The selection is keyed by photo id and survives filter
  // changes, so it holds the photo objects too: photos picked under
  // Singapore aren't in `photos` while the Vietnam filter is showing.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Map());
  const [confirmDownload, setConfirmDownload] = useState(null); // { photos, filterLabel, isSelection }
  const [job, setJob] = useState(null);
  const jobAbortRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    const city = activeCity === "all" ? null : activeCity;
    return subscribePhotos(
      (data) => {
        setPhotos(data);
        setLoading(false);
      },
      city,
      (err) => {
        setLoading(false);
        setLoadError(listenerErrorMessage(err));
      }
    );
  }, [activeCity]);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file || !user?.uid) return;

      setError(null);
      setUploading(true);
      setUploadProgress(0);

      try {
        const memberSnap = await getDoc(memberDoc(user.uid));
        // Fall back to a generic label rather than the email, which would
        // otherwise be written into a world-readable photo doc.
        const uploaderName = memberSnap.data()?.displayName || "Member";

        await uploadPhoto(
          file,
          {
            city: uploadCity,
            uploaderUid: user.uid,
            uploaderName,
          },
          setUploadProgress,
          {
            onOriginalSaving: (saving) =>
              setOriginalsSaving((count) => Math.max(0, count + (saving ? 1 : -1))),
          }
        );
      } catch (err) {
        setError(err.message || "Upload failed. Please try again.");
      } finally {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [uploadCity, user]
  );

  const handleLike = useCallback(
    async (photo) => {
      if (!user?.uid) return;
      const liked = (photo.likes || []).includes(user.uid);
      try {
        await toggleLike(photo.id, user.uid, liked);
      } catch {
        setError("Couldn't update like. Please try again.");
      }
    },
    [user]
  );

  const handleDelete = useCallback(
    async (photo) => {
      if (!window.confirm("Remove this photo? This cannot be undone.")) return;
      setError(null);

      try {
        await deletePhoto(photo);
        if (lightbox?.id === photo.id) {
          setLightbox(null);
        }
      } catch {
        setError("Delete failed. Please try again.");
      }
    },
    [lightbox]
  );

  const activeCityLabel = CITIES.find((c) => c.key === activeCity)?.label || "All Photos";
  const filterName = activeCity === "all" ? "All" : activeCityLabel;

  const allCurrentSelected = photos.length > 0 && photos.every((photo) => selected.has(photo.id));

  const toggleSelected = useCallback((photo) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.set(photo.id, photo);
      return next;
    });
  }, []);

  const selectAllCurrent = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const photo of photos) next.set(photo.id, photo);
      return next;
    });
  }, [photos]);

  const clearCurrent = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const photo of photos) next.delete(photo.id);
      return next;
    });
  }, [photos]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Map());
  }, []);

  // Keep selected photo objects fresh (e.g. an original that finished
  // uploading after the photo was picked).
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const photo of photos) {
        if (next.has(photo.id) && next.get(photo.id) !== photo) {
          next.set(photo.id, photo);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [photos]);

  const runZip = useCallback(async (list, zipBaseName) => {
    const controller = new AbortController();
    jobAbortRef.current = controller;
    const { parts } = planParts(list);
    setJob({
      status: "running",
      done: 0,
      total: list.length,
      part: 1,
      parts: parts.length,
      zipBaseName,
    });

    // A phone that sleeps partway through a big job stalls the fetches.
    let wakeLock = null;
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      wakeLock = null;
    }

    try {
      const { downloaded, failed } = await downloadZip(list, {
        zipBaseName,
        signal: controller.signal,
        onProgress: (progress) => {
          if (controller.signal.aborted) return;
          setJob((prev) => (prev ? { ...prev, ...progress } : prev));
        },
      });
      setJob((prev) => ({ ...prev, status: "done", downloaded, failed }));
    } catch (err) {
      if (err?.name === "AbortError") {
        setJob(null);
      } else {
        setJob((prev) => ({
          ...prev,
          status: "error",
          message: err?.message || "Download failed. Please try again.",
        }));
      }
    } finally {
      jobAbortRef.current = null;
      try {
        await wakeLock?.release();
      } catch {
        // Already released (e.g. the page was hidden).
      }
    }
  }, []);

  const startConfirmedDownload = useCallback(() => {
    if (!confirmDownload) return;
    const { photos: list, filterLabel } = confirmDownload;
    setConfirmDownload(null);
    runZip(list, `Global84_Photos_${filterLabel.replace(/\s+/g, "-")}`);
  }, [confirmDownload, runZip]);

  const cancelJob = useCallback(() => {
    jobAbortRef.current?.abort();
  }, []);

  const retryFailed = useCallback(() => {
    if (!job?.failed?.length) return;
    runZip(job.failed, job.zipBaseName);
  }, [job, runZip]);

  const selectedPhotos = useMemo(() => [...selected.values()], [selected]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setLightbox(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-10 bg-[#0d0d0d]/95 backdrop-blur border-b border-white/10 px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-white tracking-tight mb-3">Gallery</h1>
        <div className="flex gap-2">
          {CITIES.map((city) => (
            <button
              key={city.key}
              onClick={() => setActiveCity(city.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeCity === city.key
                  ? "bg-[#BA0C2F] text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {city.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
              selectMode
                ? "bg-white text-[#0d0d0d]"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {selectMode ? "Cancel select" : "Select"}
          </button>
          <button
            onClick={() =>
              setConfirmDownload({
                photos,
                filterLabel: filterName,
                isSelection: false,
              })
            }
            disabled={photos.length === 0 || loading}
            className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Download all ({photos.length})
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
        <select
          value={uploadCity}
          onChange={(event) => setUploadCity(event.target.value)}
          disabled={uploading}
          className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 focus:outline-none focus:border-[#BA0C2F]"
        >
          <option value="singapore">Singapore</option>
          <option value="vietnam">Vietnam</option>
        </select>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-[#BA0C2F] hover:bg-[#9a0a27] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {uploading ? `Uploading ${uploadProgress}%` : "Add Photo"}
        </button>

        {!uploading && originalsSaving > 0 && (
          <p className="text-xs text-white/50">Saving full-resolution copy…</p>
        )}

        {uploading && (
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#BA0C2F] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/40 border border-red-500/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className={`p-4 ${selectMode ? "pb-24" : ""}`}>
        {loading ? (
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {[160, 200, 140, 220, 180, 200].map((height, index) => (
              <div
                key={index}
                className="w-full rounded-xl animate-pulse bg-white/10"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
        ) : loadError ? (
          <ListenerError message={loadError} />
        ) : photos.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <p className="text-sm">No photos yet. Be the first to add one.</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                isAdmin={isAdmin}
                userUid={user?.uid}
                selectMode={selectMode}
                selected={selected.has(photo.id)}
                onOpen={() => (selectMode ? toggleSelected(photo) : setLightbox(photo))}
                onDelete={() => handleDelete(photo)}
                onLike={() => handleLike(photo)}
              />
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <Lightbox
          photo={lightbox}
          isAdmin={isAdmin}
          userUid={user?.uid}
          onClose={() => setLightbox(null)}
          onDelete={() => handleDelete(lightbox)}
          onLike={() => handleLike(lightbox)}
        />
      )}

      {selectMode && (
        <SelectionBar
          count={selected.size}
          allCurrentSelected={allCurrentSelected}
          canSelectAll={photos.length > 0}
          onSelectAll={selectAllCurrent}
          onClear={clearCurrent}
          onDownload={() =>
            setConfirmDownload({
              photos: selectedPhotos,
              filterLabel: "Selection",
              isSelection: true,
            })
          }
          onDone={exitSelectMode}
        />
      )}

      {confirmDownload && (
        <ConfirmDownloadModal
          photos={confirmDownload.photos}
          filterLabel={confirmDownload.filterLabel}
          isSelection={confirmDownload.isSelection}
          onConfirm={startConfirmedDownload}
          onCancel={() => setConfirmDownload(null)}
        />
      )}

      {job && (
        <DownloadProgressModal
          job={job}
          onCancel={cancelJob}
          onRetry={retryFailed}
          onClose={() => setJob(null)}
        />
      )}
    </div>
  );
}

function SelectionBar({ count, allCurrentSelected, canSelectAll, onSelectAll, onClear, onDownload, onDone }) {
  return (
    // Sits above the mobile bottom nav (lg:hidden, ~4rem) and to the right of
    // the desktop sidebar.
    <div className="fixed left-0 right-0 bottom-16 lg:bottom-0 lg:left-[220px] z-20 px-4 pb-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-2xl flex items-center gap-2 bg-[#1a1a1a]/95 backdrop-blur border border-white/10 rounded-2xl px-3 py-2 shadow-2xl">
        <span className="text-white text-sm font-semibold whitespace-nowrap mr-auto">
          {count} selected
        </span>
        <button
          onClick={allCurrentSelected ? onClear : onSelectAll}
          disabled={!canSelectAll}
          className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-all whitespace-nowrap"
        >
          {allCurrentSelected ? "Clear" : "Select all"}
        </button>
        <button
          onClick={onDownload}
          disabled={count === 0}
          className="px-3 py-1.5 rounded-full text-sm font-semibold bg-[#BA0C2F] hover:bg-[#9a0a27] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Download
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 rounded-full text-sm font-semibold text-white/70 hover:text-white transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ConfirmDownloadModal({ photos, filterLabel, isSelection, onConfirm, onCancel }) {
  const { parts, totalBytes } = useMemo(() => planParts(photos), [photos]);
  const count = photos.length;
  const noun = count === 1 ? "photo" : "photos";
  const question = isSelection
    ? `Download ${count} selected ${noun}?`
    : filterLabel === "All"
      ? `Download all ${count} ${noun}?`
      : `Download ${count} ${noun} from ${filterLabel}?`;
  const split =
    parts.length > 1 ? `, split into ${parts.length} zip files` : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-white font-semibold">{question}</p>
        <p className="text-white/60 text-sm mt-2">
          About {formatBytes(totalBytes)}{split}. Wi-Fi recommended.
        </p>
        {isCoarsePointer() && (
          <p className="text-white/50 text-xs mt-3">
            Zip files save to your Files app. For a photo book, downloading on a computer is easiest.
          </p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-[#BA0C2F] hover:bg-[#9a0a27] text-white transition-all"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

function DownloadProgressModal({ job, onCancel, onRetry, onClose }) {
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const failedCount = job.failed?.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl p-5">
        {job.status === "running" && (
          <>
            <p className="text-white font-semibold">
              Preparing photos… {job.done} of {job.total}
            </p>
            {job.parts > 1 && (
              <p className="text-white/50 text-xs mt-1">
                Part {job.part} of {job.parts}
              </p>
            )}
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-4">
              <div
                className="h-full bg-[#BA0C2F] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-white/10 text-white hover:bg-white/20 transition-all"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {job.status === "done" && (
          <>
            <p className="text-white font-semibold">
              Downloaded {job.downloaded} {job.downloaded === 1 ? "photo" : "photos"}.
            </p>
            {failedCount > 0 && (
              <p className="text-white/60 text-sm mt-2">
                {failedCount} {failedCount === 1 ? "photo" : "photos"} couldn&apos;t be downloaded. Try again later.
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              {failedCount > 0 && (
                <button
                  onClick={onRetry}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-[#BA0C2F] hover:bg-[#9a0a27] text-white transition-all"
                >
                  Retry failed
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-white/10 text-white hover:bg-white/20 transition-all"
              >
                Close
              </button>
            </div>
          </>
        )}

        {job.status === "error" && (
          <>
            <p className="text-white font-semibold">Download failed.</p>
            <p className="text-white/60 text-sm mt-2">{job.message}</p>
            <div className="flex justify-end mt-5">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-white/10 text-white hover:bg-white/20 transition-all"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PhotoCard({ photo, isAdmin, userUid, selectMode, selected, onOpen, onDelete, onLike }) {
  const formattedDate = photo.createdAt?.toDate
    ? photo.createdAt.toDate().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";
  const likeCount = (photo.likes || []).length;
  const liked = (photo.likes || []).includes(userUid);

  return (
    <div
      className={`break-inside-avoid mb-3 group relative rounded-xl overflow-hidden cursor-pointer ${
        selected ? "ring-2 ring-[#BA0C2F] ring-offset-2 ring-offset-[#0d0d0d]" : ""
      }`}
      onClick={onOpen}
      role={selectMode ? "checkbox" : undefined}
      aria-checked={selectMode ? selected : undefined}
    >
      <img
        src={photo.url}
        alt={`Photo by ${photo.uploaderName}`}
        className="w-full object-cover block transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />

      {selectMode ? (
        <span
          className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
            selected ? "bg-[#BA0C2F] border-[#BA0C2F]" : "bg-black/40 border-white/80"
          }`}
          aria-hidden="true"
        >
          {selected && (
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between">
            <div>
              <p className="text-white text-xs font-medium truncate">{photo.uploaderName}</p>
              <p className="text-white/60 text-xs">{formattedDate}</p>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onLike();
              }}
              className="flex items-center gap-1 text-xs font-semibold transition-colors"
              style={{ color: liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }}
            >
              <span>{liked ? "Liked" : "Like"}</span>
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
          </div>

          {isAdmin && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 hover:bg-red-700 text-white rounded-full p-1"
              title="Delete photo"
            >
              X
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Lightbox({ photo, isAdmin, userUid, onClose, onDelete, onLike }) {
  const formattedDate = photo.createdAt?.toDate
    ? photo.createdAt.toDate().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const cityLabel = photo.city === "singapore" ? "Singapore" : "Vietnam";
  const likeCount = (photo.likes || []).length;
  const liked = (photo.likes || []).includes(userUid);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(false);
    try {
      await downloadSingle(photo);
    } catch (err) {
      console.warn("Photo download failed.", err);
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
        X
      </button>

      <img
        src={photo.url}
        alt={`Photo by ${photo.uploaderName}`}
        className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />

      <div className="mt-4 flex items-center justify-between w-full max-w-lg px-1" onClick={(event) => event.stopPropagation()}>
        <div>
          <p className="text-white font-semibold text-sm">{photo.uploaderName}</p>
          <p className="text-white/50 text-xs">{formattedDate} · {cityLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onLike}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-sm font-semibold"
            style={{
              background: liked ? "rgba(244,63,94,0.2)" : "rgba(255,255,255,0.1)",
              color: liked ? "#f43f5e" : "rgba(255,255,255,0.6)",
            }}
          >
            <span>{likeCount > 0 ? likeCount : ""}</span>
            <span>{liked ? "Liked" : "Like"}</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white text-sm font-semibold transition-all"
            title={downloadError ? "Download failed. Tap to try again." : "Download full-resolution photo"}
          >
            {downloading && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
            )}
            {downloading ? "Downloading" : downloadError ? "Retry" : "Download"}
          </button>
          {isAdmin && (
            <button onClick={onDelete} className="text-red-400 hover:text-red-300 transition-colors p-2" title="Delete photo">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
