import { useEffect, useState } from "react";

export default function SplashScreen({ onComplete }) {
  const [phase, setPhase] = useState("enter");

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase("exit"), 4300);
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
      {/* Grain texture */}
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
        animation: "slideDown 1s ease-out 0.1s both",
      }} />

      {/* Main content */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "0 32px",
      }}>

        {/* University of Denver */}
        <div style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: "15px",
          fontWeight: "400",
          letterSpacing: "0.45em",
          textTransform: "uppercase",
          color: "rgba(168,153,104,0.75)",
          animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s both",
        }}>
          University of Denver
        </div>

        {/* GLOBAL — large hero word */}
        <div style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: "clamp(72px, 18vw, 96px)",
          fontWeight: "700",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#FFFFFF",
          lineHeight: 1,
          marginTop: "16px",
          animation: "heroReveal 1s cubic-bezier(0.16,1,0.3,1) 0.35s both",
        }}>
          Global
        </div>

        {/* 84 — gold gradient, massive */}
        <div style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: "clamp(100px, 26vw, 140px)",
          fontWeight: "700",
          letterSpacing: "-0.02em",
          lineHeight: 0.85,
          background: "linear-gradient(135deg, #C8A84B 0%, #A89968 40%, #D4C08A 70%, #A89968 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: "heroReveal 1s cubic-bezier(0.16,1,0.3,1) 0.5s both",
        }}>
          84
        </div>

        {/* Gold divider */}
        <div style={{
          marginTop: "28px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          animation: "fadeIn 0.8s ease 0.9s both",
        }}>
          <div style={{ width: "50px", height: "1px", background: "linear-gradient(to right, transparent, rgba(168,153,104,0.7))" }} />
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#A89968" }} />
          <div style={{ width: "50px", height: "1px", background: "linear-gradient(to left, transparent, rgba(168,153,104,0.7))" }} />
        </div>

        {/* Tagline line 1 */}
        <div style={{
          marginTop: "20px",
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: "18px",
          fontWeight: "400",
          fontStyle: "italic",
          letterSpacing: "0.08em",
          color: "rgba(213,210,197,0.85)",
          animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 1.1s both",
        }}>
          Creating Global Leaders
        </div>

        {/* Tagline line 2 */}
        <div style={{
          marginTop: "6px",
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: "18px",
          fontWeight: "400",
          fontStyle: "italic",
          letterSpacing: "0.08em",
          color: "rgba(168,153,104,0.85)",
          animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 1.45s both",
        }}>
          Singapore &amp; Vietnam
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
        animation: "fadeIn 0.5s ease 1.6s both",
      }}>
        <div style={{
          height: "100%",
          background: "linear-gradient(90deg, #A89968, #D4C08A)",
          borderRadius: "2px",
          animation: "loadBar 3s cubic-bezier(0.4,0,0.2,1) 1.6s both",
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
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes heroReveal {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideDown {
          from { transform: translateX(-50%) scaleY(0); transform-origin: top; }
          to   { transform: translateX(-50%) scaleY(1); }
        }
        @keyframes loadBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
