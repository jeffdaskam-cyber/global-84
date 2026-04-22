import { useCallback, useEffect, useRef, useState } from "react";
import { getDoc } from "firebase/firestore";
import { subscribePhotos, uploadPhoto, deletePhoto, toggleLike } from "../lib/gallery";
import { memberDoc } from "../lib/members";

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
  const fileInputRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    const city = activeCity === "all" ? null : activeCity;
    return subscribePhotos((data) => {
      setPhotos(data);
      setLoading(false);
    }, city);
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
        const uploaderName = memberSnap.data()?.displayName || user.email;

        await uploadPhoto(
          file,
          {
            city: uploadCity,
            uploaderUid: user.uid,
            uploaderName,
          },
          setUploadProgress
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

      <div className="p-4">
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
                onOpen={() => setLightbox(photo)}
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
    </div>
  );
}

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
    <div className="break-inside-avoid mb-3 group relative rounded-xl overflow-hidden cursor-pointer" onClick={onOpen}>
      <img
        src={photo.url}
        alt={`Photo by ${photo.uploaderName}`}
        className="w-full object-cover block transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />

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
          <a
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="text-white/60 hover:text-white transition-colors p-2"
            title="Download photo"
          >
            Save
          </a>
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
