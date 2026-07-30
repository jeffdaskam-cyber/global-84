import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  drawFlashCell,
  drawGlossyCell,
  fillBoardBackground,
} from "../../lib/arcadeRender";

// ─────────────────────────────────────────────────────────────────────────────
// Original falling-blocks puzzle — 100% client-side, drawn on canvas.
// Game logic (grid, collision, line clears) lives in refs so the tick loop
// never sees stale closures; React state only mirrors what the UI displays.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;
const CELL = 30; // internal canvas pixels per cell; CSS scales responsively

// The seven classic 4-block geometric piece shapes, as boolean matrices.
// Colors: app crimson/gold/cream plus complementary tones for variety.
const PIECES = [
  { cells: [[1, 1, 1, 1]], color: "#BA0C2F" }, // bar
  { cells: [[1, 1], [1, 1]], color: "#A89968" }, // square
  { cells: [[0, 1, 0], [1, 1, 1]], color: "#C6B98A" }, // tee
  { cells: [[0, 1, 1], [1, 1, 0]], color: "#2F6B4F" }, // skew right
  { cells: [[1, 1, 0], [0, 1, 1]], color: "#8E0A24" }, // skew left
  { cells: [[1, 0, 0], [1, 1, 1]], color: "#3D5A80" }, // ell left
  { cells: [[0, 0, 1], [1, 1, 1]], color: "#B0672E" }, // ell right
];

// Points awarded for clearing 1/2/3/4 rows at once.
const LINE_POINTS = [0, 100, 300, 500, 800];

// Full rows blink this many times before they drop away.
const FLASH_BLINKS = 4;
const FLASH_INTERVAL = 90;

const emptyGrid = () =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

// Rotate a matrix 90° clockwise.
function rotateMatrix(m) {
  return m[0].map((_, c) => m.map((row) => row[c]).reverse());
}

const randomShape = () => PIECES[Math.floor(Math.random() * PIECES.length)];

// Place a shape at the top of the board, horizontally centered.
function shapeToPiece(shape) {
  return {
    cells: shape.cells,
    color: shape.color,
    row: 0,
    col: Math.floor((COLS - shape.cells[0].length) / 2),
  };
}

// True if the piece would overlap a wall, the floor, or a locked block.
function collides(grid, piece, row, col, cells) {
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c]) continue;
      const gr = row + r;
      const gc = col + c;
      if (gc < 0 || gc >= COLS || gr >= ROWS) return true;
      if (gr >= 0 && grid[gr][gc]) return true;
    }
  }
  return false;
}

