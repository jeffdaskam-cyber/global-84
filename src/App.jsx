import { useEffect, useState, useRef } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import AuthGate from "./components/AuthGate.jsx";
import SplashScreen from "./components/SplashScreen.jsx";

import Home from "./pages/Home.jsx";
import Explore from "./pages/Explore.jsx";
import ExploreImport from "./pages/ExploreImport.jsx";
import Chat from "./pages/Chat.jsx";
import Events from "./pages/Events.jsx";
import Me from "./pages/Me.jsx";
import Gallery from "./pages/Gallery";
import Media from "./pages/Media.jsx";
import Currency from "./pages/Currency.jsx";
import Team from "./pages/Team.jsx";
import Translate from "./pages/Translate.jsx";
import EventEditorModal from "./components/features/EventEditorModal.jsx";

import { subscribeIsAdmin } from "./lib/admins.js";
import { auth, db, COHORT_ID } from "./lib/firebase.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

const LS_KEY = "global84_lastViewedEventsAt";

// ─────────────────────────────────────────────────────────────────────────────
// Drawer nav structure
// Plain items: { to, label, icon }
// Group items: { group, label, icon, children: [{ to, label, icon }] }
// ─────────────────────────────────────────────────────────────────────────────
const DRAWER_NAV = [
  { to: "/",        label: "Home",    icon: "🏠" },
  { to: "/explore", label: "Explore", icon: "🗺️" },
  { to: "/gallery", label: "Gallery", icon: "📷" },
  {
    group: "connect",
    label: "Connect",
    icon: "💬",
    children: [
      { to: "/chat", label: "Chat",  icon: "💬" },
      { to: "/team", label: "Teams", icon: "👥" },
    ],
  },
  { to: "/events", label: "Events", icon: "📅" },
  { to: "/media",  label: "Media",  icon: "🎬" },
  {
    group: "utilities",
    label: "Utilities",
    icon: "🔧",
    children: [
      { to: "/currency",  label: "Currency Exchange", icon: "💱" },
      { to: "/translate", label: "Translator",        icon: "🌐" },
    ],
  },
  { to: "/me", label: "Me", icon: "👤" },
];

