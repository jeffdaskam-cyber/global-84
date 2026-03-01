// src/components/SplashScreen.jsx
// Flow: Singapore photo → HCMC photo → splash animation → done
import { useEffect, useRef, useState } from "react";

const PHOTOS = [
  { src: "/splash-singapore.jpg", label: "Singapore",        flag: "🇸🇬" },
  { src: "/splash-HCMC.jpg",      label: "Ho Chi Minh City", flag: "🇻🇳" },
];

const PHOTO_HOLD_MS  = 3000;
const FADE_MS        = 700;
const SPLASH_HOLD_MS = 5000;

export default function SplashScreen({ onComplete }) {
  // All phase logic is driven by this single state value
  const [phase, setPhase]               = useState("photo0");   // photo0 | photo1 | splash
  const [visible, setVisible]           = useState(true);       // controls inner opacity
  const [splashMounted, setSplashMounted] = useState(false);
  const [zoomKey, setZoomKey]           = useState(0);

  const timerRef   = useRef(null);
  const busyRef    = useRef(false); // prevents double-transitions

  // ── Core transition: fade out → change phase → fade in ───────────────────
  // nextPhase is passed directly — no closures over state needed
  function transitionTo(nextPhase) {
    if (busyRef.current) return;
    busyRef.current = true;
    clearTimeout(timerRef.current);

    // Step 1: fade out
    setVisible(false);

    timerRef.current = setTimeout(() => {
      // Step 2: swap phase while invisible
      if (nextPhase === "done") {
        onComplete();
        return;
      }

      setPhase(nextPhase);
      setZoomKey(k => k + 1);

      if (nextPhase === "splash") {
        setSplashMounted(false);
      }

      // Step 3: fade back in
      timerRef.current = setTimeout(() => {
        setVisible(true);
        busyRef.current = false;

        if (nextPhase === "splash") {
          timerRef.current = setTimeout(() => setSplashMounted(true), 80);
          // Dismiss after splash completes
          timerRef.current = setTimeout(() => onComplete(), SPLASH_HOLD_MS + 200);
        }
      }, 80);
    }, FADE_MS);
  }

  // ── Auto-advance each photo after hold time ───────────────────────────────
  useEffect(() => {
    if (phase === "photo0") {
      timerRef.current = setTimeout(() => transitionTo("photo1"), PHOTO_HOLD_MS);
    } else if (phase === "photo1") {
      timerRef.current = setTimeout(() => transitionTo("splash"), PHOTO_HOLD_MS);
    }
    return () => clearTimeout(timerRef.current);
  }, [phase]); // re-runs only when phase actually changes

  // ── Skip ─────────────────────────────────────────────────────────────────
  function handleSkip() {
    transitionTo("splash");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "#0a0204" }}
    >
      {/* Inner layer — only this fades, outer stays opaque */}
      <div
        className="absolute inset-0"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      >
        {/* ── Photo phases ── */}
        {(phase === "photo0" || phase === "photo1") && (() => {
          const photo = phase === "photo0" ? PHOTOS[0] : PHOTOS[1];
          return (
            <>
              {/* Ken Burns zoom-out */}
              <div
                key={zoomKey}
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${photo.src})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  animation: `kenBurnsOut ${PHOTO_HOLD_MS + FADE_MS}ms ease-out forwards`,
                }}
              />

              {/* Vignette */}
              <div className="absolute inset-0" style={{
                background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)",
              }} />

              {/* Bottom gradient */}
              <div className="absolute bottom-0 left-0 right-0" style={{
                height: "220px",
                background: "linear-gradient(to top, rgba(10,2,4,0.9) 0%, transparent 100%)",
              }} />

              {/* City label */}
              <div className="absolute bottom-16 px-8" style={{
                opacity: 0,
                animation: "fadeInUp 0.8s ease-out 0.1s forwards",
              }}>
                <div style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "11px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "rgba(196,150,42,0.9)",
                  marginBottom: "8px",
                }}>
                  {photo.flag}&nbsp;&nbsp;{photo.label}
                </div>
                <div style={{
                  height: "1px",
                  width: "44px",
                  background: "linear-gradient(to right, rgba(196,150,42,0.8), transparent)",
                }} />
              </div>

              {/* Watermark */}
              <div className="absolute top-10 left-8" style={{
                fontFamily: "Georgia, serif",
                fontSize: "13px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.05em",
                opacity: 0,
                animation: "fadeIn 0.6s ease-out 0.2s forwards",
              }}>
                Global{" "}
                <span style={{
                  background: "linear-gradient(135deg, #e8b84b, #f5d47a, #c4862a)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>84</span>
              </div>

              {/* Skip */}
              <button onClick={handleSkip} style={{
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
              }}>
                Skip ›
              </button>
            </>
          );
        })()}

        {/* ── Splash phase ── */}
        {phase === "splash" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{
            background: "linear-gradient(175deg, #0a0204 0%, #1a0508 45%, #BA0C2F 100%)",
          }}>
            <div style={{
              fontFamily: "Georgia, serif", fontSize: "11px",
              letterSpacing: "0.22em", textTransform: "uppercase",
              color: "rgba(196,150,42,0.85)", marginBottom: "16px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
            }}>University of Denver</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "64px", fontWeight: 700,
              color: "#ffffff", lineHeight: 1, letterSpacing: "-1px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateX(0)" : "translateX(-30px)",
              transition: "opacity 0.9s ease-out 0.2s, transform 0.9s ease-out 0.2s",
            }}>Global</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "96px", fontWeight: 700,
              lineHeight: 1, letterSpacing: "-2px",
              background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(30px)",
              transition: "opacity 1s ease-out 0.35s, transform 1s ease-out 0.35s",
            }}>84</div>

            <div style={{
              color: "rgba(196,150,42,0.7)", fontSize: "10px", margin: "20px 0",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 0.55s",
            }}>◆</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "14px", fontStyle: "italic",
              color: "rgba(255,248,230,0.85)",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 0.7s",
            }}>Creating Global Leaders</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "13px", fontStyle: "italic",
              color: "rgba(196,150,42,0.8)", marginTop: "4px",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 1.05s",
            }}>Singapore & Vietnam</div>

            {/* Loading bar */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              height: "3px", background: "rgba(196,150,42,0.15)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                background: "linear-gradient(to right, #C4962A, #f5d47a, #C4962A)",
                opacity: splashMounted ? 1 : 0,
                transform: splashMounted ? "translateX(0%)" : "translateX(-100%)",
                transition: `opacity 0.3s ease-out 0.4s, transform ${SPLASH_HOLD_MS - 400}ms linear 0.4s`,
              }} />
            </div>
          </div>
        )}
      </div>

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
