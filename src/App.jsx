import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { collection, orderBy, query, Timestamp, where } from "firebase/firestore";

import AuthGate from "./components/AuthGate.jsx";
import SplashScreen from "./components/SplashScreen.jsx";
import NotificationPrompt from "./components/NotificationPrompt.jsx";
import DesktopSidebar from "./components/DesktopSidebar.jsx";
import { subscribeIsAdmin } from "./lib/admins.js";
import { auth, db, COHORT_ID } from "./lib/firebase.js";
import { watch } from "./lib/subscribe.js";

const Home = lazy(() => import("./pages/Home.jsx"));
const Explore = lazy(() => import("./pages/Explore.jsx"));
const ExploreImport = lazy(() => import("./pages/ExploreImport.jsx"));
const ItineraryAdmin = lazy(() => import("./pages/ItineraryAdmin.jsx"));
const Chat = lazy(() => import("./pages/Chat.jsx"));
const Events = lazy(() => import("./pages/Events.jsx"));
const Me = lazy(() => import("./pages/Me.jsx"));
const Gallery = lazy(() => import("./pages/Gallery.jsx"));
const Media = lazy(() => import("./pages/Media.jsx"));
const Currency = lazy(() => import("./pages/Currency.jsx"));
const Team = lazy(() => import("./pages/Team.jsx"));
const Translate = lazy(() => import("./pages/Translate.jsx"));
const EventEditorModal = lazy(() => import("./components/features/EventEditorModal.jsx"));

// Per-user key so visit state doesn't leak between members on a shared
// browser. Must match lastViewedEventsKey() in pages/Events.jsx (kept local
// here so the lazy-loaded Events page stays out of the main bundle).
const LS_KEY_PREFIX = "global84_lastViewedEventsAt";
function lastViewedEventsKey(uid) {
  return uid ? `${LS_KEY_PREFIX}_${uid}` : LS_KEY_PREFIX;
}

// Flattened drawer: plain, non-collapsing sections grouped by moment-of-use.
// Home / Explore / Events / Chat / Me all live in the bottom nav now, so the
// drawer carries the destinations that don't earn a permanent tab slot.
const DRAWER_SECTIONS = [
  {
    label: "Plan",
    items: [
      { to: "/media", label: "Trip Planning", icon: "🎬" },
      { to: "/gallery", label: "Gallery", icon: "📷" },
    ],
  },
  {
    label: "Connect",
    items: [{ to: "/team", label: "Teams", icon: "👥" }],
  },
  {
    label: "Tools",
    items: [
      { to: "/currency", label: "Currency Exchange", icon: "💱" },
      { to: "/translate", label: "Translator", icon: "🌐" },
    ],
  },
];

// Admin-only actions, rendered below a hairline with a crimson section label.
// "Post Announcement" routes Home and asks it to open the announcement editor,
// since that modal lives on the Home page.
const ADMIN_SECTION = {
  label: "Admin",
  items: [
    { to: "/", state: { openAnnounce: true }, label: "Post Announcement", icon: "📣" },
    { to: "/events", label: "Manage Events", icon: "📅" },
    { to: "/itinerary-admin", label: "Manage Itinerary", icon: "🗓️" },
    { to: "/explore-import", label: "Import Explore Content", icon: "📥" },
  ],
};

function PageLoader() {
  return (
    <div className="p-5">
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Loading...</div>
      </div>
    </div>
  );
}

