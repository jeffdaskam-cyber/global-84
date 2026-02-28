import { useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink } from "react-router-dom";

import AuthGate from "./components/AuthGate.jsx";

import Home from "./pages/Home.jsx";
import Explore from "./pages/Explore.jsx";
import ExploreImport from "./pages/ExploreImport.jsx";
import Chat from "./pages/Chat.jsx";
import Events from "./pages/Events.jsx";
import Me from "./pages/Me.jsx";

import { subscribeIsAdmin } from "./lib/admins.js";

function TabLink({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex-1 text-center py-3 text-sm font-semibold transition ${
          isActive
            ? "text-du-crimson"
            : "text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);

  // Single source of truth for admin gating across the app
  useEffect(() => {
    const unsub = subscribeIsAdmin(setIsAdmin);
    return () => unsub();
  }, []);

  return (
    <AuthGate>
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
        {/* Main content */}
        <div className="pb-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />

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
            <TabLink to="/" label="Home" />
            <TabLink to="/explore" label="Explore" />
            <TabLink to="/chat" label="Chat" />
            <TabLink to="/events" label="Events" />
            <TabLink to="/me" label="Me" />
          </div>

          {/* Admin shortcut (optional): only show if admin */}
          {isAdmin ? (
            <div className="max-w-xl mx-auto px-3 pb-3">
              <NavLink
                to="/explore-import"
                className={({ isActive }) =>
                  `block w-full text-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "border-du-crimson text-du-crimson"
                      : "border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder/60"
                  }`
                }
              >
                Admin: Import Explore CSV
              </NavLink>
            </div>
          ) : null}
        </div>
      </div>
    </AuthGate>
  );
}
