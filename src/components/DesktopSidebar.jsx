import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

// Persistent desktop navigation rail (≥lg). It replaces the mobile bottom nav +
// hamburger drawer at desktop widths, folding every destination that lived in
// those two surfaces into one always-visible column. Mobile is untouched — this
// whole component is display:none below lg via the wrapper's Tailwind classes.

// Primary destinations, in the order the desktop homepage design lays them out.
// Events carries a live "new events" dot, mirroring the bottom-nav badge.
const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/explore", label: "Explore", icon: "🗺️" },
  { to: "/events", label: "Events", icon: "📅", badge: true },
  { to: "/chat", label: "Chat", icon: "💬" },
  { to: "/media", label: "Trip Planning", icon: "🎬" },
  { to: "/gallery", label: "Gallery", icon: "📷" },
  { to: "/team", label: "Teams", icon: "👥" },
  { to: "/currency", label: "Currency", icon: "💱" },
  { to: "/translate", label: "Translator", icon: "🌐" },
];

// Admin destinations lost when the drawer is hidden on desktop. "Post
// Announcement" routes Home with the same flag the drawer used so the editor
// modal (which lives on Home) still opens.
const ADMIN_ITEMS = [
  { to: "/", label: "Post Announcement", icon: "📣", state: { openAnnounce: true } },
  { to: "/events", label: "Manage Events", icon: "📅" },
  { to: "/itinerary-admin", label: "Manage Itinerary", icon: "🗓️" },
  { to: "/explore-import", label: "Import Explore", icon: "📥" },
];

function rowStyle(active, hovered) {
  return {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    padding: "10px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: active ? 600 : 500,
    textDecoration: "none",
    color: active ? "#fff" : "rgba(255,255,255,0.7)",
    background: active
      ? "rgba(196,150,42,0.12)"
      : hovered
      ? "rgba(196,150,42,0.06)"
      : "transparent",
    transition: "background 150ms ease",
  };
}

function NavRow({ item }) {
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      style={({ isActive }) => rowStyle(isActive, hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: "16px", width: "20px", textAlign: "center" }}>{item.icon}</span>
      <span>{item.label}</span>
      {item.badge ? (
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--du-crimson, #BA0C2F)",
            marginLeft: "auto",
          }}
        />
      ) : null}
    </NavLink>
  );
}

function AdminRow({ item }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => navigate(item.to, item.state ? { state: item.state } : undefined)}
      style={{ ...rowStyle(false, hovered), width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: "16px", width: "20px", textAlign: "center" }}>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
}

// Show the Events dot only when there's something new AND the member isn't
// already on Events, matching the bottom-nav rule.
export default function DesktopSidebar({ isAdmin, hasNewEvents }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const { name, initials } = useMemo(() => {
    const display = user?.displayName || user?.email || "Me";
    const parts = display.trim().split(/\s+/).filter(Boolean);
    const inits = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0])
      : (display[0] || "?");
    return { name: user?.displayName || display, initials: inits.toUpperCase() };
  }, [user]);

  return (
    <aside
      className="hidden lg:flex fixed top-0 left-0 bottom-0 z-30 flex-col"
      style={{
        width: "220px",
        background: "#0d0103",
        borderRight: "1px solid rgba(196,150,42,0.08)",
      }}
    >
      {/* Brand */}
      <div style={{ padding: "28px 20px 22px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: "24px", fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" }}>
            Global
          </span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "26px",
              fontWeight: 700,
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
            height: "2px",
            width: "36px",
            borderRadius: "2px",
            background: "linear-gradient(to right, #C4962A, rgba(196,150,42,0.2))",
            marginTop: "10px",
          }}
        />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: "1px", overflowY: "auto" }}>
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.label} item={{ ...item, badge: item.badge ? hasNewEvents : false }} />
        ))}

        {isAdmin ? (
          <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(196,150,42,0.12)" }}>
            <div
              style={{
                padding: "0 14px 6px",
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "rgba(186,12,47,0.8)",
              }}
            >
              Admin
            </div>
            {ADMIN_ITEMS.map((item) => (
              <AdminRow key={item.label} item={item} />
            ))}
          </div>
        ) : null}
      </nav>

      {/* User footer → Me */}
      <button
        onClick={() => navigate("/me")}
        style={{
          padding: "16px 20px",
          background: "transparent",
          border: "none",
          borderTop: "1px solid rgba(196,150,42,0.12)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "var(--du-crimson, #BA0C2F)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>👤 Me</div>
          </div>
        </div>
      </button>
    </aside>
  );
}