// `onScoreChange` and `onNextChange` are called on every move, so callers must
// pass stable functions (a useState setter, or a memoized callback).
const ArcadeGame = forwardRef(function ArcadeGame(
  { onScoreChange, onNextChange, onGameOver },
  ref
) {
  const canvasRef = useRef(null);

  // Mutable game state, read/written by the tick loop and controls.
  const gridRef = useRef(emptyGrid());
  const pieceRef = useRef(shapeToPiece(randomShape()));
  const nextShapeRef = useRef(randomShape());
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const overRef = useRef(false);

  // Line-clear animation: which rows are blinking, and whether they are
  // currently lit. Gravity is suspended for the duration.
  const flashRowsRef = useRef([]);
  const flashLitRef = useRef(false);
  const flashTimerRef = useRef(null);

  // Display-only mirrors.
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [flashing, setFlashing] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = COLS * CELL;
    const H = ROWS * CELL;

    fillBoardBackground(ctx, W, H);

    // Faint gold grid lines.
    ctx.strokeStyle = "rgba(196,150,42,0.08)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, H);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(W, r * CELL);
      ctx.stroke();
    }

    // Locked blocks — rows mid-clear render lit instead of glossy.
    const grid = gridRef.current;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        if (flashLitRef.current && flashRowsRef.current.includes(r)) {
          drawFlashCell(ctx, c * CELL, r * CELL, CELL);
        } else {
          drawGlossyCell(ctx, c * CELL, r * CELL, CELL, grid[r][c]);
        }
      }
    }

    // Falling piece (absent while a line clear plays out).
    const p = pieceRef.current;
    if (p && !overRef.current) {
      p.cells.forEach((row, r) =>
        row.forEach((on, c) => {
          if (on && p.row + r >= 0) {
            drawGlossyCell(
              ctx,
              (p.col + c) * CELL,
              (p.row + r) * CELL,
              CELL,
              p.color
            );
          }
        })
      );
    }
  }, []);

  const addScore = useCallback(
    (points) => {
      scoreRef.current += points;
      setScore(scoreRef.current);
      onScoreChange?.(scoreRef.current);
    },
    [onScoreChange]
  );

  // Promote the queued shape to the falling piece and queue a fresh one.
  // Ends the game if the new piece can't fit at the top.
  const spawnNext = useCallback(() => {
    const piece = shapeToPiece(nextShapeRef.current);
    pieceRef.current = piece;
    nextShapeRef.current = randomShape();
    onNextChange?.(nextShapeRef.current);

    if (collides(gridRef.current, piece, piece.row, piece.col, piece.cells)) {
      overRef.current = true;
      setGameOver(true);
      onGameOver?.(scoreRef.current);
    }
    draw();
  }, [draw, onNextChange, onGameOver]);

  // Drop everything above the cleared rows, then score and resume gravity.
  const finishClear = useCallback(
    (fullRows) => {
      const kept = gridRef.current.filter((_, i) => !fullRows.includes(i));
      while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
      gridRef.current = kept;
      flashRowsRef.current = [];
      flashLitRef.current = false;

      linesRef.current += fullRows.length;
      setLines(linesRef.current);
      addScore(LINE_POINTS[fullRows.length]);
      setFlashing(false);
      spawnNext();
    },
    [addScore, spawnNext]
  );

  // Lock the falling piece into the grid. Full rows blink first; otherwise the
  // next piece spawns immediately.
  const lockPiece = useCallback(() => {
    const grid = gridRef.current;
    const p = pieceRef.current;
    if (!p) return;
    p.cells.forEach((row, r) =>
      row.forEach((on, c) => {
        if (on && p.row + r >= 0) grid[p.row + r][p.col + c] = p.color;
      })
    );

    const fullRows = [];
    grid.forEach((row, i) => {
      if (row.every((cell) => cell)) fullRows.push(i);
    });
    if (fullRows.length === 0) {
      spawnNext();
      return;
    }

    // Hide the piece and hand the canvas over to the blink timer.
    flashRowsRef.current = fullRows;
    flashLitRef.current = true;
    pieceRef.current = null;
    setFlashing(true);
    draw();

    let blinks = 0;
    flashTimerRef.current = setInterval(() => {
      blinks += 1;
      flashLitRef.current = !flashLitRef.current;
      draw();
      if (blinks >= FLASH_BLINKS) {
        clearInterval(flashTimerRef.current);
        flashTimerRef.current = null;
        finishClear(fullRows);
      }
    }, FLASH_INTERVAL);
  }, [draw, spawnNext, finishClear]);

  // One gravity step: move the piece down, or lock it if it can't move.
  const tick = useCallback(() => {
    if (overRef.current) return;
    const p = pieceRef.current;
    if (!p) return;
    if (collides(gridRef.current, p, p.row + 1, p.col, p.cells)) {
      lockPiece();
    } else {
      p.row += 1;
    }
    draw();
  }, [draw, lockPiece]);

  // Fall speed ramps up with lines cleared (one level per 10 lines).
  const dropDelay = Math.max(100, 700 - Math.floor(lines / 10) * 60);

  useEffect(() => {
    if (gameOver || flashing) return;
    const id = setInterval(tick, dropDelay);
    return () => clearInterval(id);
  }, [tick, dropDelay, gameOver, flashing]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const tryMove = useCallback(
    (dRow, dCol) => {
      if (overRef.current) return false;
      const p = pieceRef.current;
      if (!p) return false;
      if (collides(gridRef.current, p, p.row + dRow, p.col + dCol, p.cells)) {
        return false;
      }
      p.row += dRow;
      p.col += dCol;
      draw();
      return true;
    },
    [draw]
  );

  const moveLeft = useCallback(() => tryMove(0, -1), [tryMove]);
  const moveRight = useCallback(() => tryMove(0, 1), [tryMove]);

  const rotate = useCallback(() => {
    if (overRef.current) return;
    const p = pieceRef.current;
    if (!p) return;
    const turned = rotateMatrix(p.cells);
    // Try in place, then nudge one cell left/right so wall rotations work.
    for (const kick of [0, -1, 1]) {
      if (!collides(gridRef.current, p, p.row, p.col + kick, turned)) {
        p.cells = turned;
        p.col += kick;
        draw();
        return;
      }
    }
  }, [draw]);

  const softDrop = useCallback(() => {
    if (overRef.current) return;
    if (tryMove(1, 0)) addScore(1);
  }, [tryMove, addScore]);

  const hardDrop = useCallback(() => {
    if (overRef.current || !pieceRef.current) return;
    let fell = 0;
    while (tryMove(1, 0)) fell += 1;
    if (fell > 0) addScore(fell * 2);
    lockPiece();
    draw();
  }, [tryMove, addScore, lockPiece, draw]);

  const restart = useCallback(() => {
    clearInterval(flashTimerRef.current);
    flashTimerRef.current = null;
    flashRowsRef.current = [];
    flashLitRef.current = false;

    gridRef.current = emptyGrid();
    pieceRef.current = shapeToPiece(randomShape());
    nextShapeRef.current = randomShape();
    scoreRef.current = 0;
    linesRef.current = 0;
    overRef.current = false;

    setScore(0);
    setLines(0);
    setGameOver(false);
    setFlashing(false);
    onScoreChange?.(0);
    onNextChange?.(nextShapeRef.current);
    draw();
  }, [draw, onScoreChange, onNextChange]);

  // Expose control functions to the modal's on-screen touch buttons.
  useImperativeHandle(
    ref,
    () => ({ moveLeft, moveRight, rotate, softDrop, hardDrop, restart }),
    [moveLeft, moveRight, rotate, softDrop, hardDrop, restart]
  );

  // Keyboard controls for desktop testing.
  useEffect(() => {
    function onKeyDown(e) {
      const actions = {
        ArrowLeft: moveLeft,
        ArrowRight: moveRight,
        ArrowUp: rotate,
        ArrowDown: softDrop,
        " ": hardDrop,
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveLeft, moveRight, rotate, softDrop, hardDrop]);

  // First paint, plus publish the opening "Next" piece to the HUD.
  useEffect(() => {
    onNextChange?.(nextShapeRef.current);
    draw();
  }, [draw, onNextChange]);

  // Stop the blink timer if the modal closes mid-clear.
  useEffect(() => () => clearInterval(flashTimerRef.current), []);

  return (
    <div
      className="relative rounded-[20px] border p-3"
      style={{
        background: "linear-gradient(160deg,#28242a,#100d10)",
        borderColor: "rgba(196,150,42,0.2)",
        boxShadow:
          "0 18px 40px rgba(0,0,0,.55), inset 0 2px 0 rgba(255,255,255,.06), inset 0 -6px 14px rgba(0,0,0,.5)",
      }}
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="block max-h-[48vh] w-auto rounded-[10px]"
          style={{
            aspectRatio: `${COLS} / ${ROWS}`,
            boxShadow: "inset 0 2px 10px rgba(0,0,0,.7)",
          }}
        />
        {gameOver && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[10px]"
            style={{
              background: "rgba(5,3,4,0.82)",
              backdropFilter: "blur(2px)",
            }}
          >
            <div className="font-serif text-xl italic text-white">
              Game Over
            </div>
            <div className="text-[13px] text-white/75">Score: {score}</div>
            <button
              onClick={restart}
              className="rounded-lg px-[22px] py-[10px] text-[13px] font-bold text-white transition hover:brightness-110 active:scale-95"
              style={{
                background: "linear-gradient(160deg,#d3143a,#8E0A24)",
                boxShadow:
                  "0 4px 10px rgba(186,12,47,.4), inset 0 1px 0 rgba(255,255,255,.25)",
              }}
            >
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default ArcadeGame;
