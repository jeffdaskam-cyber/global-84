import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cleanupExploreDuplicates, getExploreImportPreview, importExploreItems } from "../lib/explore";
import { auth, COHORT_ID } from "../lib/firebase";

function normalizeKey(k) {
  return (k || "").trim().toLowerCase();
}

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

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

  while (i < len && (text[i] === "\n" || text[i] === "\r")) consumeNewline();
  const header = readLine().map(normalizeKey).filter(Boolean);
  if (!header.length) return [];

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
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const required = ["city", "type", "name"];
  const hasRequiredHeaders = useMemo(() => required.every((r) => headers.includes(r)), [headers]);
  const preview = useMemo(() => getExploreImportPreview(rows, 8), [rows]);

  async function onPickFile(e) {
    setError("");
    setResult(null);

    const f = e.target.files?.[0];
    if (!f) return;

    setFileName(f.name);
    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    setHeaders(parsed.length ? Object.keys(parsed[0]) : []);
  }

  async function doImport() {
    setError("");
    setResult(null);

    if (!isAdmin) return setError("Admin access required.");
    if (!rows.length) return setError("Pick a CSV file first.");
    if (!hasRequiredHeaders) return setError(`CSV must include headers: ${required.join(", ")}.`);

    setBusy(true);
    try {
      const u = auth.currentUser;
      console.info("[explore import] ui submit", { cohortId: COHORT_ID, uid: u?.uid, email: u?.email, rowCount: rows.length });
      const r = await importExploreItems(rows, { fileName });
      setResult(r);
    } catch (err) {
      const details = err?.code ? ` (${err.code})` : "";
      setError(`${err?.message || "Import failed."}${details}`);
    } finally {
      setBusy(false);
    }
  }

  async function doCleanupOnly() {
    setError("");
    setResult(null);
    if (!isAdmin) return setError("Admin access required.");

    setBusy(true);
    try {
      const r = await cleanupExploreDuplicates();
      setResult({ imported: 0, updated: 0, skipped: 0, removedDuplicates: r.removedDuplicates, cleanupOnly: true });
    } catch (err) {
      const details = err?.code ? ` (${err.code})` : "";
      setError(`${err?.message || "Cleanup failed."}${details}`);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-5">
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Explore Import</div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">Admins only.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">Explore Import <span className="text-du-gold">•</span></div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">Upload a CSV exported from your Google Sheet.</div>
      </div>

      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-3">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">CSV format</div>
        <div className="text-sm text-ink-sub dark:text-ink-subOnDark whitespace-pre-wrap">
          Required headers: city,type,name{"\n"}
          Recommended: neighborhood,hours,price,tags,googlemapsurl,reservationurl,notes,recommendedby
        </div>

        <input type="file" accept=".csv" onChange={onPickFile} />

        {fileName ? <div className="text-sm text-ink-sub dark:text-ink-subOnDark">Selected: <span className="font-semibold">{fileName}</span></div> : null}

        {rows.length ? (
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark space-y-1">
            <div>Parsed rows: <span className="font-semibold">{rows.length}</span></div>
            <div>Headers detected: <span className="font-mono text-xs">{headers.join(", ") || "(none)"}</span></div>
            <div>
              Will import: <span className="font-semibold text-green-700">{preview.importableCount}</span> • Skip: <span className="font-semibold text-du-crimson">{preview.skippedCount}</span>
            </div>
          </div>
        ) : null}

        {rows.length ? (
          <div className="overflow-x-auto border border-surface-border dark:border-surface-darkBorder rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-surface-border/40 dark:bg-surface-darkBorder/50 text-left">
                <tr>
                  <th className="p-2">Row</th>
                  <th className="p-2">City</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Hours</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row) => (
                  <tr key={row.rowNumber} className={row.valid ? "" : "bg-red-50 dark:bg-red-950/40"}>
                    <td className="p-2 font-mono">{row.rowNumber}</td>
                    <td className="p-2">{row.city || "—"}</td>
                    <td className="p-2">{row.type || "—"}</td>
                    <td className="p-2">{row.name || "—"}</td>
                    <td className="p-2">{row.hours || "—"}</td>
                    <td className="p-2 font-semibold">{row.valid ? "Valid" : "Invalid"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {error ? <div className="text-sm text-du-crimson">{error}</div> : null}

        {result ? (
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark rounded-lg bg-green-50 dark:bg-green-950/30 p-3 space-y-2">
            <div className="font-semibold text-green-700 dark:text-green-400">
              {result.cleanupOnly
                ? `Cleanup complete: removed ${result.removedDuplicates} existing duplicates.`
                : `Import complete: ${result.imported} created, ${result.updated} updated, ${result.skipped} skipped.`}
              {!result.cleanupOnly && result.removedDuplicates ? ` Removed ${result.removedDuplicates} existing duplicates.` : ""}
            </div>
            <Link to="/explore" className="inline-flex rounded-md bg-du-crimson text-white px-3 py-1.5 text-xs font-semibold hover:bg-du-crimsonDark transition">
              View Explore
            </Link>
          </div>
        ) : null}

        <button
          onClick={doImport}
          disabled={busy || !rows.length || !hasRequiredHeaders}
          className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
        >
          {busy ? "Importing…" : "Import to Firestore"}
        </button>
        <button
          onClick={doCleanupOnly}
          disabled={busy}
          className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder py-3 text-sm font-semibold text-ink-main dark:text-ink-onDark hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder transition disabled:opacity-40"
        >
          {busy ? "Working…" : "Remove existing duplicates only"}
        </button>
      </div>
    </div>
  );
}
