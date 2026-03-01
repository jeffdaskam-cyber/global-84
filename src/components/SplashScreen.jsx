// src/components/SplashScreen.jsx
// Flow: Singapore photo (Ken Burns) → HCMC photo → splash animation → done
import { useEffect, useRef, useState } from "react";

const PHOTOS = [
  { src: "/splash-singapore.jpg", label: "Singapore",        flag: "🇸🇬" },
  { src: "/splash-HCMC.jpg",      label: "Ho Chi Minh City", flag: "🇻🇳" },
];

const PHOTO_HOLD_MS  = 3000;
const FADE_MS        = 700;
const SPLASH_HOLD_MS = 5000;

// Phases: 0 = singapore, 1 = hcmc, 2 = splash, 3 = done
export default function SplashScreen({ onComplete }) {
  const [phaseIdx, setPhaseIdx]             = useState(0);
  const [contentVisible, setContentVisible] = useState(true);
  const [splashMounted, setSplashMounted]   = useState(false);
  const [zoomKey, setZoomKey]               = useState(0);

  // Use a ref so setTimeout callbacks always read the current phase
  const phaseRef   = useRef(0);
  const timerRef   = useRef(null);
  const skippedRef = useRef(false);

  // ── Go to a specific phase index ─────────────────────────────────────────
  function goToPhase(next) {
    clearTimeout(timerRef.current);
    // 1. Fade content out
    setContentVisible(false);
    timerRef.current = setTimeout(() => {
      if (next >= 3) {
        // All phases done
        onComplete();
        return;
      }
      // 2. Update both state and ref
      phaseRef.current = next;
      setPhaseIdx(next);
      setZoomKey((k) => k + 1);
      if (next === 2) setSplashMounted(false);

      // 3. Tiny pause for DOM to swap, then fade back in
      timerRef.current = setTimeout(() => {
        setContentVisible(true);
        if (next === 2) {
          // Splash phase: trigger staggered animations, then finish
          setTimeout(() => setSplashMounted(true), 60);
          setTimeout(() => onComplete(), SPLASH_HOLD_MS);
        }
      }, 60);
    }, FADE_MS);
  }

  // ── Skip straight to splash ───────────────────────────────────────────────
  function handleSkip() {
    if (skippedRef.current) return;
    skippedRef.current = true;
    goToPhase(2);
  }

  // ── Auto-advance photo phases ─────────────────────────────────────────────
  useEffect(() => {
    // Only auto-advance for photo phases (0 and 1)
    if (phaseIdx >= 2) return;
    timerRef.current = setTimeout(() => {
      goToPhase(phaseRef.current + 1);
    }, PHOTO_HOLD_MS);
    return () => clearTimeout(timerRef.current);
  }, [phaseIdx]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "#0a0204" }}
    >
      {/* Inner content — fades in/out between phases */}
      <div
        className="absolute inset-0"
        style={{
          opacity: contentVisible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      >
        {/* ── Photo phases 0 & 1 ── */}
        {phaseIdx < 2 && (() => {
          const photo = PHOTOS[phaseIdx];
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
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)",
                }}
              />

              {/* Bottom gradient */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: "220px",
                  background:
                    "linear-gradient(to top, rgba(10,2,4,0.9) 0%, transparent 100%)",
                }}
              />

              {/* City label */}
              <div
                className="absolute bottom-16 px-8"
                style={{ opacity: 0, animation: "fadeInUp 0.8s ease-out 0.1s forwards" }}
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
                  {photo.flag}&nbsp;&nbsp;{photo.label}
                </div>
                <div
                  style={{
                    height: "1px",
                    width: "44px",
                    background: "linear-gradient(to right, rgba(196,150,42,0.8), transparent)",
                  }}
                />
              </div>

              {/* Watermark */}
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
                <span style={{
                  background: "linear-gradient(135deg, #e8b84b, #f5d47a, #c4862a)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  84
                </span>
              </div>

              {/* Skip button */}
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

        {/* ── Splash phase 2 ── */}
        {phaseIdx === 2 && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{
              background:
                "linear-gradient(175deg, #0a0204 0%, #1a0508 45%, #BA0C2F 100%)",
            }}
          >
            <div style={{
              fontFamily: "Georgia, serif",
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(196,150,42,0.85)",
              marginBottom: "16px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
            }}>
              University of Denver
            </div>

            <div style={{
              fontFamily: "Georgia, serif",
              fontSize: "64px",
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1,
              letterSpacing: "-1px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateX(0)" : "translateX(-30px)",
              transition: "opacity 0.9s ease-out 0.2s, transform 0.9s ease-out 0.2s",
            }}>
              Global
            </div>

            <div style={{
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
              transition: "opacity 1s ease-out 0.35s, transform 1s ease-out 0.35s",
            }}>
              84
            </div>

            <div style={{
              color: "rgba(196,150,42,0.7)",
              fontSize: "10px",
              margin: "20px 0",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 0.55s",
            }}>
              ◆
            </div>

            <div style={{
              fontFamily: "Georgia, serif",
              fontSize: "14px",
              fontStyle: "italic",
              color: "rgba(255,248,230,0.85)",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 0.7s",
            }}>
              Creating Global Leaders
            </div>

            <div style={{
              fontFamily: "Georgia, serif",
              fontSize: "13px",
              fontStyle: "italic",
              color: "rgba(196,150,42,0.8)",
              marginTop: "4px",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 1.05s",
            }}>
              Singapore & Vietnam
            </div>

            {/* Loading bar */}
            <div style={{
              position: "absolute",
              bottom: 0, left: 0, right: 0,
              height: "3px",
              background: "rgba(196,150,42,0.15)",
              overflow: "hidden",
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
