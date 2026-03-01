// src/components/SplashScreen.jsx
// Uses a single setInterval tick to drive all phase transitions.
// No useEffect dependencies on functions — eliminates all stale closure bugs.
import { useEffect, useRef, useState } from "react";

const PHOTOS = [
  { src: "/splash-singapore.jpg", label: "Singapore",        flag: "🇸🇬" },
  { src: "/splash-hcmc.jpg",      label: "Ho Chi Minh City", flag: "🇻🇳" },
];

const PHOTO_HOLD_MS  = 3000;
const FADE_MS        = 600;
const SPLASH_HOLD_MS = 5000;

// Timeline (ms from start):
const T_FADE1  = PHOTO_HOLD_MS;                          // start fade out of photo0
const T_SHOW1  = T_FADE1 + FADE_MS;                     // show photo1
const T_FADE2  = T_SHOW1 + PHOTO_HOLD_MS;               // start fade out of photo1
const T_SPLASH = T_FADE2 + FADE_MS;                     // show splash screen
const T_MOUNT  = T_SPLASH + 80;                         // trigger splash animations
const T_DONE   = T_SPLASH + SPLASH_HOLD_MS;             // call onComplete

export default function SplashScreen({ onComplete }) {
  const [photoIdx, setPhotoIdx]           = useState(0);       // 0 or 1
  const [showSplash, setShowSplash]       = useState(false);
  const [splashMounted, setSplashMounted] = useState(false);
  const [opacity, setOpacity]             = useState(1);
  const [zoomKey, setZoomKey]             = useState(0);

  const startRef    = useRef(Date.now());
  const doneRef     = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (doneRef.current) return;
      const elapsed = Date.now() - startRef.current;

      // Photo 0 fade out
      if (elapsed >= T_FADE1 && elapsed < T_SHOW1) {
        setOpacity(0);
      }
      // Switch to photo 1
      else if (elapsed >= T_SHOW1 && elapsed < T_SHOW1 + 50) {
        setPhotoIdx(1);
        setZoomKey(k => k + 1);
        setOpacity(1);
      }
      // Photo 1 fade out
      else if (elapsed >= T_FADE2 && elapsed < T_SPLASH) {
        setOpacity(0);
      }
      // Show splash
      else if (elapsed >= T_SPLASH && elapsed < T_SPLASH + 50) {
        setShowSplash(true);
        setOpacity(1);
      }
      // Mount splash animations
      else if (elapsed >= T_MOUNT && elapsed < T_MOUNT + 50) {
        setSplashMounted(true);
      }
      // Done
      else if (elapsed >= T_DONE && !doneRef.current) {
        doneRef.current = true;
        clearInterval(intervalRef.current);
        onComplete();
      }
    }, 50); // tick every 50ms — fine enough for smooth transitions

    return () => clearInterval(intervalRef.current);
  }, []); // empty deps — runs once, never stale

  function handleSkip() {
    if (doneRef.current) return;
    clearInterval(intervalRef.current);
    setOpacity(0);
    setTimeout(() => {
      setShowSplash(true);
      setOpacity(1);
      setTimeout(() => setSplashMounted(true), 80);
      setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onComplete();
        }
      }, SPLASH_HOLD_MS);
    }, FADE_MS);
  }

  const photo = PHOTOS[photoIdx];

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "#0a0204" }}
    >
      {/* Inner layer — opacity controlled by ticker */}
      <div
        className="absolute inset-0"
        style={{
          opacity,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      >
        {/* ── Photo phases ── */}
        {!showSplash && (
          <>
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

            <div className="absolute inset-0" style={{
              background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)",
            }} />

            <div className="absolute bottom-0 left-0 right-0" style={{
              height: "220px",
              background: "linear-gradient(to top, rgba(10,2,4,0.9) 0%, transparent 100%)",
            }} />

            <div className="absolute bottom-16 px-8" style={{
              opacity: 0,
              animation: "fadeInUp 0.8s ease-out 0.15s forwards",
            }}>
              <div style={{
                fontFamily: "Georgia, serif",
                fontSize: "16px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(196,150,42,0.9)",
                marginBottom: "8px",
              }}>
                {photo.flag}&nbsp;&nbsp;{photo.label}
              </div>
              <div style={{
                height: "1px", width: "44px",
                background: "linear-gradient(to right, rgba(196,150,42,0.8), transparent)",
              }} />
            </div>

            <div className="absolute top-10 left-8" style={{
              fontFamily: "Georgia, serif",
              fontSize: "24px", fontWeight: 700,
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

            <button onClick={handleSkip} style={{
              position: "absolute", top: "40px", right: "24px",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "20px", padding: "5px 14px",
              color: "rgba(255,255,255,0.7)",
              fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em",
              backdropFilter: "blur(6px)", cursor: "pointer",
              opacity: 0, animation: "fadeIn 0.6s ease-out 0.4s forwards",
            }}>
              Skip ›
            </button>
          </>
        )}

        {/* ── Splash phase ── */}
        {showSplash && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{
            background: "linear-gradient(175deg, #0a0204 0%, #1a0508 45%, #BA0C2F 100%)",
          }}>
            <div style={{
              fontFamily: "Georgia, serif", fontSize: "12px",
              letterSpacing: "0.22em", textTransform: "uppercase",
              color: "rgba(196,150,42,0.85)", marginBottom: "16px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
            }}>Daniels College of Business - EMBA</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "64px", fontWeight: 700,
              color: "#ffffff", lineHeight: 1, letterSpacing: "-1px",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateX(0)" : "translateX(-26px)",
              transition: "opacity 0.9s ease-out 0.2s, transform 0.9s ease-out 0.2s",
            }}>Global</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "96px", fontWeight: 700,
              lineHeight: 1, letterSpacing: "-2px",
              background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(26px)",
              transition: "opacity 1s ease-out 0.35s, transform 1s ease-out 0.35s",
            }}>84</div>

            <div style={{
              color: "rgba(196,150,42,0.7)", fontSize: "10px", margin: "20px 0",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 0.55s",
            }}>◆</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "18px", fontStyle: "italic",
              color: "rgba(255,248,230,0.85)",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 0.7s",
            }}>Creating Global Leaders</div>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: "20px", fontStyle: "italic",
              color: "rgba(196,150,42,0.8)", marginTop: "8px",
              opacity: splashMounted ? 1 : 0,
              transition: "opacity 0.8s ease-out 1.05s",
            }}>Singapore & Vietnam</div>

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
