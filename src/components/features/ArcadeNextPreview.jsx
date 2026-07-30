import { useEffect, useRef } from "react";
import { drawGlossyCell, fillBoardBackground } from "../../lib/arcadeRender";

const WIDTH = 80;
const HEIGHT = 60;
const CELL = 18; // preview blocks are smaller than the board's

// The "Next" HUD tile: shows the upcoming piece on its own mini playfield.
export default function ArcadeNextPreview({ shape }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    fillBoardBackground(ctx, WIDTH, HEIGHT);
    if (!shape) return;

    // Center the piece's bounding box in the preview.
    const cols = shape.cells[0].length;
    const rows = shape.cells.length;
    const ox = (WIDTH - cols * CELL) / 2;
    const oy = (HEIGHT - rows * CELL) / 2;
    shape.cells.forEach((row, r) =>
      row.forEach((on, c) => {
        if (on) {
          drawGlossyCell(ctx, ox + c * CELL, oy + r * CELL, CELL, shape.color);
        }
      })
    );
  }, [shape]);

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
      className="block rounded-md"
    />
  );
}
