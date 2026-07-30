import { useCallback, useEffect, useRef, useState } from "react";
import ArcadeGame from "./ArcadeGame.jsx";
import ArcadeNextPreview from "./ArcadeNextPreview.jsx";
import { getHighScore, setHighScore } from "../../lib/arcadeScore";

// Full-screen arcade cabinet for the hidden game. Purely client-side — no
// Firestore, network, or app context — so it works fully offline.
// The content component unmounts entirely when closed, so every open starts
// a fresh game with freshly-read high score and no leaked state.
export default function ArcadeModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return <ArcadeModalContent onClose={onClose} />;
}

// Recessed LED-style readout used for Score and Best.
const HUD_TILE = {
  background: "linear-gradient(160deg,#221d20,#0f0c0e)",
  borderColor: "rgba(196,150,42,0.25)",
  boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)",
};

const HUD_LABEL =
  "mb-1 text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-[#928E91]";

// Shared geometry for the four D-pad keys.
const PAD_BASE =
  "h-14 w-14 select-none touch-none text-xl leading-none " +
  "transition active:translate-y-[2px] active:scale-95";

const PAD_DARK = {
  background: "linear-gradient(160deg,#3a3a40,#18181b)",
  borderColor: "rgba(255,255,255,.08)",
  boxShadow: "0 4px 8px rgba(0,0,0,.5), inset 0 1px 1px rgba(255,255,255,.15)",
};

const PAD_GOLD = {
  background:
    "radial-gradient(circle at 35% 30%,#e2b955,#C4962A 55%,#8a6a1c 100%)",
  borderColor: "rgba(196,150,42,0.45)",
  boxShadow:
    "0 4px 10px rgba(0,0,0,.45), inset 0 2px 2px rgba(255,255,255,.5), inset 0 -3px 4px rgba(0,0,0,.25)",
};

