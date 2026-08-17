import { useEffect, useMemo, useState } from "react";
import {
  subscribeItinerary,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
} from "../lib/itinerary";
import { wallClockToInstant, instantToWallClock, toDate } from "../lib/userFlights";
import { listenerErrorMessage } from "../lib/subscribe";
import ListenerError from "../components/ListenerError.jsx";

// Cities offered for an itinerary item, with the zone the entered wall-clock
// time is interpreted in. "" = no city (interpreted in Singapore time as a
// sensible trip default).
const CITY_OPTIONS = [
  { value: "", label: "No city", tz: "Asia/Singapore" },
  { value: "Singapore", label: "Singapore", tz: "Asia/Singapore" },
  { value: "Ho Chi Minh City", label: "Ho Chi Minh City", tz: "Asia/Ho_Chi_Minh" },
];

function tzForCity(city) {
  return CITY_OPTIONS.find((c) => c.value === city)?.tz || "Asia/Singapore";
}

const EMPTY = { id: null, title: "", when: "", locationName: "", city: "" };

export default function ItineraryAdmin() {
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeItinerary(setItems, (e) => setLoadError(listenerErrorMessage(e))), []);

  const editing = Boolean(form.id);
  const canSave = useMemo(() => form.title.trim() && form.when, [form]);

  function startEdit(item) {
    setError("");
    setForm({
      id: item.id,
      title: item.title || "",
      when: instantToWallClock(item.startTime, tzForCity(item.city || "")),
      locationName: item.locationName || "",
      city: item.city || "",
    });
  }

  function resetForm() {
    setForm(EMPTY);
    setError("");
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const startTime = wallClockToInstant(form.when, tzForCity(form.city));
      if (!startTime) throw new Error("Enter a valid date and time.");
      const payload = {
        title: form.title,
        startTime,
        locationName: form.locationName,
        city: form.city,
      };
      if (editing) {
        await updateItineraryItem(form.id, payload);
      } else {
        await createItineraryItem(payload);
      }
      resetForm();
    } catch (e) {
      setError(e?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    try {
      await deleteItineraryItem(item.id);
      if (form.id === item.id) resetForm();
    } catch (e) {
      setError(e?.message || "Could not delete. Please try again.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-crimson";

  return (
    <div className="p-5 space-y-4 pb-24">
      <div>
        <h1 className="text-xl font-bold text-ink-main dark:text-ink-onDark">Manage Itinerary</h1>
        <p className="text-sm text-ink-sub dark:text-ink-subOnDark">
          The cohort's dated plan. These appear in each member's Home · Up Next.
        </p>
      </div>

      <ListenerError message={loadError} />

      {/* Editor */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-3">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
          {editing ? "Edit item" : "Add item"}
        </div>

        <label className="block">
          <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">Title</div>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="S&P Global Visit"
          />
        </label>

        <label className="block">
          <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">Date &amp; time</div>
          <input
            type="datetime-local"
            className={inputClass}
            value={form.when}
            onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">City</div>
            <select
              className={inputClass}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            >
              {CITY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">Location (optional)</div>
            <input
              className={inputClass}
              value={form.locationName}
              onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
              placeholder="Marina Bay Sands"
            />
          </label>
        </div>

        {error && <div className="text-sm text-du-crimson">{error}</div>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-lg bg-du-crimson text-white px-4 py-2 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add item"}
          </button>
          {editing && (
            <button
              onClick={resetForm}
              disabled={saving}
              className="rounded-lg border border-surface-border dark:border-surface-darkBorder px-4 py-2 text-sm font-semibold text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border/40 transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-10 text-ink-sub dark:text-ink-subOnDark text-sm">
            No itinerary items yet. Add the first one above.
          </div>
        ) : (
          items.map((item) => {
            const when = toDate(item.startTime);
            const tz = tzForCity(item.city || "");
            const label = when
              ? new Intl.DateTimeFormat("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                  hour: "numeric", minute: "2-digit", timeZone: tz,
                }).format(when)
              : "";
            return (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-surface-border dark:border-surface-darkBorder p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">{item.title}</div>
                  <div className="text-xs text-ink-sub dark:text-ink-subOnDark mt-0.5">
                    {label}
                    {item.locationName ? ` · ${item.locationName}` : ""}
                    {item.city ? ` · ${item.city}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => startEdit(item)} className="text-xs text-du-gold font-semibold hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(item)} className="text-xs text-du-crimson hover:opacity-70 transition">
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
