// src/components/SplashScreen.jsx
// Flow: Singapore photo (Ken Burns zoom-out) → HCMC photo → splash animation → done
import { useEffect, useRef, useState } from "react";

// ── Photo config ──────────────────────────────────────────────────────────────
const PHOTOS = [
  { src: "/splash-singapore.jpg", label: "Singapore",        flag: "🇸🇬" },
  { src: "/splash-HCMC.jpg",      label: "Ho Chi Minh City", flag: "🇻🇳" },
];

// ── Timing ────────────────────────────────────────────────────────────────────
const PHOTO_HOLD_MS  = 3000; // how long each city photo is shown
const FADE_MS        = 700;  // cross-fade between phases
const SPLASH_HOLD_MS = 5000; // how long the splash animation runs

// ── Phases ────────────────────────────────────────────────────────────────────
const PHASES = ["photo_0", "photo_1", "splash"];

export default function SplashScreen({ onComplete }) {
  const [phaseIdx, setPhaseIdx]         = useState(0);
  const [fadeOut, setFadeOut]           = useState(false);
  const [splashMounted, setSplashMounted] = useState(false);
  const [zoomKey, setZoomKey]           = useState(0); // forces zoom restart per photo
  const timerRef                        = useRef(null);
  const skippedRef                      = useRef(false);

  const phase = PHASES[phaseIdx];

  // ── Advance to next phase ─────────────────────────────────────────────────
  function advance() {
    clearTimeout(timerRef.current);
    setFadeOut(true);
    timerRef.current = setTimeout(() => {
      const next = phaseIdx + 1;
      if (next >= PHASES.length) {
        onComplete();
        return;
      }
      setFadeOut(false);
      setPhaseIdx(next);
      setZoomKey((k) => k + 1);
      if (PHASES[next] === "splash") {
        setTimeout(() => setSplashMounted(true), 80);
        setTimeout(() => onComplete(), SPLASH_HOLD_MS);
      }
    }, FADE_MS);
  }

  // ── Skip to splash ────────────────────────────────────────────────────────
  function handleSkip() {
    if (skippedRef.current) return;
    skippedRef.current = true;
    clearTimeout(timerRef.current);
    setFadeOut(true);
    setTimeout(() => {
      setFadeOut(false);
      setPhaseIdx(PHASES.indexOf("splash"));
      setTimeout(() => setSplashMounted(true), 80);
      setTimeout(() => onComplete(), SPLASH_HOLD_MS);
    }, FADE_MS);
  }

  // ── Auto-advance photo phases ─────────────────────────────────────────────
  useEffect(() => {
    if (phase === "splash") return;
    timerRef.current = setTimeout(advance, PHOTO_HOLD_MS);
    return () => clearTimeout(timerRef.current);
  }, [phaseIdx]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background: "#0a0204",
        opacity: fadeOut ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      }}
    >
      {/* ── Photo phases ── */}
      {(phase === "photo_0" || phase === "photo_1") && (() => {
        const idx   = phase === "photo_0" ? 0 : 1;
        const photo = PHOTOS[idx];
        return (
          <>
            {/* Ken Burns zoom-out: starts at 115%, eases to 100% */}
            <div
              key={zoomKey}
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${photo.src})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                transform: "scale(1.15)",
                animation: `kenBurnsOut ${PHOTO_HOLD_MS + FADE_MS}ms ease-out forwards`,
              }}
            />

            {/* Vignette */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)",
              }}
            />

            {/* Bottom gradient for text */}
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: "220px",
                background:
                  "linear-gradient(to top, rgba(10,2,4,0.9) 0%, transparent 100%)",
              }}
            />

            {/* City label — fades in from start */}
            <div
              className="absolute bottom-16 px-8"
              style={{
                opacity: 0,
                animation: "fadeInUp 0.8s ease-out 0.1s forwards",
              }}
            >
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "11px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "rgba(196,150,42,0.9)",
                  marginBottom: "8px",
                }}
              >
                {photo.flag}  {photo.label}
              </div>
              <div
                style={{
                  height: "1px",
                  width: "44px",
                  background:
                    "linear-gradient(to right, rgba(196,150,42,0.8), transparent)",
                }}
              />
            </div>

            {/* Global 84 watermark — top left */}
            <div
              className="absolute top-10 left-8"
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "13px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.05em",
                opacity: 0,
                animation: "fadeIn 0.6s ease-out 0.2s forwards",
              }}
            >
              Global{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #e8b84b, #f5d47a, #c4862a)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                84
              </span>
            </div>

            {/* Skip button — top right */}
            <button
              onClick={handleSkip}
              style={{
                position: "absolute",
                top: "40px",
                right: "24px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "20px",
                padding: "5px 14px",
                color: "rgba(255,255,255,0.7)",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                backdropFilter: "blur(6px)",
                cursor: "pointer",
                opacity: 0,
                animation: "fadeIn 0.6s ease-out 0.4s forwards",
              }}
            >
              Skip ›
            </button>
          </>
        );
      })()}

      {/* ── Splash phase ── */}
      {phase === "splash" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background:
              "linear-gradient(175deg, #0a0204 0%, #1a0508 45%, #BA0C2F 100%)",
          }}
        >
          {/* University of Denver */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(196,150,42,0.85)",
              marginBottom: "16px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
              transitionDelay: "0ms",
            }}
          >
            University of Denver
          </div>

          {/* Global */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "64px",
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1,
              letterSpacing: "-1px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateX(0)" : "translateX(-30px)",
              transition: "opacity 0.9s ease-out, transform 0.9s ease-out",
              transitionDelay: "200ms",
            }}
          >
            Global
          </div>

          {/* 84 */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "96px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-2px",
              background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(30px)",
              transition: "opacity 1s ease-out, transform 1s ease-out",
              transitionDelay: "350ms",
            }}
          >
            84
          </div>

          {/* Diamond */}
          <div
            style={{
              color: "rgba(196,150,42,0.7)",
              fontSize: "10px",
              margin: "20px 0",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out",
              transitionDelay: "550ms",
            }}
          >
            ◆
          </div>

          {/* Tagline line 1 */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "14px",
              fontStyle: "italic",
              color: "rgba(255,248,230,0.85)",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out",
              transitionDelay: "700ms",
            }}
          >
            Creating Global Leaders
          </div>

          {/* Tagline line 2 */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "13px",
              fontStyle: "italic",
              color: "rgba(196,150,42,0.8)",
              marginTop: "4px",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out",
              transitionDelay: "1050ms",
            }}
          >
            Singapore & Vietnam
          </div>

          {/* Loading bar */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: "rgba(196,150,42,0.15)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "linear-gradient(to right, #C4962A, #f5d47a, #C4962A)",
                opacity: splashMounted ? 1 : 0,
                transform: splashMounted ? "translateX(0%)" : "translateX(-100%)",
                transition: `opacity 0.3s ease-out, transform ${SPLASH_HOLD_MS - 400}ms linear`,
                transitionDelay: "400ms",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Keyframe definitions ── */}
      <style>{`
        @keyframes kenBurnsOut {
          from { transform: scale(1.15); }
          to   { transform: scale(1.0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