function ArcadeModalContent({ onClose }) {
  const gameRef = useRef(null);
  const modalRef = useRef(null);
  const [score, setScore] = useState(0);
  const [nextShape, setNextShape] = useState(null);
  const [highScore, setHigh] = useState(() => getHighScore());

  // Disable body scroll and move focus into the modal while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  // Keep Tab cycling inside the modal.
  function trapFocus(e) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = modalRef.current?.querySelectorAll("button");
    if (!focusables?.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // The dialog container itself holds focus on open, so treat it as the
    // reverse-tab boundary too — otherwise Shift+Tab escapes to the page.
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === modalRef.current)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Memoized: ArcadeGame restarts its gravity timer whenever a callback prop
  // changes identity, and this component re-renders on every score tick.
  const handleGameOver = useCallback((finalScore) => {
    setHigh(setHighScore(finalScore));
  }, []);

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={trapFocus}
      role="dialog"
      aria-modal="true"
      aria-label="Arcade game"
      className="fixed inset-0 z-50 flex flex-col items-center overflow-auto px-4 pb-7 pt-[22px] outline-none"
      style={{
        background:
          "linear-gradient(160deg,#0d0103 0%,#1c0408 42%,#2a0710 72%,#170307 100%)",
      }}
    >
      {/* Decorative gold rings, echoing the app's page hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[50px] -top-[70px] h-60 w-60 rounded-full border-2"
        style={{ borderColor: "rgba(196,150,42,0.14)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[10px] -top-[30px] h-[150px] w-[150px] rounded-full border-2"
        style={{ borderColor: "rgba(196,150,42,0.18)" }}
      />

      {/* Header: wordmark + close */}
      <div className="mb-[14px] flex w-full max-w-[420px] items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase leading-none tracking-[0.2em] text-du-goldBright">
            Global 84
          </div>
          <div className="mt-0.5 font-serif text-[15px] italic leading-snug text-white">
            Arcade
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="min-h-[44px] min-w-[44px] rounded-full border text-[22px] leading-none text-white transition hover:text-du-goldBright active:scale-95"
          style={{
            background: "radial-gradient(circle at 35% 30%,#2c2c30,#141416)",
            borderColor: "rgba(196,150,42,0.35)",
            boxShadow:
              "0 2px 6px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)",
          }}
        >
          ×
        </button>
      </div>

      {/* HUD: score, best, next piece */}
      <div className="mb-[14px] flex w-full max-w-[420px] gap-[10px]">
        <div className="flex-1 rounded-lg border px-[14px] py-[10px]" style={HUD_TILE}>
          <div className={HUD_LABEL}>Score</div>
          <div
            className="font-mono text-xl font-bold leading-none tabular-nums text-white"
            style={{ textShadow: "0 0 10px rgba(196,150,42,0.35)" }}
          >
            {score}
          </div>
        </div>
        <div className="flex-1 rounded-lg border px-[14px] py-[10px]" style={HUD_TILE}>
          <div className={HUD_LABEL}>Best</div>
          <div className="font-mono text-xl font-bold leading-none tabular-nums text-du-goldBright">
            {highScore}
          </div>
        </div>
        <div
          className="flex flex-col items-center rounded-lg border px-3 py-[10px]"
          style={HUD_TILE}
        >
          <div className={HUD_LABEL}>Next</div>
          <ArcadeNextPreview shape={nextShape} />
        </div>
      </div>

      {/* Cabinet + playfield */}
      <ArcadeGame
        ref={gameRef}
        onScoreChange={setScore}
        onNextChange={setNextShape}
        onGameOver={handleGameOver}
      />

      {/* Control deck */}
      <div
        className="mt-4 flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[20px] border p-4"
        style={{
          background: "linear-gradient(160deg,#221d20,#0e0b0d)",
          borderColor: "rgba(196,150,42,0.18)",
          boxShadow:
            "0 10px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.05)",
        }}
      >
        <div className="grid grid-cols-[56px_56px_56px] grid-rows-[56px_56px] place-items-center gap-[10px]">
          <ControlButton
            gameRef={gameRef}
            method="rotate"
            label="Rotate"
            className={`${PAD_BASE} col-start-2 row-start-1 rounded-full border text-[22px] text-[#2b1c00]`}
            style={PAD_GOLD}
          >
            ↻
          </ControlButton>
          <ControlButton
            gameRef={gameRef}
            method="moveLeft"
            label="Move left"
            className={`${PAD_BASE} col-start-1 row-start-2 rounded-xl border text-white`}
            style={PAD_DARK}
          >
            ◀
          </ControlButton>
          <ControlButton
            gameRef={gameRef}
            method="softDrop"
            label="Soft drop"
            className={`${PAD_BASE} col-start-2 row-start-2 rounded-xl border text-white`}
            style={PAD_DARK}
          >
            ▼
          </ControlButton>
          <ControlButton
            gameRef={gameRef}
            method="moveRight"
            label="Move right"
            className={`${PAD_BASE} col-start-3 row-start-2 rounded-xl border text-white`}
            style={PAD_DARK}
          >
            ▶
          </ControlButton>
        </div>

        <ControlButton
          gameRef={gameRef}
          method="hardDrop"
          label="Hard drop"
          className="w-full select-none touch-none rounded-[14px] border py-[14px] text-xl font-bold leading-none text-white transition active:translate-y-[2px] active:scale-[0.98]"
          style={{
            background: "linear-gradient(160deg,#d3143a,#8E0A24)",
            borderColor: "rgba(255,255,255,.1)",
            boxShadow:
              "0 6px 14px rgba(186,12,47,.35), inset 0 1px 0 rgba(255,255,255,.25)",
          }}
        >
          ⤓
        </ControlButton>
      </div>
    </div>
  );
}

// Touch controls fire on pointerdown for arcade responsiveness, and
// preventDefault so a tap doesn't also scroll/zoom or synthesize a click.
function ControlButton({ gameRef, method, label, className, style, children }) {
  return (
    <button
      aria-label={label}
      className={className}
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        gameRef.current?.[method]?.();
      }}
      onKeyDown={(e) => {
        // Keyboard activation (Enter/Space) for non-pointer users.
        // preventDefault stops the native click (avoiding a double fire) and
        // stopPropagation keeps Space from reaching the game's window
        // listener, which would hard-drop instead.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          gameRef.current?.[method]?.();
        }
      }}
    >
      {children}
    </button>
  );
}
