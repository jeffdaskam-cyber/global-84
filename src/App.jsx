import { useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink } from "react-router-dom";
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
import { auth } from "./lib/firebase.js";

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

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null); // ← tracks the signed-in Firebase user

  // Single source of truth for admin gating across the app
  useEffect(() => {
    const unsub = subscribeIsAdmin(setIsAdmin);
    return () => unsub();
  }, []);

  // Track the signed-in user so we can pass it to Gallery (and other pages as needed)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsub();
  }, []);

  return (
    <AuthGate>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
        {/* Main content */}
        <div className="pb-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/gallery" element={<Gallery user={user} isAdmin={isAdmin} />} />

            <Route path="/explore" element={<Explore isAdmin={isAdmin} />} />

            {/* Admin-only import route */}
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
            <Route path="/events" element={<Events />} />
            <Route path="/me" element={<Me />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Bottom navigation */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-surface-border dark:border-surface-darkBorder bg-white/90 dark:bg-surface-darkCard/90 backdrop-blur">
          <div className="max-w-xl mx-auto flex">
            <TabLink to="/" label="Home" icon="🏠" />
            <TabLink to="/explore" label="Explore" icon="🗺️" />
            <TabLink to="/chat" label="Chat" icon="💬" />
            <TabLink to="/events" label="Events" icon="📅" />
            <TabLink to="/gallery" label="Gallery" icon="📷" />
            <TabLink to="/me" label="Me" icon="👤" />
          </div>

        </div>
      </div>
    </AuthGate>
  );
}
