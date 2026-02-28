import { useEffect, useState } from "react";

export default function SplashScreen({ onComplete }) {
  const [phase, setPhase] = useState("enter"); // enter → hold → exit

  useEffect(() => {
    // Hold for 4.3s then begin exit
    const holdTimer = setTimeout(() => setPhase("exit"), 4300);
    // After exit animation (0.7s), call onComplete
    const doneTimer = setTimeout(() => onComplete?.(), 5000);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(160deg, #0a0204 0%, #1a0308 40%, #2a0510 70%, #BA0C2F 200%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        opacity: phase === "exit" ? 0 : 1,
        transition: phase === "exit" ? "opacity 0.7s cubic-bezier(0.4,0,0.2,1)" : "none",
      }}
    >
      {/* Atmospheric radial glow behind logo */}
      <div style={{
        position: "absolute",
        width: "420px",
        height: "420px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(186,12,47,0.35) 0%, transparent 70%)",
        animation: "pulse 3s ease-in-out infinite",
      }} />

      {/* Subtle grain texture overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        opacity: 0.4,
        pointerEvents: "none",
      }} />

      {/* Top decorative line */}
      <div style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "1px",
        height: "80px",
        background: "linear-gradient(to bottom, transparent, rgba(168,153,104,0.6))",
        animation: "slideDown 1s ease-out 0.2s both",
      }} />

      {/* Content container */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0px",
        animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.1s both",
      }}>

        {/* Logo — floating directly on background, no card or border */}
        <div style={{
          width: "160px",
          height: "160px",
          flexShrink: 0,
          filter: "drop-shadow(0 20px 50px rgba(0,0,0,0.7)) drop-shadow(0 0 40px rgba(186,12,47,0.3))",
          animation: "logoReveal 1s cubic-bezier(0.16,1,0.3,1) 0.3s both",
        }}>
          <img
            src="/icons/icon-512.png"
            alt="Global 84"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "28px" }}
          />
        </div>

        {/* App name */}
        <div style={{
          marginTop: "28px",
          animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.55s both",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: "13px",
            fontWeight: "400",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "rgba(168,153,104,0.8)",
            marginBottom: "10px",
          }}>
            University of Denver
          </div>
          <div style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: "42px",
            fontWeight: "700",
            letterSpacing: "-0.01em",
            color: "#FFFFFF",
            lineHeight: 1,
          }}>
            Global <span style={{ color: "#A89968" }}>84</span>
          </div>
        </div>

        {/* Gold divider */}
        <div style={{
          marginTop: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          animation: "fadeIn 0.8s ease 0.8s both",
        }}>
          <div style={{ width: "40px", height: "1px", background: "rgba(168,153,104,0.5)" }} />
          <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#A89968" }} />
          <div style={{ width: "40px", height: "1px", background: "rgba(168,153,104,0.5)" }} />
        </div>

        {/* Tagline */}
        <div style={{
          marginTop: "20px",
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: "14px",
          fontStyle: "italic",
          color: "rgba(213,210,197,0.7)",
          letterSpacing: "0.04em",
          textAlign: "center",
          maxWidth: "220px",
          lineHeight: 1.6,
          animation: "fadeIn 1s ease 1s both",
        }}>
          Where Pioneers connect across the globe
        </div>

      </div>

      {/* Bottom loading bar */}
      <div style={{
        position: "absolute",
        bottom: "52px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "80px",
        height: "2px",
        borderRadius: "2px",
        background: "rgba(168,153,104,0.2)",
        overflow: "hidden",
        animation: "fadeIn 0.5s ease 1.2s both",
      }}>
        <div style={{
          height: "100%",
          background: "linear-gradient(90deg, #A89968, #D4C08A)",
          borderRadius: "2px",
          animation: "loadBar 3.5s cubic-bezier(0.4,0,0.2,1) 1.2s both",
        }} />
      </div>

      {/* Bottom decorative line */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "1px",
        height: "40px",
        background: "linear-gradient(to top, transparent, rgba(168,153,104,0.4))",
      }} />

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes logoReveal {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slideDown {
          from { transform: translateX(-50%) scaleY(0); transform-origin: top; }
          to   { transform: translateX(-50%) scaleY(1); }
        }
        @keyframes loadBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%       { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