// One flattened, non-collapsing drawer section: a small caps label over a
// column of single-tap nav rows. The Admin variant is fenced off by a top
// hairline and takes a crimson label instead of the gold used elsewhere.
function DrawerSection({ section, onNav, hoverHandlers, admin = false }) {
  return (
    <div
      style={
        admin
          ? { marginTop: "12px", paddingTop: "14px", borderTop: "1px solid rgba(196,150,42,0.2)" }
          : { marginTop: "6px" }
      }
    >
      <div
        style={{
          padding: "0 16px 6px",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: admin ? "rgba(186,12,47,0.75)" : "rgba(196,150,42,0.6)",
        }}
      >
        {section.label}
      </div>
      {section.items.map((item) => (
        <button
          key={item.label}
          onClick={() => onNav(item.to, item.state)}
          className="w-full flex items-center gap-3 rounded-[10px] transition-all text-left"
          style={{ padding: "10px 16px", color: "rgba(255,255,255,0.85)" }}
          {...hoverHandlers}
        >
          <span style={{ fontSize: "17px", width: "22px", textAlign: "center" }}>{item.icon}</span>
          <span style={{ fontFamily: "Georgia, serif", fontSize: "14px", fontWeight: 600 }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function SideDrawer({ open, onClose, isAdmin }) {
  const navigate = useNavigate();
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(event) {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleNav(to, state) {
    navigate(to, state ? { state } : undefined);
    onClose();
  }

  const hoverHandlers = useMemo(
    () => ({
      onMouseEnter: (event) => {
        event.currentTarget.style.background = "rgba(196,150,42,0.12)";
      },
      onMouseLeave: (event) => {
        event.currentTarget.style.background = "transparent";
      },
    }),
    []
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "rgba(13,1,3,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      <div
        ref={drawerRef}
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          width: "72vw",
          maxWidth: "300px",
          background: "linear-gradient(160deg, #0d0103 0%, #1c0408 50%, #2a0a10 100%)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: open ? "-4px 0 32px rgba(0,0,0,0.5)" : "none",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-10 pb-6" style={{ borderBottom: "1px solid rgba(196,150,42,0.2)" }}>
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "22px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.3px" }}>
              Global{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                84
              </span>
            </div>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.18em",
                color: "rgba(196,150,42,0.75)",
                textTransform: "uppercase",
                marginTop: "2px",
              }}
            >
              Navigation
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full"
            style={{ width: 32, height: 32, background: "rgba(196,150,42,0.12)", color: "rgba(255,255,255,0.7)", fontSize: "18px" }}
          >
            X
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {DRAWER_SECTIONS.map((section) => (
            <DrawerSection key={section.label} section={section} onNav={handleNav} hoverHandlers={hoverHandlers} />
          ))}

          {isAdmin && (
            <DrawerSection
              section={ADMIN_SECTION}
              onNav={handleNav}
              hoverHandlers={hoverHandlers}
              admin
            />
          )}
        </nav>

        <div className="px-5 py-5" style={{ borderTop: "1px solid rgba(196,150,42,0.15)" }}>
          <p
            style={{
              fontSize: "10px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(196,150,42,0.5)",
            }}
          >
            Singapore and Vietnam
          </p>
        </div>
      </div>
    </>
  );
}

function TabLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition ${
          isActive
            ? "text-du-crimson"
            : "text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark"
        }`
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
    </NavLink>
  );
}

function EventsTabLink({ hasNewEvents }) {
  const location = useLocation();
  const isActive = location.pathname === "/events";

  return (
    <NavLink
      to="/events"
      className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition relative ${
        isActive
          ? "text-du-crimson"
          : "text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark"
      }`}
    >
      <span className="text-xl leading-none relative inline-block">
        📅
        {hasNewEvents && !isActive && (
          <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-du-crimson border-2 border-white dark:border-surface-darkCard" />
        )}
      </span>
      <span className="text-xs font-semibold">Events</span>
    </NavLink>
  );
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null);
  const [hasNewEvents, setHasNewEvents] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [eventEditorEvent, setEventEditorEvent] = useState(null);
  const [eventEditorPrefill, setEventEditorPrefill] = useState(null);

  function openEventEditor(prefillOrEvent = null) {
    if (prefillOrEvent?.id) {
      setEventEditorEvent(prefillOrEvent);
      setEventEditorPrefill(null);
    } else {
      setEventEditorEvent(null);
      setEventEditorPrefill(prefillOrEvent);
    }
    setEventEditorOpen(true);
  }

  function closeEventEditor() {
    setEventEditorOpen(false);
    setEventEditorEvent(null);
    setEventEditorPrefill(null);
  }

  useEffect(() => subscribeIsAdmin(setIsAdmin), []);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user?.uid) return;
    const key = lastViewedEventsKey(user.uid);
    const eventsRef = collection(db, "cohorts", COHORT_ID, "events");

    // This listener exists only to decide whether one dot is lit, so it must not
    // pay for the whole events collection to do it — over a US-hosted database
    // that was every event doc crossing the Pacific on each app open. Bounding
    // it by the last visit usually returns nothing at all.
    //
    // The threshold is a floor, not the test: it is captured once when the
    // effect runs, while the comparison below re-reads localStorage on every
    // snapshot. Since the captured value is never newer than the stored one,
    // the query returns a superset of what the check needs, so the badge stays
    // exact even after visiting Events updates the timestamp mid-session.
    //
    // Deliberately unbounded. A limit here would have to be applied by
    // createdAt, but the badge also depends on startTime, and the two do not
    // order together: if the newest N events have all already started while an
    // older-created one is still upcoming, that event falls outside the cap and
    // the dot silently stays off. Restricting the query to upcoming events
    // instead would mean a second inequality on a different field, which drags
    // in a composite index and pins "now" at query-construction time. The
    // createdAt filter is what does the real work — it usually matches nothing
    // at all — so the cap bought very little and cost exactness.
    const seenFloorMs = parseInt(localStorage.getItem(key) || "0", 10);
    const eventsQuery = query(
      eventsRef,
      where("createdAt", ">", Timestamp.fromMillis(seenFloorMs)),
      orderBy("createdAt", "desc")
    );

    // A dropped listener here only means the "new events" dot goes stale, so
    // clear it rather than leaving a badge the member cannot resolve by looking.
    return watch(
      "new-events-badge",
      eventsQuery,
      (snapshot) => {
        const lastViewed = parseInt(localStorage.getItem(key) || "0", 10);
        const now = Date.now();
        const hasNew = snapshot.docs.some((doc) => {
          const data = doc.data();
          const createdMs = data.createdAt?.toMillis?.() ?? 0;
          const eventDate = data.startTime?.toMillis?.() ?? 0;
          return createdMs > lastViewed && eventDate > now;
        });
        setHasNewEvents(hasNew);
      },
      () => setHasNewEvents(false)
    );
  }, [user?.uid]);

  return (
    <>
      {/* Splash is rendered outside AuthGate so it paints immediately on load,
          independent of Firebase Auth/Firestore resolving. Its own animation
          runs ~6s while auth resolves in parallel behind this fixed overlay. */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      <AuthGate>
      {/* Mobile-only: hamburger drawer. Hidden on desktop, where the persistent
          sidebar carries the same destinations. */}
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} isAdmin={isAdmin} />

      <NotificationPrompt user={user} />

      {/* Desktop-only persistent nav rail (≥lg). */}
      <DesktopSidebar isAdmin={isAdmin} hasNewEvents={hasNewEvents} />

      <div className="min-h-screen bg-surface-light dark:bg-surface-dark lg:pl-[220px]">
        <div className="pb-16 lg:pb-0">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route
                path="/"
                element={<Home isAdmin={isAdmin} onOpenDrawer={() => setDrawerOpen(true)} />}
              />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/gallery" element={<Gallery user={user} isAdmin={isAdmin} />} />
              <Route
                path="/explore"
                element={<Explore isAdmin={isAdmin} onCreateEvent={openEventEditor} />}
              />
              <Route
                path="/explore-import"
                element={isAdmin ? <ExploreImport isAdmin /> : <Navigate to="/explore" replace />}
              />
              <Route
                path="/itinerary-admin"
                element={isAdmin ? <ItineraryAdmin /> : <Navigate to="/" replace />}
              />
              <Route path="/chat" element={<Chat isAdmin={isAdmin} />} />
              <Route
                path="/events"
                element={<Events isAdmin={isAdmin} onViewed={() => setHasNewEvents(false)} onCreateEvent={openEventEditor} />}
              />
              <Route path="/me" element={<Me />} />
              <Route path="/team" element={<Team isAdmin={isAdmin} />} />
              <Route path="/media" element={<Media isAdmin={isAdmin} />} />
              <Route path="/currency" element={<Currency />} />
              <Route path="/translate" element={<Translate />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>

        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-surface-border dark:border-surface-darkBorder bg-white/90 dark:bg-surface-darkCard/90 backdrop-blur">
          <div className="max-w-l mx-auto flex">
            <TabLink to="/" label="Home" icon="🏠" />
            <TabLink to="/explore" label="Explore" icon="🗺️" />
            <EventsTabLink hasNewEvents={hasNewEvents} />
            <TabLink to="/chat" label="Chat" icon="💬" />
            <TabLink to="/me" label="Me" icon="👤" />
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <EventEditorModal
          open={eventEditorOpen}
          onClose={closeEventEditor}
          event={eventEditorEvent}
          prefill={eventEditorPrefill}
        />
      </Suspense>
      </AuthGate>
    </>
  );
}
