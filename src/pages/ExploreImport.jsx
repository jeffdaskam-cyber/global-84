import { useMemo, useState } from "react";
import { importExploreItems } from "../lib/explore";

function normalizeKey(k) {
  return (k || "").trim().toLowerCase();
}

function parseCSV(text) {
  // Supports quoted fields and commas inside quotes. First row is headers.
  const rows = [];
  let i = 0;
  const len = text.length;

  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

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
      const cell = readCell();
      line.push(cell);

      if (text[i] === ",") {
        i++;
        continue;
      }

      consumeNewline();
      break;
    }
    return line;
  }

  // Read headers
  while (i < len && (text[i] === "\n" || text[i] === "\r")) consumeNewline();
  const rawHeader = readLine();
  const header = rawHeader.map(normalizeKey).filter(Boolean);

  if (!header.length) return [];

  // Read data rows
  while (i < len) {
    while (i < len && (text[i] === "\n" || text[i] === "\r")) consumeNewline();
    if (i >= len) break;

    const line = readLine();
    if (!line.length || line.every((c) => !c)) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = line[c] ?? "";
    }
    rows.push(obj);
  }

  return rows;
}

export default function ExploreImport({ isAdmin }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const required = ["city", "type", "name"];

  const hasRequiredHeaders = useMemo(() => {
    return required.every((r) => headers.includes(r));
  }, [headers]);

  async function onPickFile(e) {
    setError("");
    setResult("");
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);

    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed);

    const hdr = parsed.length ? Object.keys(parsed[0]) : [];
    setHeaders(hdr);
  }

  async function doImport() {
    setError("");
    setResult("");

    if (!isAdmin) {
      setError("Admin access required.");
      return;
    }
    if (!rows.length) {
      setError("Pick a CSV file first.");
      return;
    }
    if (!hasRequiredHeaders) {
      setError(`CSV must include headers: ${required.join(", ")}.`);
      return;
    }

    setBusy(true);
    try {
      const r = await importExploreItems(rows);
      setResult(`Imported ${r.imported} rows. Skipped ${r.skipped} invalid/empty rows.`);
    } catch (err) {
      console.error("Explore import failed:", err);
      setError(err?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-5">
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            Explore Import
          </div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            Admins only.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">
          Explore Import <span className="text-du-gold">•</span>
        </div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
          Upload a CSV exported from your Google Sheet.
        </div>
      </div>

      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-3">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
          CSV format
        </div>
        <div className="text-sm text-ink-sub dark:text-ink-subOnDark whitespace-pre-wrap">
          Required headers: city,type,name
          {"\n"}Recommended: neighborhood,price,tags,googlemapsurl,reservationurl,notes,recommendedby
        </div>

        <input type="file" accept=".csv" onChange={onPickFile} />

        {fileName ? (
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark">
            Selected: <span className="font-semibold">{fileName}</span>
          </div>
        ) : null}

        {rows.length ? (
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark space-y-1">
            <div>
              Parsed rows: <span className="font-semibold">{rows.length}</span>
            </div>
            <div>
              Headers detected:{" "}
              <span className="font-mono text-xs">
                {headers.join(", ") || "(none)"}
              </span>
            </div>
            <div>
              Header check:{" "}
              {hasRequiredHeaders ? (
                <span className="text-green-600 font-semibold">OK</span>
              ) : (
                <span className="text-du-crimson font-semibold">Missing required headers</span>
              )}
            </div>
            <div>
              First row preview:{" "}
              <span className="font-mono text-xs">
                {JSON.stringify(rows[0]).slice(0, 160)}
                {JSON.stringify(rows[0]).length > 160 ? "…" : ""}
              </span>
            </div>
          </div>
        ) : null}

        {error ? <div className="text-sm text-du-crimson">{error}</div> : null}
        {result ? <div className="text-sm text-ink-sub dark:text-ink-subOnDark">{result}</div> : null}

        <button
          onClick={doImport}
          disabled={busy || !rows.length || !hasRequiredHeaders}
          className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
        >
          {busy ? "Importing…" : "Import to Firestore"}
        </button>
      </div>
    </div>
  );
}