import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";
import { subscribeEventsByCity, subscribeRsvps } from "../lib/events";
import { listenerErrorMessage } from "../lib/subscribe";
import EventCard from "../components/features/EventCard.jsx";
import EventEditorModal from "../components/features/EventEditorModal.jsx";
import ListenerError from "../components/ListenerError.jsx";

const CITIES = ["Singapore", "Ho Chi Minh City"];
// Per-user keys so visit state doesn't leak between members on a shared browser.
const LS_KEY_PREFIX = "global84_lastViewedEventsAt";
const CITY_KEY_PREFIX = "global84_eventsCity";
function lastViewedEventsKey(uid) {
  return uid ? `${LS_KEY_PREFIX}_${uid}` : LS_KEY_PREFIX;
}
function cityKey(uid) {
  return uid ? `${CITY_KEY_PREFIX}_${uid}` : CITY_KEY_PREFIX;
}

export default function Events({ onViewed, isAdmin }) {
  const user = auth.currentUser;
  // The threshold for "New for You" is the timestamp of the *previous* visit,
  // read once on mount before we overwrite it below. On a first-ever visit
  // there's no stored value, so everything un-RSVP'd counts as new.
  const [lastViewedAt] = useState(() => {
    const stored = Number(localStorage.getItem(lastViewedEventsKey(user?.uid)));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  });
  // Opens on whichever city this user last picked. Validated against CITIES so
  // a stale or hand-edited value can't pin the query to a city that never matches.
  const [city, setCity] = useState(() => {
    const stored = localStorage.getItem(cityKey(user?.uid));
    return CITIES.includes(stored) ? stored : CITIES[0];
  });
  const [events, setEvents] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [allRsvps, setAllRsvps] = useState({});
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState(null);

  // Record this visit as the new "last viewed" time for next time.
  useEffect(() => {
    localStorage.setItem(lastViewedEventsKey(user?.uid), String(Date.now()));
    onViewed?.();
  }, [onViewed, user?.uid]);

  function selectCity(option) {
    setCity(option);
    localStorage.setItem(cityKey(user?.uid), option);
  }

  useEffect(() => {
    setLoadError("");
    return subscribeEventsByCity(city, setEvents, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
  }, [city]);

  // Subscribe to each event's RSVPs. Key the effect on the *set of event ids*
  // (a stable string) rather than the events array, whose identity changes on
  // every snapshot — otherwise all RSVP listeners would be torn down and
  // recreated on each events update.
  const eventIds = useMemo(() => events.map((e) => e.id).join(","), [events]);

  useEffect(() => {
    if (!eventIds) return;
    const ids = eventIds.split(",");

    // A failed RSVP listener leaves that event's attendee list stale rather than
    // blocking the page, so it reports to the console via watch() and drops the
    // entry instead of surfacing 50 separate banners.
    const unsubscribers = ids.map((id) =>
      subscribeRsvps(
        id,
        (rsvps) => {
          setAllRsvps((previous) => ({ ...previous, [id]: rsvps }));
        },
        () => {
          setAllRsvps((previous) => {
            const { [id]: _dropped, ...rest } = previous;
            return rest;
          });
        }
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [eventIds]);

  const { newForYou, allEvents } = useMemo(() => {
    const uid = user?.uid;
    const newItems = [];
    const regularItems = [];

    for (const event of events) {
      const rsvps = allRsvps[event.id] ?? [];
      const hasRsvp = rsvps.some((rsvp) => rsvp.uid === uid);
      // "New" = created since the user's previous visit and not yet RSVP'd.
      const createdAt = event.createdAt?.toMillis?.() ?? 0;

      if (!hasRsvp && createdAt > lastViewedAt) {
        newItems.push(event);
      } else {
        regularItems.push(event);
      }
    }

    newItems.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    regularItems.sort((a, b) => (a.startTime?.toMillis?.() ?? 0) - (b.startTime?.toMillis?.() ?? 0));

    return { newForYou: newItems, allEvents: regularItems };
  }, [allRsvps, events, user?.uid, lastViewedAt]);

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
            onClick={() => selectCity(option)}
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

      <ListenerError message={loadError} />

      {/* An empty list during a listener failure means "we couldn't load", not
          "nothing is planned" — the banner above says so, so suppress the
          invitation to create the first event. */}
      {events.length === 0 && !loadError ? (
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
                <EventCard
                  key={event.id}
                  event={event}
                  rsvps={allRsvps[event.id] ?? []}
                  onEdit={openEdit}
                  isAdmin={isAdmin}
                />
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
                <EventCard
                  key={event.id}
                  event={event}
                  rsvps={allRsvps[event.id] ?? []}
                  onEdit={openEdit}
                  isAdmin={isAdmin}
                />
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
