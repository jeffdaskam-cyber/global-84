import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";
import { subscribeMember } from "../lib/members";
import { subscribeEventsByCity, subscribeRsvps } from "../lib/events";
import EventCard from "../components/features/EventCard.jsx";
import EventEditorModal from "../components/features/EventEditorModal.jsx";

const CITIES = ["Singapore", "Ho Chi Minh City"];
const LS_KEY = "global84_lastViewedEventsAt";

export default function Events({ onViewed }) {
  const user = auth.currentUser;
  const [viewedAt] = useState(() => Date.now());
  const [member, setMember] = useState(null);
  const [selectedCity, setSelectedCity] = useState("Singapore");
  const [events, setEvents] = useState([]);
  const [allRsvps, setAllRsvps] = useState({});
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, String(viewedAt));
    onViewed?.();
  }, [onViewed, viewedAt]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMember(user.uid, setMember);
  }, [user?.uid]);

  const city = member?.defaultCity || selectedCity;

  useEffect(() => subscribeEventsByCity(city, setEvents), [city]);

  useEffect(() => {
    if (events.length === 0) return;

    const unsubscribers = events.map((event) =>
      subscribeRsvps(event.id, (rsvps) => {
        setAllRsvps((previous) => ({ ...previous, [event.id]: rsvps }));
      })
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [events]);

  const { newForYou, allEvents } = useMemo(() => {
    const uid = user?.uid;
    const newItems = [];
    const regularItems = [];

    for (const event of events) {
      const rsvps = allRsvps[event.id] ?? [];
      const hasRsvp = rsvps.some((rsvp) => rsvp.uid === uid);
      const eventDate = event.startTime?.toMillis?.() ?? 0;

      if (!hasRsvp && eventDate > viewedAt) {
        newItems.push(event);
      } else {
        regularItems.push(event);
      }
    }

    newItems.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    regularItems.sort((a, b) => (a.startTime?.toMillis?.() ?? 0) - (b.startTime?.toMillis?.() ?? 0));

    return { newForYou: newItems, allEvents: regularItems };
  }, [allRsvps, events, user?.uid, viewedAt]);

  function openCreate() {
    setEditing(null);
    setOpenEditor(true);
  }

  function openEdit(event) {
    setEditing(event);
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

      <div className="flex gap-2">
        {CITIES.map((option) => (
          <button
            key={option}
            onClick={() => setSelectedCity(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              city === option
                ? "bg-du-crimson text-white"
                : "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark"
            }`}
          >
            {option === "Ho Chi Minh City" ? "HCMC" : "Singapore"}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">No events yet</div>
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
        <div className="space-y-6">
          {newForYou.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-du-crimson uppercase tracking-wide">New for You</span>
                <div className="flex-1 h-px bg-du-crimson/20" />
              </div>
              {newForYou.map((event) => (
                <EventCard key={event.id} event={event} onEdit={openEdit} />
              ))}
            </div>
          )}

          {allEvents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark uppercase tracking-wide">
                  All Events
                </span>
                <div className="flex-1 h-px bg-surface-border dark:bg-surface-darkBorder" />
              </div>
              {allEvents.map((event) => (
                <EventCard key={event.id} event={event} onEdit={openEdit} />
              ))}
            </div>
          )}
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
