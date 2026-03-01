import { useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
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

import { subscribeIsAdmin } from "./lib/admins.js";
import { auth, db, COHORT_ID } from "./lib/firebase.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

const LS_KEY = "global84_lastViewedEventsAt";

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
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
        <div className="pb-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/gallery" element={<Gallery user={user} isAdmin={isAdmin} />} />
            <Route path="/explore" element={<Explore isAdmin={isAdmin} />} />
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
              element={<Events onViewed={() => setHasNewEvents(false)} />}
            />
            <Route path="/me" element={<Me />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Bottom navigation */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-surface-border dark:border-surface-darkBorder bg-white/90 dark:bg-surface-darkCard/90 backdrop-blur">
          <div className="max-w-xl mx-auto flex">
            <TabLink to="/" label="Home" icon="🏠" />
            <TabLink to="/explore" label="Explore" icon="🗺️" />
            <TabLink to="/chat" label="Chat" icon="💬" />
            <EventsTabLink hasNewEvents={hasNewEvents} />
            <TabLink to="/gallery" label="Gallery" icon="📷" />
            <TabLink to="/me" label="Me" icon="👤" />
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
