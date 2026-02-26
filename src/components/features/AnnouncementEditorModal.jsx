import { useEffect, useMemo, useState } from "react";
import { createAnnouncement } from "../../lib/announcements";

export default function AnnouncementEditorModal({ open, onClose }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setPinned(true);
    setSaving(false);
    setError("");
  }, [open]);

  const canSave = useMemo(() => title.trim() && body.trim(), [title, body]);

  if (!open) return null;

  async function submit() {
    setError("");
    if (!canSave) return;
    setSaving(true);
    try {
      await createAnnouncement({ title, body, pinned });
      onClose();
    } catch (e) {
      setError(e?.message || "Could not create announcement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3">
      <div className="w-full max-w-md rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-ink-main dark:text-ink-onDark">
              New announcement
            </div>
            <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
              Visible to the whole cohort.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-ink-sub dark:text-ink-subOnDark"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Title
            </div>
            <input
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Logistics update, dinner plan, reminder…"
              disabled={saving}
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Body
            </div>
            <textarea
              rows={5}
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the announcement text here…"
              disabled={saving}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              disabled={saving}
            />
            Pin to top
          </label>

          {error ? <div className="text-sm text-du-crimson">{error}</div> : null}

          <button
            onClick={submit}
            disabled={!canSave || saving}
            className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}