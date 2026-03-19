// sheetsSync.js — Fetches and parses Explore listings from a published Google Sheet.
//
// The admin publishes their Google Sheet via File → Share → Publish to web → CSV.
// The app fetches the CSV from the public URL (no API key or OAuth needed) and
// parses it into row objects matching the Explore column spec:
//
//   Required: city, type, name
//   Optional: neighborhood, hours, price, tags, googleMapsUrl, reservationUrl, notes, recommendedBy
//
// Column order in the sheet doesn't matter — the parser matches by header name.

/**
 * Fetches the raw CSV text from the published Google Sheet.
 * In production, uses a Vercel serverless proxy (/api/sheets) to avoid CORS
 * issues with organizational Google Workspace accounts.
 * In local dev, fetches the Google Sheet URL directly.
 */
export async function fetchSheetData() {
  const sheetUrl = import.meta.env.VITE_EXPLORE_SHEET_URL;
  if (!sheetUrl) {
    throw new Error(
      "Sheet URL not configured. Set VITE_EXPLORE_SHEET_URL in your .env file."
    );
  }

  // Use the serverless proxy in production to bypass CORS restrictions.
  // In local dev (Vite), fetch Google directly since there's no /api route.
  const isDev = import.meta.env.DEV;
  const fetchUrl = isDev ? sheetUrl : "/api/sheets";

  const res = await fetch(fetchUrl);

  if (!res.ok) {
    // The proxy returns JSON errors
    if (!isDev) {
      try {
        const body = await res.json();
        throw new Error(body.error || `Proxy returned HTTP ${res.status}`);
      } catch (e) {
        if (e.message) throw e;
      }
    }
    throw new Error(
      `Failed to fetch Google Sheet (HTTP ${res.status}). Make sure the sheet is published to web.`
    );
  }

  return res.text();
}

/**
 * Parses a CSV string into an array of plain objects keyed by column header.
 * Handles RFC 4180 quoting (double-quoted fields with commas, escaped quotes).
 * The `tags` field is split into an array; all other fields are trimmed strings.
 */
export function parseSheetCSV(csvText) {
  let text = csvText;
  let i = 0;
  const len = text.length;

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  function readCell() {
    let out = "";

    if (text[i] === '"') {
      i++;
      while (i < len) {
        if (text[i] === '"' && text[i + 1] === '"') {
          out += '"';
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        out += text[i++];
      }
      // consume trailing whitespace after closing quote
      while (text[i] === " " || text[i] === "\t") i++;
      return out;
    }

    while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
      out += text[i++];
    }
    return out.trim();
  }

  function consumeNewline() {
    if (text[i] === "\r") i++;
    if (text[i] === "\n") i++;
  }

  function readLine() {
    const line = [];
    while (i < len) {
      line.push(readCell());
      if (text[i] === ",") {
        i++;
        continue;
      }
      consumeNewline();
      break;
    }
    return line;
  }

  // Skip leading blank lines
  while (i < len && (text[i] === "\n" || text[i] === "\r")) consumeNewline();

  // Read header row — normalize keys to lowercase
  const header = readLine()
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!header.length) return [];

  // Read data rows
  const rows = [];
  while (i < len) {
    while (i < len && (text[i] === "\n" || text[i] === "\r")) consumeNewline();
    if (i >= len) break;

    const line = readLine();
    if (!line.length || line.every((c) => !c)) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      let value = (line[c] ?? "").trim();

      // Leave all fields as strings — cleanExploreRow() in explore.js
      // handles tag splitting and normalization downstream.
      obj[key] = value;
    }
    rows.push(obj);
  }

  return rows;
}
