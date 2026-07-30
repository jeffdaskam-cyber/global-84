// Canvas drawing helpers for the hidden arcade game. Shared by the board
// canvas and the "Next" preview so both render blocks identically.

// Board backdrop gradient — the same near-black plum used by the cabinet bezel.
const BOARD_TOP = "#1a1418";
const BOARD_BOTTOM = "#0c0a0d";

// Lighten (percent > 0) or darken (percent < 0) a #rrggbb color.
export function shade(hex, percent) {
  const f = parseInt(hex.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  const R = f >> 16;
  const G = (f >> 8) & 0x00ff;
  const B = f & 0x0000ff;
  return (
    "#" +
    (
      0x1000000 +
      (Math.round((t - R) * p) + R) * 0x10000 +
      (Math.round((t - G) * p) + G) * 0x100 +
      (Math.round((t - B) * p) + B)
    )
      .toString(16)
      .slice(1)
  );
}

// Rounded-rectangle subpath. Callers decide whether to fill, stroke, or clip.
export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fill the dark vertical gradient behind the playfield.
export function fillBoardBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, BOARD_TOP);
  bg.addColorStop(1, BOARD_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

// A single block: vertical body gradient, diagonal specular highlight, and a
// darkened lower third, which together read as a moulded plastic tile.
export function drawGlossyCell(ctx, x, y, size, color) {
  const pad = 1.5;
  const inset = size - pad * 2;

  roundRectPath(ctx, x + pad, y + pad, inset, inset, 4);
  ctx.save();
  ctx.clip();

  const body = ctx.createLinearGradient(x, y, x, y + size);
  body.addColorStop(0, shade(color, 0.45));
  body.addColorStop(0.5, color);
  body.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = body;
  ctx.fillRect(x, y, size, size);

  const gloss = ctx.createLinearGradient(x, y, x + size * 0.3, y + size * 0.7);
  gloss.addColorStop(0, "rgba(255,255,255,0.65)");
  gloss.addColorStop(0.5, "rgba(255,255,255,0.12)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(x, y, size, size * 0.55);

  const shadow = ctx.createLinearGradient(x, y + size * 0.7, x, y + size);
  shadow.addColorStop(0, "rgba(0,0,0,0)");
  shadow.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + size * 0.55, size, size * 0.45);

  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + pad, y + pad, inset, inset, 4);
  ctx.stroke();
}

// The "lit" frame of a block on a row that is about to clear.
export function drawFlashCell(ctx, x, y, size) {
  const pad = 1.5;
  const inset = size - pad * 2;

  roundRectPath(ctx, x + pad, y + pad, inset, inset, 4);
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(255,246,214,0.9)";
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(196,150,42,0.9)";
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x + pad, y + pad, inset, inset, 4);
  ctx.stroke();
}
