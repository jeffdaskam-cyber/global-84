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
import { translateImage, validateImageFile } from "../lib/translate.js";

// ── Styles (matching the crimson/gold design system) ──────────────────────────

const gold = "#c4862a";
const goldFaint = "rgba(196,150,42,0.2)";
const goldSubtle = "rgba(196,150,42,0.75)";
const crimson = "#BA0C2F";
const white = "#ffffff";
const darkBg = "#0d0103";
const cardBg = "linear-gradient(160deg, #1c0408 0%, #2a0a10 100%)";

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Gold-gradient text span, matching the page header style used across the app. */
function GoldText({ children }) {
  return (
    <span
      style={{
        background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      {children}
    </span>
  );
}

/** A dark card container matching the Currency page style. */
function Card({ children, style }) {
  return (
    <div
      style={{
        borderRadius: "16px",
        overflow: "hidden",
        background: cardBg,
        border: `1px solid ${goldFaint}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Spinner shown while translation is in progress. */
function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "24px 0" }}>
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: `3px solid ${goldFaint}`,
          borderTopColor: gold,
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", textAlign: "center", margin: 0 }}>
        Translating… this may take a moment on first use
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

    const validationError = validateImageFile(file);
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

  return (
    <div className="min-h-screen" style={{ background: darkBg }}>

      {/* ── Page header ── */}
      <div
        className="px-5 pt-10 pb-6"
        style={{
          background: cardBg,
          borderBottom: `1px solid ${goldFaint}`,
        }}
      >
        <div
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "26px",
            fontWeight: 700,
            color: white,
            letterSpacing: "-0.3px",
          }}
        >
          Photo <GoldText>Translator</GoldText>
        </div>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>
          Photograph signage, menus &amp; documents · English translation in seconds
        </p>
      </div>

      {/* ── Main content ── */}
      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">

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
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                width: "100%",
                padding: "14px",
                borderRadius: "12px",
                background: selectedFile
                  ? "rgba(196,150,42,0.12)"
                  : `rgba(${parseInt(crimson.slice(1, 3), 16)},${parseInt(crimson.slice(3, 5), 16)},${parseInt(crimson.slice(5, 7), 16)},0.2)`,
                border: `1px solid ${selectedFile ? goldFaint : "rgba(186,12,47,0.35)"}`,
                color: selectedFile ? goldSubtle : "rgba(255,255,255,0.7)",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                boxSizing: "border-box",
              }}
            >
              <span style={{ fontSize: "22px" }}>📷</span>
              {selectedFile ? selectedFile.name : "Choose Image or Take Photo"}
            </label>

            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", textAlign: "center", margin: 0 }}>
              JPG · PNG · WEBP · up to 5 MB
            </p>

            {/* Image preview */}
            {previewUrl && (
              <div style={{ borderRadius: "10px", overflow: "hidden", border: `1px solid ${goldFaint}` }}>
                <img
                  src={previewUrl}
                  alt="Selected image preview"
                  style={{ width: "100%", maxHeight: "280px", objectFit: "contain", display: "block", background: "#000" }}
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div style={{
                background: "rgba(180,30,30,0.15)",
                border: "1px solid rgba(180,30,30,0.35)",
                borderRadius: "10px",
                padding: "12px 14px",
                color: "rgba(255,180,180,0.9)",
                fontSize: "13px",
              }}>
                {error}
                {error.toLowerCase().includes("fail") && (
                  <span style={{ color: "rgba(255,180,180,0.6)" }}> Try selecting the image again.</span>
                )}
              </div>
            )}

            {/* Translate button */}
            <button
              onClick={handleTranslate}
              disabled={!selectedFile || loading}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "12px",
                background: (!selectedFile || loading)
                  ? "rgba(186,12,47,0.15)"
                  : `linear-gradient(135deg, ${crimson} 0%, #9a0a27 100%)`,
                border: `1px solid ${(!selectedFile || loading) ? "rgba(186,12,47,0.2)" : "transparent"}`,
                color: (!selectedFile || loading) ? "rgba(255,255,255,0.3)" : white,
                fontSize: "16px",
                fontWeight: 700,
                cursor: (!selectedFile || loading) ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                fontFamily: "Georgia, serif",
                letterSpacing: "0.02em",
              }}
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
              <div
                className="px-5 py-3"
                style={{ borderBottom: `1px solid ${goldFaint}` }}
              >
                <p style={{
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: goldSubtle,
                  margin: 0,
                  fontWeight: 600,
                }}>
                  Detected Text
                </p>
              </div>
              <div className="px-5 py-4">
                <p style={{
                  fontSize: "15px",
                  color: "rgba(255,255,255,0.75)",
                  margin: 0,
                  lineHeight: "1.65",
                  whiteSpace: "pre-wrap",
                }}>
                  {result.original || "No text detected."}
                </p>
              </div>
            </Card>

            {/* English translation card */}
            <Card>
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${goldFaint}` }}
              >
                <p style={{
                  fontSize: "11px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: goldSubtle,
                  margin: 0,
                  fontWeight: 600,
                }}>
                  English Translation
                </p>
                {result.translated && (
                  <button
                    onClick={handleCopy}
                    style={{
                      fontSize: "12px",
                      color: copied ? "rgba(100,220,100,0.85)" : goldSubtle,
                      background: "rgba(196,150,42,0.1)",
                      border: `1px solid ${copied ? "rgba(100,220,100,0.3)" : goldFaint}`,
                      borderRadius: "20px",
                      padding: "4px 12px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy"}
                  </button>
                )}
              </div>
              <div className="px-5 py-4">
                <p style={{
                  fontSize: "15px",
                  color: white,
                  margin: 0,
                  lineHeight: "1.65",
                  whiteSpace: "pre-wrap",
                }}>
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
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.45)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Reset — translate another image
          </button>
        )}

      </div>
    </div>
  );
}
