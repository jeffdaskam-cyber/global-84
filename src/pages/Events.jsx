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

  const [member, setMember]     = useState(null);
  const [city, setCity]         = useState("Singapore");
  const [events, setEvents]     = useState([]);
  const [allRsvps, setAllRsvps] = useState({}); // { [eventId]: rsvp[] }

  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing]       = useState(null);

  // Clear the nav badge and record the visit timestamp
  useEffect(() => {
    localStorage.setItem(LS_KEY, Date.now().toString());
    onViewed?.();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeMember(user.uid, setMember);
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (member?.defaultCity) setCity(member.defaultCity);
  }, [member?.defaultCity]);

  useEffect(() => {
    const unsub = subscribeEventsByCity(city, setEvents);
    return () => unsub();
  }, [city]);

  // Subscribe to RSVPs for each event so we can split into sections
  useEffect(() => {
    if (events.length === 0) return;
    const unsubs = events.map((ev) =>
      subscribeRsvps(ev.id, (rsvps) =>
        setAllRsvps((prev) => ({ ...prev, [ev.id]: rsvps }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [events]);

  // Split events into "New for You" vs "All Events"
  const { newForYou, allEvents } = useMemo(() => {
    const now = Date.now();
    const uid = user?.uid;
    const newForYou = [];
    const allEvents = [];

    for (const ev of events) {
      const rsvps      = allRsvps[ev.id] ?? [];
      const myRsvp     = rsvps.find((r) => r.uid === uid);
      const hasRsvp    = !!myRsvp;
      const eventDate  = ev.startTime?.toMillis?.() ?? 0;
      const inFuture   = eventDate > now;

      if (!hasRsvp && inFuture) {
        newForYou.push(ev);
      } else {
        allEvents.push(ev);
      }
    }

    // New for You: newest first; All Events: chronological by startTime
    newForYou.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    allEvents.sort((a, b) => (a.startTime?.toMillis?.() ?? 0) - (b.startTime?.toMillis?.() ?? 0));

    return { newForYou, allEvents };
  }, [events, allRsvps, user?.uid]);

  function openCreate() { setEditing(null); setOpenEditor(true); }
  function openEdit(ev)  { setEditing(ev);   setOpenEditor(true); }

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
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

          {/* ── New for You ── */}
          {newForYou.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-du-crimson uppercase tracking-wide">
                  🆕 New for You
                </span>
                <div className="flex-1 h-px bg-du-crimson/20" />
              </div>
              {newForYou.map((e) => (
                <EventCard key={e.id} event={e} onEdit={openEdit} />
              ))}
            </div>
          )}

          {/* ── All Events ── */}
          {allEvents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark uppercase tracking-wide">
                  All Events
                </span>
                <div className="flex-1 h-px bg-surface-border dark:bg-surface-darkBorder" />
              </div>
              {allEvents.map((e) => (
                <EventCard key={e.id} event={e} onEdit={openEdit} />
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