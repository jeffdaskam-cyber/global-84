import { useEffect, useRef, useState } from "react";
import ArcadeGame from "./ArcadeGame.jsx";
import { getHighScore, setHighScore } from "../../lib/arcadeScore";

// Full-screen shell for the hidden arcade game. Purely client-side — no
// Firestore, network, or app context — so it works fully offline.
// The content component unmounts entirely when closed, so every open starts
// a fresh game with freshly-read high score and no leaked state.
export default function ArcadeModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return <ArcadeModalContent onClose={onClose} />;
}

function ArcadeModalContent({ onClose }) {
  const gameRef = useRef(null);
  const modalRef = useRef(null);
  const [score, setScore] = useState(0);
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

  function handleGameOver(finalScore) {
    setHigh(setHighScore(finalScore));
  }

  // Touch buttons: fire on pointerdown for arcade responsiveness, and
  // preventDefault so a tap doesn't also scroll/zoom or synthesize a click.
  const controlBtn =
    "min-w-[52px] min-h-[52px] rounded-lg bg-du-crimson text-white text-xl " +
    "font-semibold flex items-center justify-center select-none " +
    "hover:bg-du-crimsonDark active:bg-du-crimsonDark transition touch-none";

  const controls = [
    { label: "◀", title: "Move left", method: "moveLeft" },
    { label: "↻", title: "Rotate", method: "rotate" },
    { label: "▶", title: "Move right", method: "moveRight" },
    { label: "▼", title: "Soft drop", method: "softDrop" },
    { label: "⤓", title: "Hard drop", method: "hardDrop" },
  ];

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={trapFocus}
      role="dialog"
      aria-modal="true"
      aria-label="Arcade game"
      className="fixed inset-0 z-50 flex flex-col items-center bg-black/90 p-4 outline-none"
    >
      {/* Header: scores + close */}
      <div className="flex w-full max-w-md items-center justify-between">
        <div className="text-sm font-semibold text-white">
          Score: {score}
          <span className="ml-3 text-du-goldDeep">Best: {highScore}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="min-w-[44px] min-h-[44px] rounded-lg text-2xl font-semibold text-white hover:text-du-goldDeep transition"
        >
          ×
        </button>
      </div>

      {/* Game canvas */}
      <div className="mt-2 flex flex-1 items-center justify-center overflow-hidden">
        <ArcadeGame
          ref={gameRef}
          onScoreChange={setScore}
          onGameOver={handleGameOver}
        />
      </div>

      {/* On-screen touch controls */}
      <div className="mt-3 mb-2 flex items-center justify-center gap-3">
        {controls.map((c) => (
          <button
            key={c.title}
            aria-label={c.title}
            className={controlBtn}
            onPointerDown={(e) => {
              e.preventDefault();
              gameRef.current?.[c.method]?.();
            }}
            onKeyDown={(e) => {
              // Keyboard activation (Enter/Space) for non-pointer users.
              // preventDefault stops the native click (avoiding a double
              // fire) and stopPropagation keeps Space from reaching the
              // game's window listener, which would hard-drop instead.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                gameRef.current?.[c.method]?.();
              }
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
