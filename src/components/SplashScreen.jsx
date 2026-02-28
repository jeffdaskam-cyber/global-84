// src/components/SplashScreen.jsx
// Flow: Singapore video → HCMC video → splash animation → done
import { useEffect, useRef, useState } from "react";

// ── Video config ──────────────────────────────────────────────────────────────
const VIDEOS = [
  {
    src: "/singapore-intro.mp4",
    label: "Singapore",
    flag: "🇸🇬",
    duration: 4000, // fallback max duration if video is shorter
  },
  {
    src: "/hcmc-intro.mp4",
    label: "Ho Chi Minh City",
    flag: "🇻🇳",
    duration: 4000,
  },
];

// ── Phase constants ───────────────────────────────────────────────────────────
const PHASE_VIDEO_0  = "video_0";
const PHASE_VIDEO_1  = "video_1";
const PHASE_SPLASH   = "splash";
const PHASE_DONE     = "done";

const FADE_MS        = 600;  // cross-fade duration between phases
const SPLASH_HOLD_MS = 5000; // how long the splash animation plays before calling onComplete

export default function SplashScreen({ onComplete }) {
  const [phase, setPhase]       = useState(PHASE_VIDEO_0);
  const [fadeOut, setFadeOut]   = useState(false);
  const [splashMounted, setSplashMounted] = useState(false);
  const videoRef                = useRef(null);
  const timerRef                = useRef(null);
  const skippedRef              = useRef(false);

  // ── Advance to next phase with a fade transition ──────────────────────────
  function advance(nextPhase) {
    if (skippedRef.current && nextPhase !== PHASE_DONE) return;
    setFadeOut(true);
    timerRef.current = setTimeout(() => {
      setFadeOut(false);
      setPhase(nextPhase);
      if (nextPhase === PHASE_SPLASH) {
        setTimeout(() => setSplashMounted(true), 60);
        setTimeout(() => onComplete(), SPLASH_HOLD_MS);
      }
    }, FADE_MS);
  }

  // ── Skip handler — jumps straight to splash ───────────────────────────────
  function handleSkip() {
    skippedRef.current = true;
    clearTimeout(timerRef.current);
    if (videoRef.current) videoRef.current.pause();
    setFadeOut(true);
    setTimeout(() => {
      setFadeOut(false);
      setPhase(PHASE_SPLASH);
      setTimeout(() => setSplashMounted(true), 60);
      setTimeout(() => onComplete(), SPLASH_HOLD_MS);
    }, FADE_MS);
  }

  // ── Video phase logic ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== PHASE_VIDEO_0 && phase !== PHASE_VIDEO_1) return;

    const videoIndex = phase === PHASE_VIDEO_0 ? 0 : 1;
    const nextPhase  = phase === PHASE_VIDEO_0 ? PHASE_VIDEO_1 : PHASE_SPLASH;
    const maxDuration = VIDEOS[videoIndex].duration;

    const el = videoRef.current;
    if (!el) return;

    // Fallback timer in case video fails to play or ends early
    timerRef.current = setTimeout(() => advance(nextPhase), maxDuration + FADE_MS);

    function onEnded() {
      clearTimeout(timerRef.current);
      advance(nextPhase);
    }

    function onError() {
      // Silently skip this video if it fails to load
      clearTimeout(timerRef.current);
      advance(nextPhase);
    }

    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    const playPromise = el.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay blocked (e.g. iOS before first tap) — skip to next
        clearTimeout(timerRef.current);
        advance(nextPhase);
      });
    }

    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      clearTimeout(timerRef.current);
    };
  }, [phase]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (phase === PHASE_DONE) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        background: "#0a0204",
        opacity: fadeOut ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      }}
    >
      {/* ── Video phases ── */}
      {(phase === PHASE_VIDEO_0 || phase === PHASE_VIDEO_1) && (() => {
        const idx = phase === PHASE_VIDEO_0 ? 0 : 1;
        const video = VIDEOS[idx];
        return (
          <>
            {/* Video */}
            <video
              key={video.src}
              ref={videoRef}
              src={video.src}
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Dark vignette overlay */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
              }}
            />

            {/* Bottom gradient for text legibility */}
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: "200px",
                background:
                  "linear-gradient(to top, rgba(10,2,4,0.85) 0%, transparent 100%)",
              }}
            />

            {/* City label — bottom left */}
            <div className="absolute bottom-16 left-0 right-0 px-8">
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "11px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "rgba(196,150,42,0.9)",
                  marginBottom: "6px",
                }}
              >
                {video.flag} {video.label}
              </div>
              <div
                style={{
                  height: "1px",
                  width: "40px",
                  background:
                    "linear-gradient(to right, rgba(196,150,42,0.7), transparent)",
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
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.05em",
              }}
            >
              Global{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #e8b84b, #f5d47a, #c4862a)",
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
              className="absolute top-10 right-6 transition-opacity hover:opacity-100"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "20px",
                padding: "5px 14px",
                color: "rgba(255,255,255,0.7)",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.05em",
                backdropFilter: "blur(4px)",
              }}
            >
              Skip ›
            </button>
          </>
        );
      })()}

      {/* ── Splash animation phase ── */}
      {phase === PHASE_SPLASH && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background:
              "linear-gradient(175deg, #0a0204 0%, #1a0508 45%, #BA0C2F 100%)",
          }}
        >
          {/* Daniels College of Business */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(196,150,42,0.85)",
              opacity: splashMounted ? 1 : 0,
              transform: splashMounted ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
              transitionDelay: "0ms",
              marginBottom: "16px",
            }}
          >
            Daniels College of Business - EMBA
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
              background:
                "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
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

          {/* Diamond divider */}
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
                background:
                  "linear-gradient(to right, #C4962A, #f5d47a, #C4962A)",
                opacity: splashMounted ? 1 : 0,
                transform: splashMounted ? "translateX(0%)" : "translateX(-100%)",
                transition: `opacity 0.3s ease-out, transform ${SPLASH_HOLD_MS - 400}ms linear`,
                transitionDelay: "400ms",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
