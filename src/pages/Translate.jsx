/**
 * Translate.jsx — Translator page for Global 84.
 *
 * Lets cohort members photograph signage, menus, or documents in Singapore
 * or Vietnam and receive an English translation powered by Anthropic Claude.
 *
 * The Anthropic API key is never in the browser — all API calls are proxied
 * through a Firebase Cloud Function.
 *
 * Route: /translate  (side drawer only — not in bottom nav)
 */

import { useState, useRef } from "react";
import { translateImage, validateImageType } from "../lib/translate.js";

// ── Sub-components (light cream/crimson/gold design system) ──────────────────

/** A white card container matching the cards used across the app. */
function Card({ children }) {
  return (
    <div className="rounded-xl overflow-hidden bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card">
      {children}
    </div>
  );
}

/** Small uppercase section label used in the result cards. */
function CardLabel({ children }) {
  return (
    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-du-gold">
      {children}
    </p>
  );
}

/** Spinner shown while translation is in progress. */
function Spinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="w-10 h-10 rounded-full border-[3px] border-du-goldSoft border-t-du-crimson animate-spin" />
      <p className="m-0 text-sm text-center text-ink-sub dark:text-ink-subOnDark">
        Translating… this may take a moment on first use
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Translate() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);       // { original, translated }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);

  // ── File selection ───────────────────────────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset any previous results/errors
    setError("");
    setResult(null);
    setCopied(false);

    // Type only. The size check belongs after downscaling, which happens inside
    // translateImage() — checking it here would reject the large phone photos
    // the resize step is meant to accept, and they would never reach it.
    const validationError = validateImageType(file);
    if (validationError) {
      setError(validationError);
      // Reset the input so the same file can be retried after fixing the issue
      e.target.value = "";
      return;
    }

    // Revoke any existing object URL to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
  }

  // ── Translation ──────────────────────────────────────────────────────────────

  async function handleTranslate() {
    if (!selectedFile || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const translationResult = await translateImage(selectedFile);
      setResult(translationResult);
    } catch (err) {
      setError(err.message || "Translation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Copy to clipboard ────────────────────────────────────────────────────────

  async function handleCopy() {
    if (!result?.translated) return;
    try {
      await navigator.clipboard.writeText(result.translated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      setError("Could not copy to clipboard. Please select and copy the text manually.");
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────

  function handleReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
    setCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const canTranslate = selectedFile && !loading;

  return (
    <div className="p-5 space-y-5">

      {/* ── Page header ── */}
      <div>
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
          Photo <span className="text-du-crimson">Translator</span>
        </div>
        <div className="h-1 w-10 rounded-full bg-du-gold mt-2" />
        <p className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark">
          Photograph signage, menus &amp; documents · English translation in seconds
        </p>
      </div>

      {/* ── Main content ── */}
      <div className="space-y-5 max-w-lg mx-auto">

        {/* ── Upload card ── */}
        <Card>
          <div className="px-5 py-5 space-y-4">

            {/* File input — hidden; triggered by styled button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: "none" }}
              id="translate-file-input"
            />

            {/* Upload button */}
            <label
              htmlFor="translate-file-input"
              className={`flex items-center justify-center gap-2.5 w-full p-3.5 rounded-lg text-[15px] font-semibold cursor-pointer transition border ${
                selectedFile
                  ? "bg-du-goldSoft border-du-goldDeep/70 text-ink-main dark:bg-du-gold/10 dark:text-ink-onDark"
                  : "bg-du-crimsonSoft border-du-crimson/30 text-du-crimsonDark dark:bg-du-crimson/15 dark:text-ink-onDark"
              }`}
            >
              <span className="text-[22px]">📷</span>
              <span className="truncate">{selectedFile ? selectedFile.name : "Choose Image or Take Photo"}</span>
            </label>

            <p className="m-0 text-[11px] text-center text-ink-muted">
              JPG · PNG · WEBP · up to 5 MB
            </p>

            {/* Image preview */}
            {previewUrl && (
              <div className="rounded-lg overflow-hidden border border-surface-border dark:border-surface-darkBorder">
                <img
                  src={previewUrl}
                  alt="Selected image preview"
                  className="block w-full object-contain bg-ink-main"
                  style={{ maxHeight: "280px" }}
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-lg px-3.5 py-3 text-[13px] bg-du-crimsonSoft border border-du-crimson/30 text-du-crimsonDark dark:bg-du-crimson/15 dark:text-ink-onDark">
                {error}
                {error.toLowerCase().includes("fail") && (
                  <span className="opacity-75"> Try selecting the image again.</span>
                )}
              </div>
            )}

            {/* Translate button */}
            <button
              onClick={handleTranslate}
              disabled={!canTranslate}
              className={`w-full p-3.5 rounded-lg text-base font-bold tracking-[0.02em] transition ${
                canTranslate
                  ? "bg-du-crimson text-white hover:bg-du-crimsonDark"
                  : "bg-du-crimson/15 text-du-crimson/50 cursor-not-allowed"
              }`}
              style={{ fontFamily: "Georgia, serif" }}
            >
              {loading ? "Translating…" : "Translate"}
            </button>

          </div>
        </Card>

        {/* ── Loading spinner ── */}
        {loading && (
          <Card>
            <div className="px-5 py-4">
              <Spinner />
            </div>
          </Card>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <>
            {/* Detected text card */}
            <Card>
              <div className="px-5 py-3 border-b border-surface-border dark:border-surface-darkBorder">
                <CardLabel>Detected Text</CardLabel>
              </div>
              <div className="px-5 py-4">
                <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-sub dark:text-ink-subOnDark">
                  {result.original || "No text detected."}
                </p>
              </div>
            </Card>

            {/* English translation card */}
            <Card>
              <div className="px-5 py-3 flex items-center justify-between border-b border-surface-border dark:border-surface-darkBorder">
                <CardLabel>English Translation</CardLabel>
                {result.translated && (
                  <button
                    onClick={handleCopy}
                    className={`text-xs font-semibold rounded-full px-3 py-1 border transition ${
                      copied
                        ? "bg-green-50 border-green-300 text-green-700"
                        : "bg-du-goldSoft border-du-goldDeep/70 text-du-gold dark:bg-du-gold/10"
                    }`}
                  >
                    {copied ? "✓ Copied!" : "Copy"}
                  </button>
                )}
              </div>
              <div className="px-5 py-4">
                <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-main dark:text-ink-onDark">
                  {result.translated || "No translation available."}
                </p>
              </div>
            </Card>
          </>
        )}

        {/* ── Reset button (shown after any image is selected) ── */}
        {(selectedFile || result) && !loading && (
          <button
            onClick={handleReset}
            className="w-full py-3 rounded-lg text-[13px] font-semibold border border-surface-border dark:border-surface-darkBorder bg-surface-card dark:bg-surface-darkCard text-ink-sub dark:text-ink-subOnDark hover:bg-surface-light dark:hover:bg-surface-dark transition"
          >
            Reset — translate another image
          </button>
        )}

      </div>
    </div>
  );
}
