import { useEffect, useMemo, useState } from "react";
import { createEvent, updateEvent, archiveEvent } from "../../lib/events";

const CITIES = ["Singapore", "Ho Chi Minh City"];

function toDateTimeLocal(tsOrDate) {
  if (!tsOrDate) return "";
  const d = tsOrDate?.toDate ? tsOrDate.toDate() : new Date(tsOrDate);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function EventEditorModal({ open, onClose, defaultCity, event }) {
  const isEdit = !!event?.id;

  const [title, setTitle] = useState("");
  const [city, setCity] = useState(defaultCity || "Singapore");
  const [startTime, setStartTime] = useState("");
  const [locationName, setLocationName] = useState("");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Prefill when opening/editing
  useEffect(() => {
    if (!open) return;

    if (isEdit) {
      setTitle(event.title || "");
      setCity(event.city || defaultCity || "Singapore");
      setStartTime(toDateTimeLocal(event.startTime));
      setLocationName(event.locationName || "");
      setDescription(event.description || "");
    } else {
      setTitle("");
      setCity(defaultCity || "Singapore");

      const d = new Date();
      d.setHours(18, 0, 0, 0);
      setStartTime(toDateTimeLocal(d));

      setLocationName("");
      setDescription("");
    }
    setError("");
  }, [open, isEdit, event, defaultCity]);

  const canSave = useMemo(() => {
    return title.trim() && city && startTime && locationName.trim();
  }, [title, city, startTime, locationName]);

  if (!open) return null;

  async function submit() {
    setError("");
    if (!canSave) return;
    setSaving(true);

    try {
      if (isEdit) {
        await updateEvent(event.id, {
          title,
          city,
          startTime: new Date(startTime),
          locationName,
          description,
        });
      } else {
        await createEvent({
          title,
          city,
          startTime: new Date(startTime),
          locationName,
          description,
        });
      }

      onClose();
    } catch (e) {
      setError(e?.message || (isEdit ? "Could not update event." : "Could not create event."));
    } finally {
      setSaving(false);
    }
  }

  async function doArchive() {
    if (!isEdit) return;
    setError("");
    setSaving(true);
    try {
      await archiveEvent(event.id);
      onClose();
    } catch (e) {
      setError(e?.message || "Could not archive event.");
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
              {isEdit ? "Edit Event" : "Create Event"}
            </div>
            <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
              {isEdit ? "Update details for the cohort." : "Plan something and let the cohort join."}
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
          <div className="flex gap-2">
            {CITIES.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  city === c
                    ? "bg-du-crimson text-white"
                    : "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark"
                }`}
                disabled={saving}
              >
                {c === "Ho Chi Minh City" ? "HCMC" : "Singapore"}
              </button>
            ))}
          </div>

          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Title
            </div>
            <input
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dinner, rooftop drinks, museum…"
              disabled={saving}
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Date & time
            </div>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={saving}
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Location name
            </div>
            <input
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Venue name"
              disabled={saving}
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              Details (optional)
            </div>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Meetup details, reservation notes, dress code…"
              disabled={saving}
            />
          </label>

          {error ? <div className="text-sm text-du-crimson">{error}</div> : null}

          <button
            onClick={submit}
            disabled={!canSave || saving}
            className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
          >
            {isEdit ? "Save changes" : "Create"}
          </button>

          {isEdit ? (
            <button
              onClick={doArchive}
              disabled={saving}
              className="w-full rounded-lg border border-du-crimson text-du-crimson py-3 text-sm font-semibold hover:bg-du-crimsonSoft transition disabled:opacity-40"
            >
              Archive event
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}