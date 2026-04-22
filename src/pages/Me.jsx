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

const CITIES = ["Singapore", "Ho Chi Minh City"];

export default function Me() {
  const [user, setUser] = useState(null);

  const [member, setMember] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [defaultCity, setDefaultCity] = useState("Singapore");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // ── My Files state ────────────────────────────────────────────────────────────
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  // React to auth state (fixes refresh timing issue)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // Subscribe to member doc once user is available
  useEffect(() => {
    if (!user?.uid) return;

    const unsub = subscribeMember(user.uid, (m) => {
      setMember(m);
      setDisplayName(m?.displayName || user.displayName || "Member");
      setDefaultCity(m?.defaultCity || "Singapore");
    });

    return () => unsub();
  }, [user?.displayName, user?.uid]);


  // Subscribe to this user's files
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeFiles(user.uid, setFiles);
  }, [user?.uid]);

  const canSave = useMemo(() => {
    const dn = displayName.trim();
    return dn.length > 0 && CITIES.includes(defaultCity);
  }, [displayName, defaultCity]);

  async function handleSave() {
    setErr("");
    setMsg("");
    if (!user?.uid || !canSave) return;

    setSaving(true);
    try {
      await updateMyProfile(user.uid, { displayName, defaultCity });
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

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError("");
    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadFile(user.uid, file, (pct) => setUploadProgress(pct));
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

        <label className="block">
          <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
            Default city
          </div>
          <select
            className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
            value={defaultCity}
            onChange={(e) => setDefaultCity(e.target.value)}
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
    </div>
  );
}
