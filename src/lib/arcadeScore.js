// Tiny localStorage wrapper for the hidden arcade game's on-device high score.
// All access is wrapped in try/catch — some in-app browser contexts restrict
// localStorage, and the game should fail silently rather than crash.

const KEY = "global84_arcade_highscore";

// Read the stored high score; returns 0 if missing, unparseable, or blocked.
export function getHighScore() {
  try {
    const raw = localStorage.getItem(KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Write `score` only if it beats the stored high score; returns the new high score.
export function setHighScore(score) {
  const current = getHighScore();
  if (!(Number.isFinite(score) && score > current)) return current;
  try {
    localStorage.setItem(KEY, String(score));
    return score;
  } catch {
    return current;
  }
}