// ── Side Drawer ───────────────────────────────────────────────────────────────
function SideDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const drawerRef = useRef(null);

  // Track which collapsible groups are open — both closed by default
  const [openGroups, setOpenGroups] = useState({ connect: false, utilities: false });

  function toggleGroup(key) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function handleNav(to) {
    navigate(to);
    onClose();
  }

  // Shared hover style handlers (avoids Tailwind specificity issues on buttons)
  const hoverOn  = (e) => { e.currentTarget.style.background = "rgba(196,150,42,0.12)"; };
  const hoverOff = (e) => { e.currentTarget.style.background = "transparent"; };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "rgba(13,1,3,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Drawer panel */}
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
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-5 pt-10 pb-6"
          style={{ borderBottom: "1px solid rgba(196,150,42,0.2)" }}
        >
          <div>
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "22px",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.3px",
              }}
            >
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
            style={{
              width: 32,
              height: 32,
              background: "rgba(196,150,42,0.12)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "18px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Nav items */}
        <nav
          className="flex-1 px-3 py-4 overflow-y-auto"
          style={{ display: "flex", flexDirection: "column", gap: "2px" }}
        >
          {DRAWER_NAV.map((item) => {

            // ── Collapsible group (Connect, Utilities) ──────────────────────
            if (item.group) {
              const isOpen = openGroups[item.group];
              return (
                <div key={item.group}>
                  {/* Group header — tap to expand/collapse */}
                  <button
                    onClick={() => toggleGroup(item.group)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                    style={{ color: "rgba(255,255,255,0.85)" }}
                    onMouseEnter={hoverOn}
                    onMouseLeave={hoverOff}
                  >
                    <div className="flex items-center gap-4">
                      <span style={{ fontSize: "20px" }}>{item.icon}</span>
                      <span
                        style={{
                          fontFamily: "Georgia, serif",
                          fontSize: "16px",
                          fontWeight: 600,
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                    {/* Chevron rotates 180° when the group is open */}
                    <svg
                      style={{
                        width: "16px",
                        height: "16px",
                        color: "rgba(196,150,42,0.75)",
                        transition: "transform 0.2s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        flexShrink: 0,
                      }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Child links — rendered only when group is open */}
                  {isOpen && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1px",
                        marginTop: "1px",
                      }}
                    >
                      {item.children.map(({ to, label, icon }) => (
                        <button
                          key={to}
                          onClick={() => handleNav(to)}
                          className="w-full flex items-center gap-3 rounded-xl transition-all text-left"
                          style={{
                            paddingLeft: "52px",
                            paddingTop: "10px",
                            paddingBottom: "10px",
                            paddingRight: "16px",
                            color: "rgba(255,255,255,0.75)",
                          }}
                          onMouseEnter={hoverOn}
                          onMouseLeave={hoverOff}
                        >
                          <span style={{ fontSize: "17px" }}>{icon}</span>
                          <span
                            style={{
                              fontFamily: "Georgia, serif",
                              fontSize: "14px",
                              fontWeight: 500,
                            }}
                          >
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // ── Plain nav link ──────────────────────────────────────────────
            return (
              <button
                key={item.to}
                onClick={() => handleNav(item.to)}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-left"
                style={{ color: "rgba(255,255,255,0.85)" }}
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
              >
                <span style={{ fontSize: "20px" }}>{item.icon}</span>
                <span
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "16px",
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Drawer footer */}
        <div className="px-5 py-5" style={{ borderTop: "1px solid rgba(196,150,42,0.15)" }}>
          <p
            style={{
              fontSize: "10px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(196,150,42,0.5)",
            }}
          >
            Singapore ◆ Vietnam
          </p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottom nav tab components — unchanged from original
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// App root — unchanged from original
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null);
  const [hasNewEvents, setHasNewEvents] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Global event editor — handles both editing existing events and prefilling from Explore
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [eventEditorEvent, setEventEditorEvent] = useState(null);     // existing event (edit mode)
  const [eventEditorPrefill, setEventEditorPrefill] = useState(null); // place data (from Explore)

  // Call with an existing event object to edit it, a prefill object to pre-fill a new event,
  // or nothing / null to open a blank new event form.
  function openEventEditor(prefillOrEvent = null) {
    if (prefillOrEvent?.id) {
      // Has a Firestore id → it's an existing event being edited
      setEventEditorEvent(prefillOrEvent);
      setEventEditorPrefill(null);
    } else {
      // No id → treat as prefill data for a new event (or null for blank)
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

  useEffect(() => {
    const unsub = subscribeIsAdmin(setIsAdmin);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsub();
  }, []);

  // Subscribe to events and compare against lastViewedEventsAt
  useEffect(() => {
    const eventsRef = collection(db, "cohorts", COHORT_ID, "events");
    const q = query(eventsRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const lastViewed = parseInt(localStorage.getItem(LS_KEY) || "0", 10);
      const now = Date.now();
      const hasNew = snap.docs.some((doc) => {
        const data = doc.data();
        const createdMs = data.createdAt?.toMillis?.() ?? 0;
        const eventDate = data.startTime?.toMillis?.() ?? 0;
        return createdMs > lastViewed && eventDate > now;
      });
      setHasNewEvents(hasNew);
    });
    return () => unsub();
  }, []);

  return (
    <AuthGate>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Side drawer — sits outside page content, above everything */}
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
        <div className="pb-16">
          <Routes>
            <Route path="/" element={<Home onOpenDrawer={() => setDrawerOpen(true)} />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/gallery" element={<Gallery user={user} isAdmin={isAdmin} />} />
            <Route
              path="/explore"
              element={<Explore isAdmin={isAdmin} onCreateEvent={openEventEditor} />}
            />
            <Route
              path="/explore-import"
              element={
                isAdmin ? (
                  <ExploreImport isAdmin={true} />
                ) : (
                  <Navigate to="/explore" replace />
                )
              }
            />
            <Route path="/chat" element={<Chat isAdmin={isAdmin} />} />
            <Route
              path="/events"
              element={
                <Events
                  onViewed={() => setHasNewEvents(false)}
                  onCreateEvent={openEventEditor}
                />
              }
            />
            <Route path="/me" element={<Me />} />
            <Route path="/team" element={<Team isAdmin={isAdmin} />} />
            <Route path="/media" element={<Media isAdmin={isAdmin} />} />
            <Route path="/currency" element={<Currency />} />
            <Route path="/translate" element={<Translate />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Bottom navigation — 5 tabs, unchanged */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-surface-border dark:border-surface-darkBorder bg-white/90 dark:bg-surface-darkCard/90 backdrop-blur">
          <div className="max-w-l mx-auto flex">
            <TabLink to="/" label="Home" icon="🏠" />
            <TabLink to="/explore" label="Explore" icon="🗺️" />
            <TabLink to="/chat" label="Chat" icon="💬" />
            <EventsTabLink hasNewEvents={hasNewEvents} />
            <TabLink to="/team" label="Teams" icon="👥" />
          </div>
        </div>
      </div>

      {/* Global EventEditorModal — rendered outside routes so any page can trigger it */}
      <EventEditorModal
        open={eventEditorOpen}
        onClose={closeEventEditor}
        event={eventEditorEvent}
        prefill={eventEditorPrefill}
      />
    </AuthGate>
  );
}
