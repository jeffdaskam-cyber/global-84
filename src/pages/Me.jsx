import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { signOutUser } from "../lib/auth";
import { subscribeMember, updateMyProfile } from "../lib/members";
import {
  subscribeFiles,
  uploadFile,
  deleteFile,
  validateFile,
  fileTypeIcon,
  fileTypeLabel,
  formatFileSize,
  ALLOWED_EXTENSIONS,
} from "../lib/userFiles";
import {
  subscribeFlights,
  deleteFlight,
  reorderFlights,
  computeLayover,
  tripConfirmationNumber,
  formatFlightDate,
  formatFlightTime,
  tzLabel,
} from "../lib/userFlights";
import { listenerErrorMessage } from "../lib/subscribe";
import { downscaleImage } from "../lib/images";
import ListenerError from "../components/ListenerError.jsx";
import ArcadeModal from "../components/features/ArcadeModal.jsx";
import FlightEditorModal from "../components/features/FlightEditorModal.jsx";

export default function Me() {
  const [user, setUser] = useState(null);

  const [member, setMember] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loadError, setLoadError] = useState("");

  // ── My Files state ────────────────────────────────────────────────────────────
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  // ── My Flight Info state ────────────────────────────────────────────────────
  const [flights, setFlights] = useState([]);
  const [flightEditorOpen, setFlightEditorOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState(null);
  const [flightError, setFlightError] = useState("");
  const [reordering, setReordering] = useState(false);

  // Hidden arcade easter egg
  const [arcadeOpen, setArcadeOpen] = useState(false);

  // React to auth state (fixes refresh timing issue)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // Subscribe to member doc once user is available
  useEffect(() => {
    if (!user?.uid) return;

    const unsub = subscribeMember(
      user.uid,
      (m) => {
        setMember(m);
        setDisplayName(m?.displayName || user.displayName || "Member");
      },
      (err) => setLoadError(listenerErrorMessage(err))
    );

    return () => unsub();
  }, [user?.displayName, user?.uid]);


  // Subscribe to this user's files
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeFiles(user.uid, setFiles, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
  }, [user?.uid]);

  // Subscribe to this user's flight segments (travel order)
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeFlights(user.uid, setFlights, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
  }, [user?.uid]);

  const canSave = useMemo(() => displayName.trim().length > 0, [displayName]);

  async function handleSave() {
    setErr("");
    setMsg("");
    if (!user?.uid || !canSave) return;

    setSaving(true);
    try {
      await updateMyProfile(user.uid, { displayName });
      setMsg("Saved.");
    } catch (e) {
      setErr(e?.message || "Could not save profile.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2000);
    }
  }


  // ── File upload handler ───────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected after an error
    e.target.value = "";

    // The busy flag goes up before the first await, not after. Decoding and
    // resizing a large photo takes long enough to notice, and the Add File
    // button is gated on this flag — leaving it enabled across the resize lets
    // a second tap start a concurrent handler that races the shared progress
    // state. The finally clears it on every exit, including validation failure.
    setUploadError("");
    setUploading(true);
    setUploadProgress(0);
    try {
      // Downscale before validating so an oversized photo is shrunk rather than
      // refused. PDFs pass through untouched. Validation still runs on whatever
      // comes back, so a file that could not be shrunk is still rejected.
      const upload = await downscaleImage(file);

      const validationError = validateFile(upload);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      await uploadFile(user.uid, upload, (pct) => setUploadProgress(pct));
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleDeleteFile(fileId, storagePath, fileName) {
    if (!window.confirm("Delete \"" + fileName + "\"? This cannot be undone.")) return;
    try {
      await deleteFile(user.uid, fileId, storagePath);
    } catch (err) {
      console.error("Delete failed:", err);
      setUploadError("Could not delete file. Please try again.");
    }
  }

  // ── Flight handlers ─────────────────────────────────────────────────────────
  const tripConfirmation = useMemo(
    () => tripConfirmationNumber(flights),
    [flights]
  );

  function openAddFlight() {
    setFlightError("");
    setEditingFlight(null);
    setFlightEditorOpen(true);
  }

  function openEditFlight(flight) {
    setFlightError("");
    setEditingFlight(flight);
    setFlightEditorOpen(true);
  }

  async function handleDeleteFlight(flight) {
    const label = `${flight.airline || "flight"} ${flight.flightNumber || ""}`.trim();
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setFlightError("");
    try {
      await deleteFlight(user.uid, flight.id);
    } catch (err) {
      console.error("Delete flight failed:", err);
      setFlightError("Could not delete flight. Please try again.");
    }
  }

  async function moveFlight(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= flights.length) return;
    const ids = flights.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setFlightError("");
    setReordering(true);
    try {
      await reorderFlights(user.uid, ids);
    } catch (err) {
      console.error("Reorder failed:", err);
      setFlightError("Could not reorder flights. Please try again.");
    } finally {
      setReordering(false);
    }
  }

  // Optional: simple loading state while auth hydrates
  if (!user) {
    return (
      <div className="p-5">
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            Loading profile…
          </div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            (This can take a moment after refresh.)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">
        Me <span className="text-du-gold">•</span>
      </div>
      <div className="h-1 w-10 rounded-full bg-du-gold" />

      <ListenerError message={loadError} />

      {/* Account */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Account</div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
          <div>{member?.email || user?.email || "—"}</div>
        </div>
      </div>

      {/* Profile */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-4">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Profile</div>

        <label className="block">
          <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
            Display name
          </div>
          <input
            className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>

        {err ? <div className="text-sm text-du-crimson">{err}</div> : null}
        {msg ? <div className="text-sm text-ink-sub dark:text-ink-subOnDark">{msg}</div> : null}

        <div className="flex gap-3">
          <button
            className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            Save
          </button>

          <button
            className="w-full rounded-lg border border-du-crimson text-du-crimson py-3 text-sm font-semibold hover:bg-du-crimsonSoft transition disabled:opacity-40"
            onClick={signOutUser}
            disabled={saving}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Role */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Role</div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
          {member?.role || "member"}
        </div>
      </div>

      {/* My Files */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">My Files</div>
          <button
            onClick={() => { setUploadError(""); fileInputRef.current?.click(); }}
            disabled={uploading}
            className="rounded-lg bg-du-crimson text-white px-3 py-1.5 text-xs font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
          >
            {uploading ? `Uploading… ${uploadProgress}%` : "+ Add File"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <p className="text-xs text-ink-sub dark:text-ink-subOnDark">
          Private to you only. PDF, JPG, PNG — 10 MB max.
        </p>

        {uploadError && (
          <div className="text-sm text-du-crimson">{uploadError}</div>
        )}

        {uploading && (
          <div className="w-full bg-surface-border dark:bg-surface-darkBorder rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-du-crimson rounded-full transition-all duration-200"
              style={{ width: String(uploadProgress) + "%" }}
            />
          </div>
        )}

        {files.length === 0 && !uploading ? (
          <div className="text-center py-6 text-ink-sub dark:text-ink-subOnDark text-sm">
            No files yet. Tap "+ Add File" to upload a travel document.
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-surface-border dark:border-surface-darkBorder p-3"
              >
                {/* Icon */}
                <span className="text-2xl flex-shrink-0">{fileTypeIcon(f.fileType)}</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-main dark:text-ink-onDark truncate">
                    {f.fileName}
                  </div>
                  <div className="text-xs text-ink-sub dark:text-ink-subOnDark mt-0.5">
                    {fileTypeLabel(f.fileType)} · {formatFileSize(f.fileSize)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={f.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-du-gold font-semibold hover:underline"
                  >
                    Open
                  </a>
                  <a
                    href={f.downloadUrl}
                    download={f.fileName}
                    className="text-xs text-ink-sub dark:text-ink-subOnDark hover:underline"
                  >
                    ↓
                  </a>
                  <button
                    onClick={() => handleDeleteFile(f.id, f.storagePath, f.fileName)}
                    className="text-xs text-du-crimson hover:opacity-70 transition"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Flight Info */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-du-crimson">My Flight Info</div>
          <button
            onClick={openAddFlight}
            className="rounded-lg bg-du-crimson text-white px-3 py-1.5 text-xs font-semibold hover:bg-du-crimsonDark transition"
          >
            + Add Flight
          </button>
        </div>

        <p className="text-xs text-ink-sub dark:text-ink-subOnDark">
          Private to you only. Your itinerary for the Singapore and Vietnam trip.
        </p>

        {tripConfirmation ? (
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            Confirmation:{" "}
            <span className="font-semibold text-ink-main dark:text-ink-onDark">
              {tripConfirmation}
            </span>
          </div>
        ) : null}

        {flightError && <div className="text-sm text-du-crimson">{flightError}</div>}

        {flights.length === 0 ? (
          <div className="rounded-lg bg-du-gold/5 border border-du-gold/30 text-center py-8 px-4">
            <div className="text-sm text-ink-sub dark:text-ink-subOnDark">
              No flights added yet.
            </div>
            <button
              onClick={openAddFlight}
              className="mt-3 rounded-lg bg-du-crimson text-white px-4 py-2 text-xs font-semibold hover:bg-du-crimsonDark transition"
            >
              Add Flight
            </button>
          </div>
        ) : (
          <div className="space-y-0">
            {flights.map((f, i) => {
              const layover =
                i < flights.length - 1
                  ? computeLayover(f, flights[i + 1])
                  : null;
              return (
                <div key={f.id}>
                  <FlightSegmentCard
                    flight={f}
                    index={i}
                    total={flights.length}
                    perSegmentConfirmation={!tripConfirmation}
                    reordering={reordering}
                    onEdit={() => openEditFlight(f)}
                    onDelete={() => handleDeleteFlight(f)}
                    onMoveUp={() => moveFlight(i, -1)}
                    onMoveDown={() => moveFlight(i, 1)}
                  />
                  {layover ? (
                    <div className="flex items-center gap-2 py-2 pl-3">
                      <span className="text-du-gold">⋮</span>
                      <span className="rounded-full bg-du-gold/15 text-du-gold text-xs font-semibold px-3 py-1">
                        Layover {layover} · {f.arrivalAirport}
                      </span>
                    </div>
                  ) : (
                    i < flights.length - 1 && <div className="h-2" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unlabeled easter-egg tile — opens the hidden arcade game */}
      <div className="flex justify-center pt-2 pb-4">
        <button
          onClick={() => setArcadeOpen(true)}
          aria-label="?"
          className="h-10 w-10 rounded-full border border-du-crimson bg-transparent text-du-crimson text-sm opacity-85 hover:opacity-100 transition"
        >
          ?
        </button>
      </div>

      <ArcadeModal isOpen={arcadeOpen} onClose={() => setArcadeOpen(false)} />

      <FlightEditorModal
        open={flightEditorOpen}
        onClose={() => setFlightEditorOpen(false)}
        uid={user.uid}
        flight={editingFlight}
      />
    </div>
  );
}

// ── Flight segment card ────────────────────────────────────────────────────────

function FlightSegmentCard({
  flight,
  index,
  total,
  perSegmentConfirmation,
  reordering,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  const f = flight;
  const depTz = f.departureTimeZone;
  const arrTz = f.arrivalTimeZone;

  return (
    <div className="rounded-lg border border-surface-border dark:border-surface-darkBorder p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            {f.airline} {f.flightNumber}
          </div>
          {perSegmentConfirmation && f.confirmationNumber ? (
            <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
              Conf: {f.confirmationNumber}
            </div>
          ) : null}
        </div>

        {/* Reorder + actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {total > 1 ? (
            <>
              <button
                onClick={onMoveUp}
                disabled={index === 0 || reordering}
                aria-label="Move earlier"
                className="h-7 w-7 rounded-md border border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark text-xs disabled:opacity-30 hover:bg-surface-border/40 transition"
              >
                ↑
              </button>
              <button
                onClick={onMoveDown}
                disabled={index === total - 1 || reordering}
                aria-label="Move later"
                className="h-7 w-7 rounded-md border border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark text-xs disabled:opacity-30 hover:bg-surface-border/40 transition"
              >
                ↓
              </button>
            </>
          ) : null}
          <button
            onClick={onEdit}
            className="text-xs text-du-gold font-semibold hover:underline px-1"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete flight"
            className="text-xs text-du-crimson hover:opacity-70 transition px-1"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Route */}
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold text-ink-main dark:text-ink-onDark">
            {f.departureAirport}
          </div>
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            {formatFlightDate(f.departureDateTime, depTz)}
          </div>
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            {formatFlightTime(f.departureDateTime, depTz)}{" "}
            <span className="opacity-70">{tzLabel(f.departureDateTime, depTz)}</span>
          </div>
          {f.terminal || f.gate ? (
            <div className="text-xs text-ink-sub dark:text-ink-subOnDark mt-0.5">
              {f.terminal ? `Term ${f.terminal}` : ""}
              {f.terminal && f.gate ? " · " : ""}
              {f.gate ? `Gate ${f.gate}` : ""}
            </div>
          ) : null}
        </div>

        <div className="text-du-gold text-lg pt-1 flex-shrink-0">→</div>

        <div className="min-w-0 text-right">
          <div className="text-base font-semibold text-ink-main dark:text-ink-onDark">
            {f.arrivalAirport}
          </div>
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            {formatFlightDate(f.arrivalDateTime, arrTz)}
          </div>
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            {formatFlightTime(f.arrivalDateTime, arrTz)}{" "}
            <span className="opacity-70">{tzLabel(f.arrivalDateTime, arrTz)}</span>
          </div>
        </div>
      </div>

      {/* Extras */}
      {f.seatNumber || f.cabinClass ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {f.seatNumber ? (
            <span className="rounded-full bg-surface-border/50 dark:bg-surface-darkBorder text-ink-sub dark:text-ink-subOnDark text-xs px-2 py-0.5">
              Seat {f.seatNumber}
            </span>
          ) : null}
          {f.cabinClass ? (
            <span className="rounded-full bg-surface-border/50 dark:bg-surface-darkBorder text-ink-sub dark:text-ink-subOnDark text-xs px-2 py-0.5">
              {f.cabinClass}
            </span>
          ) : null}
        </div>
      ) : null}

      {f.notes ? (
        <div className="mt-2 text-xs text-ink-sub dark:text-ink-subOnDark whitespace-pre-wrap">
          {f.notes}
        </div>
      ) : null}
    </div>
  );
}
