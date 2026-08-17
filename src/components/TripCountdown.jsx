import { useEffect, useState } from "react";
import { TRIP_START } from "../lib/trip";

// Shared with Home's weather strip via lib/trip.js so the countdown and the
// strip flip to their "trip started" state at the very same instant.
const TARGET = TRIP_START;

const TICK_MS = 30 * 1000;

function remainingFrom(now) {
  const ms = TARGET.getTime() - now;
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

export default function TripCountdown() {
  const [left, setLeft] = useState(() => remainingFrom(Date.now()));

  useEffect(() => {
    const id = setInterval(() => setLeft(remainingFrom(Date.now())), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Target has passed: remove the widget from the page entirely.
  if (!left) return null;

  const units = [
    { value: left.days, suffix: "d" },
    { value: left.hours, suffix: "h" },
    { value: left.minutes, suffix: "m" },
  ];

  return (
    <div className="px-6 pb-2 bg-surface-light dark:bg-surface-dark">
      <div
        className="flex items-center justify-center gap-3.5 rounded-xl shadow-card"
        style={{
          padding: "9px 16px",
          background: "linear-gradient(135deg, #1c0408 0%, #BA0C2F 100%)",
          border: "1px solid rgba(196,150,42,0.35)",
        }}
      >
        <div className="flex items-baseline gap-3.5">
          {units.map((u) => (
            <div key={u.suffix} className="text-center">
              <span
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "17px",
                  fontWeight: 700,
                  lineHeight: 1,
                  background:
                    "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {u.value}
              </span>
              <span
                style={{ fontSize: "9px", color: "rgba(255,250,243,0.75)", marginLeft: "3px" }}
              >
                {u.suffix}
              </span>
            </div>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "rgba(196,150,42,0.35)" }} />

        <p
          style={{
            margin: 0,
            fontSize: "10px",
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
            color: "#fffaf3",
            whiteSpace: "nowrap",
          }}
        >
          to Singapore
        </p>
      </div>
    </div>
  );
}
