import { useEffect, useMemo, useState } from "react";
import { createEvent, updateEvent, archiveEvent, eventKind } from "../../lib/events";
import {
  instantToWallClock,
  wallClockToInstant,
  zoneForCity,
} from "../../config/timezones";

// Kept in sync with the CITIES array in pages/Events.jsx — see the comment
// there about Denver being a one-time, Events-only addition.
const CITIES = ["Singapore", "Ho Chi Minh City", "Denver"];
const CITY_SHORT_LABELS = {
  Singapore: "Singapore",
  "Ho Chi Minh City": "HCMC",
  Denver: "Denver",
};

// New events default to 6pm on the current date in the destination city, not
// on the organiser's device — planning from Denver should still land at dinner
// time in Singapore.
const DEFAULT_START_HOUR = "18:00";

function defaultStartFor(city) {
  // Today's date as it reads in the destination city, at the default hour.
  const todayThere = instantToWallClock(new Date(), city).slice(0, 10);
  return `${todayThere}T${DEFAULT_START_HOUR}`;
}

const KIND_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "adhoc", label: "Ad hoc" },
];

export default function EventEditorModal({ open, onClose, defaultCity, event, prefill }) {
  const isEdit = !!event?.id;

  const [kind, setKind] = useState("scheduled");
  // Ad hoc only: whether the organiser is attaching a time at all.
  const [hasTime, setHasTime] = useState(false);
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
      const editCity = event.city || defaultCity || "Singapore";
      const editKind = eventKind(event);
      const dated = event.startTime != null;
      setKind(editKind);
      setHasTime(dated);
      setTitle(event.title || "");
      setCity(editCity);
      // Undated ad hoc events get the usual default so ticking "Add a time"
      // or switching to Scheduled starts somewhere sensible.
      setStartTime(dated ? instantToWallClock(event.startTime, editCity) : defaultStartFor(editCity));
      setLocationName(event.locationName || "");
      setDescription(event.description || "");
    } else {
      const newCity = prefill?.city || defaultCity || "Singapore";
      setKind("scheduled");
      setHasTime(false);
      setTitle(prefill?.title || "");
      setCity(newCity);
      setStartTime(defaultStartFor(newCity));

      setLocationName(prefill?.locationName || "");
      setDescription("");
    }
    setError("");
  }, [open, isEdit, event, defaultCity, prefill]);

  const isAdhoc = kind === "adhoc";
  const showTime = !isAdhoc || hasTime;

  const canSave = useMemo(() => {
    if (!title.trim() || !city) return false;
    if (kind === "adhoc") return !hasTime || !!startTime;
    return !!startTime && !!locationName.trim();
  }, [kind, hasTime, title, city, startTime, locationName]);

  if (!open) return null;

  async function submit() {
    setError("");
    if (!canSave) return;
    setSaving(true);

    try {
      const fields = {
        kind,
        title,
        city,
        // null (not omitted) clears the time — see lib/events.js.
        startTime: showTime ? wallClockToInstant(startTime, city) : null,
        locationName,
        description,
      };
      if (isEdit) {
        await updateEvent(event.id, fields);
      } else {
        await createEvent(fields);
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
      <div className="w-full max-w-md rounded-xl overflow-hidden bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
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
          <div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-border/60 dark:bg-surface-darkBorder p-1">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setKind(opt.value)}
                  className={`rounded-md py-1.5 text-xs font-semibold transition ${
                    kind === opt.value
                      ? "bg-surface-card dark:bg-surface-darkCard text-ink-main dark:text-ink-onDark shadow-sm"
                      : "text-ink-sub dark:text-ink-subOnDark"
                  }`}
                  disabled={saving}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {isAdhoc ? (
              <div className="mt-1.5 text-xs text-ink-sub dark:text-ink-subOnDark">
                No set place or time needed. Great for a morning run or a pub crawl.
              </div>
            ) : null}
          </div>

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
                {CITY_SHORT_LABELS[c] ?? c}
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
              placeholder={isAdhoc ? "Morning run, pub crawl…" : "Dinner, rooftop drinks, museum…"}
              disabled={saving}
            />
          </label>

          {isAdhoc ? (
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark">
              <input
                type="checkbox"
                className="h-4 w-4 accent-du-crimson"
                checked={hasTime}
                onChange={(e) => setHasTime(e.target.checked)}
                disabled={saving}
              />
              Add a time
            </label>
          ) : null}

          {showTime ? (
            <label className="block overflow-hidden">
              <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
                Date &amp; time{" "}
                <span className="font-normal text-ink-sub/80 dark:text-ink-subOnDark/80">
                  — local time in {city} ({zoneForCity(city).label})
                </span>
              </div>
              <div className="overflow-hidden rounded-lg">
                <input
                  type="datetime-local"
                  className="w-full block rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={saving}
                />
              </div>
            </label>
          ) : null}

          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
              {isAdhoc ? "Meeting point (optional)" : "Location name"}
            </div>
            <input
              className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder={isAdhoc ? "e.g. Hotel lobby" : "Venue name"}
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
