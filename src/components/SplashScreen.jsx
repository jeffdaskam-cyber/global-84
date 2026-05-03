import { useEffect, useRef, useState } from "react";

// All available splash photos per city.
// Add or remove entries here as your photo library grows.
const SINGAPORE_PHOTOS = [
  "/splash-singapore-1.webp",
  "/splash-singapore-2.webp",
  "/splash-singapore-3.webp",
  "/splash-singapore-4.webp",
  "/splash-singapore-5.webp",
];

const HCMC_PHOTOS = [
  "/splash-hcmc-1.webp",
  "/splash-hcmc-2.webp",
  "/splash-hcmc-3.webp",
  "/splash-hcmc-4.webp",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pick once at module load time so the same pair is used for the
// entire splash sequence even if the component re-renders.
const PHOTOS = [
  { src: pickRandom(SINGAPORE_PHOTOS), label: "Singapore", flag: "SG" },
  { src: pickRandom(HCMC_PHOTOS),      label: "Ho Chi Minh City", flag: "VN" },
];

const PHOTO_HOLD_MS = 2500;
const FADE_MS = 600;
const SPLASH_HOLD_MS = 2500;

const T_FADE1 = PHOTO_HOLD_MS;
const T_SHOW1 = T_FADE1 + FADE_MS;
const T_FADE2 = T_SHOW1 + PHOTO_HOLD_MS;
const T_SPLASH = T_FADE2 + FADE_MS;
const T_MOUNT = T_SPLASH + 80;
const T_DONE = T_SPLASH + SPLASH_HOLD_MS;

export default function SplashScreen({ onComplete }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [showSplash, setShowSplash] = useState(false);
  const [splashMounted, setSplashMounted] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [zoomKey, setZoomKey] = useState(0);

  const startRef = useRef(0);
  const doneRef = useRef(false);
  const intervalRef = useRef(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    startRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      if (doneRef.current) return;
      const elapsed = Date.now() - startRef.current;

      if (elapsed >= T_FADE1 && elapsed < T_SHOW1) {
        setOpacity(0);
        return;
      }

      if (elapsed >= T_SHOW1 && elapsed < T_SHOW1 + 50) {
        setPhotoIdx(1);
        setZoomKey((value) => value + 1);
        setOpacity(1);
        return;
      }

      if (elapsed >= T_FADE2 && elapsed < T_SPLASH) {
        setOpacity(0);
        return;
      }

      if (elapsed >= T_SPLASH && elapsed < T_SPLASH + 50) {
        setShowSplash(true);
        setOpacity(1);
        return;
      }

      if (elapsed >= T_MOUNT && elapsed < T_MOUNT + 50) {
        setSplashMounted(true);
        return;
      }

      if (elapsed >= T_DONE) {
        doneRef.current = true;
        clearInterval(intervalRef.current);
        onCompleteRef.current?.();
      }
    }, 50);

    return () => clearInterval(intervalRef.current);
  }, []);

  function handleSkip() {
    if (doneRef.current) return;
    doneRef.current = true;
    clearInterval(intervalRef.current);
    onCompleteRef.current?.();
  }

  const photo = PHOTOS[photoIdx];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: "#0a0204" }}>
      <div
        className="absolute inset-0"
        style={{
          opacity,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      >
        {!showSplash && (
          <>
            <img
              key={zoomKey}
              src={photo.src}
              alt={photo.label}
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: "cover",
                objectPosition: "center",
                animation: `kenBurnsOut ${PHOTO_HOLD_MS + FADE_MS}ms ease-out forwards`,
              }}
            />

            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)" }}
            />

            <div
              className="absolute bottom-0 left-0 right-0"
              style={{ height: "220px", background: "linear-gradient(to top, rgba(10,2,4,0.9) 0%, transparent 100%)" }}
            />

            <div
              className="absolute bottom-16 px-8"
              style={{ opacity: 0, animation: "fadeInUp 0.8s ease-out 0.15s forwards" }}
            >
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "18px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "rgba(196,150,42,0.9)",
                  marginBottom: "8px",
                }}
              >
                {photo.flag} {photo.label}
              </div>
              <div
                style={{
                  height: "1px",
                  width: "110px",
                  background: "linear-gradient(to right, rgba(196,150,42,0.8), transparent)",
                }}
              />
            </div>

            <div
              className="absolute top-10 left-8"
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "32px",
                fontWeight: 700,
                color: "#ffffff",
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
              Skip
            </button>
          </>
        )}

        {showSplash && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "linear-gradient(175deg, #0a0204 0%, #1a0508 45%, #BA0C2F 100%)" }}
          >
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "12px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(196,150,42,0.85)",
                marginBottom: "16px",
                opacity: splashMounted ? 1 : 0,
                transform: splashMounted ? "translateY(0)" : "translateY(12px)",
                transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
              }}
            >
              Daniels College of Business - EMBA
            </div>

            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "64px",
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1,
                letterSpacing: "-1px",
                opacity: splashMounted ? 1 : 0,
                transform: splashMounted ? "translateX(0)" : "translateX(-26px)",
                transition: "opacity 0.9s ease-out 0.2s, transform 0.9s ease-out 0.2s",
              }}
            >
              Global
            </div>

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
                transform: splashMounted ? "translateY(0)" : "translateY(26px)",
                transition: "opacity 1s ease-out 0.35s, transform 1s ease-out 0.35s",
              }}
            >
              84
            </div>

            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "18px",
                fontStyle: "italic",
                color: "rgba(255,248,230,0.85)",
                marginTop: "24px",
                opacity: splashMounted ? 1 : 0,
                transition: "opacity 0.8s ease-out 0.7s",
              }}
            >
              Creating Global Leaders
            </div>

            <div
              style={{
                color: "rgba(196,150,42,0.7)",
                fontSize: "12px",
                margin: "10px 0 6px",
                opacity: splashMounted ? 1 : 0,
                transition: "opacity 0.8s ease-out 0.55s",
              }}
            >
              *
            </div>

            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "22px",
                fontStyle: "italic",
                color: "rgba(196,150,42,0.8)",
                opacity: splashMounted ? 1 : 0,
                transition: "opacity 0.8s ease-out 1.05s",
              }}
            >
              Singapore and Vietnam
            </div>

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
                  transition: `opacity 0.3s ease-out 0.4s, transform ${SPLASH_HOLD_MS - 400}ms linear 0.4s`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes kenBurnsOut {
          from { transform: scale(1.15); }
          to { transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
