import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { subscribeMember } from "../lib/members";
import { subscribeEventsByCity } from "../lib/events";
import EventCard from "../components/features/EventCard.jsx";
import EventEditorModal from "../components/features/EventEditorModal.jsx";

const CITIES = ["Singapore", "Ho Chi Minh City"];

export default function Events() {
  const user = auth.currentUser;

  const [member, setMember] = useState(null);
  const [city, setCity] = useState("Singapore");
  const [events, setEvents] = useState([]);

  // Modal state
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState(null); // null = create mode; event = edit mode

  // Subscribe to member profile to get defaultCity
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeMember(user.uid, setMember);
    return () => unsub();
  }, [user?.uid]);

  // Set city from member defaultCity once loaded
  useEffect(() => {
    if (member?.defaultCity) {
      setCity(member.defaultCity);
    }
  }, [member?.defaultCity]);

  // Subscribe to events by selected city
  useEffect(() => {
    const unsub = subscribeEventsByCity(city, setEvents);
    return () => unsub();
  }, [city]);

  function openCreate() {
    setEditing(null);
    setOpenEditor(true);
  }

  function openEdit(ev) {
    setEditing(ev);
    setOpenEditor(true);
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">
            Events <span className="text-du-gold">•</span>
          </div>
          <div className="h-1 w-10 rounded-full bg-du-gold mt-2" />
        </div>

        <button
          className="rounded-lg bg-du-crimson text-white px-4 py-2 text-sm font-semibold hover:bg-du-crimsonDark transition"
          onClick={openCreate}
        >
          + Create
        </button>
      </div>

      {/* City filter */}
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
          >
            {c === "Ho Chi Minh City" ? "HCMC" : "Singapore"}
          </button>
        ))}
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            No events yet
          </div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            Be the first to plan something for {city}.
          </div>
          <button
            className="mt-4 rounded-lg bg-du-crimson text-white px-4 py-2 text-sm font-semibold hover:bg-du-crimsonDark transition"
            onClick={openCreate}
          >
            Create an event
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((e) => (
            <EventCard key={e.id} event={e} onEdit={openEdit} />
          ))}
        </div>
      )}

      <EventEditorModal
        open={openEditor}
        onClose={() => setOpenEditor(false)}
        defaultCity={city}
        event={editing}
      />
    </div>
  );
}