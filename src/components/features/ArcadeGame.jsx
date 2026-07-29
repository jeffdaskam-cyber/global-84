import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

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

const emptyGrid = () =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

// Rotate a matrix 90° clockwise.
function rotateMatrix(m) {
  return m[0].map((_, c) => m.map((row) => row[c]).reverse());
}

function randomPiece() {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)];
  return {
    cells: p.cells,
    color: p.color,
    row: 0,
    col: Math.floor((COLS - p.cells[0].length) / 2),
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

const ArcadeGame = forwardRef(function ArcadeGame(
  { onScoreChange, onGameOver },
  ref
) {
  const canvasRef = useRef(null);

  // Mutable game state, read/written by the tick loop and controls.
  const gridRef = useRef(emptyGrid());
  const pieceRef = useRef(randomPiece());
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const overRef = useRef(false);
  const timerRef = useRef(null);

  // Display-only mirrors.
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Board background
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    const drawCell = (r, c, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
    };

    // Locked blocks
    const grid = gridRef.current;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) drawCell(r, c, grid[r][c]);
      }
    }

    // Falling piece
    const p = pieceRef.current;
    if (p && !overRef.current) {
      p.cells.forEach((row, r) =>
        row.forEach((on, c) => {
          if (on && p.row + r >= 0) drawCell(p.row + r, p.col + c, p.color);
        })
      );
    }

    // Faint grid lines
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(COLS * CELL, r * CELL);
      ctx.stroke();
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

  // Lock the falling piece into the grid, clear full rows, spawn the next
  // piece. Ends the game if the new piece can't fit at the top.
  const lockPiece = useCallback(() => {
    const grid = gridRef.current;
    const p = pieceRef.current;
    p.cells.forEach((row, r) =>
      row.forEach((on, c) => {
        if (on && p.row + r >= 0) grid[p.row + r][p.col + c] = p.color;
      })
    );

    // Line clear: keep rows with any empty cell, refill the top.
    const kept = grid.filter((row) => row.some((cell) => !cell));
    const cleared = ROWS - kept.length;
    if (cleared > 0) {
      while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
      gridRef.current = kept;
      linesRef.current += cleared;
      setLines(linesRef.current);
      addScore(LINE_POINTS[cleared]);
    }

    const next = randomPiece();
    pieceRef.current = next;
    if (collides(gridRef.current, next, next.row, next.col, next.cells)) {
      overRef.current = true;
      setGameOver(true);
      onGameOver?.(scoreRef.current);
    }
  }, [addScore, onGameOver]);

  // One gravity step: move the piece down, or lock it if it can't move.
  const tick = useCallback(() => {
    if (overRef.current) return;
    const p = pieceRef.current;
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
    if (gameOver) return;
    timerRef.current = setInterval(tick, dropDelay);
    return () => clearInterval(timerRef.current);
  }, [tick, dropDelay, gameOver]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const tryMove = useCallback(
    (dRow, dCol) => {
      if (overRef.current) return false;
      const p = pieceRef.current;
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
    if (overRef.current) return;
    let fell = 0;
    while (tryMove(1, 0)) fell += 1;
    if (fell > 0) addScore(fell * 2);
    lockPiece();
    draw();
  }, [tryMove, addScore, lockPiece, draw]);

  const restart = useCallback(() => {
    gridRef.current = emptyGrid();
    pieceRef.current = randomPiece();
    scoreRef.current = 0;
    linesRef.current = 0;
    overRef.current = false;
    setScore(0);
    setLines(0);
    setGameOver(false);
    onScoreChange?.(0);
    draw();
  }, [draw, onScoreChange]);

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

  // First paint.
  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="block rounded-lg border-2 border-du-gold max-h-[55vh] w-auto"
        style={{ aspectRatio: `${COLS} / ${ROWS}` }}
      />
      {gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/70">
          <div className="text-lg font-semibold text-white">Game Over</div>
          <div className="text-sm text-white/80">Score: {score}</div>
          <button
            onClick={restart}
            className="rounded-lg bg-du-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-du-crimsonDark transition"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
});

export default ArcadeGame;
