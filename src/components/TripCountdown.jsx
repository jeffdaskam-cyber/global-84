import { useEffect, useState } from "react";

// First day together in Singapore: Nov 3, 2026, 8:00 AM SGT (UTC+8).
// Hardcoded with an explicit offset so the remaining time is identical for
// every viewer regardless of their device timezone.
const TARGET = new Date("2026-11-03T08:00:00+08:00");

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

function plural(n, word) {
  return `${word}${n === 1 ? "" : "s"}`;
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
    { value: left.days, label: plural(left.days, "day") },
    { value: left.hours, label: plural(left.hours, "hour") },
    { value: left.minutes, label: plural(left.minutes, "minute") },
  ];

  return (
    <div className="px-6 pb-2 bg-surface-light dark:bg-surface-dark">
      <div
        className="rounded-xl shadow-card px-4 py-3.5"
        style={{
          background: "linear-gradient(135deg, #1c0408 0%, #BA0C2F 100%)",
          border: "1px solid rgba(196,150,42,0.35)",
        }}
      >
        <div className="flex items-end justify-center gap-4 sm:gap-6">
          {units.map((u) => (
            <div key={u.label} className="text-center min-w-[52px]">
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "30px",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "-0.5px",
                  background:
                    "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {u.value}
              </div>
              <div
                className="mt-1 text-[10px] uppercase tracking-wider"
                style={{ color: "rgba(255,250,243,0.75)" }}
              >
                {u.label}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mx-auto mt-3"
          style={{
            height: "1px",
            width: "110px",
            background:
              "linear-gradient(to right, transparent, rgba(196,150,42,0.6), transparent)",
          }}
        />

        <p
          className="mt-2.5 text-center text-xs"
          style={{ color: "#fffaf3", fontFamily: "Georgia, serif", fontStyle: "italic" }}
        >
          until we're together in Singapore
        </p>
      </div>
    </div>
  );
}
