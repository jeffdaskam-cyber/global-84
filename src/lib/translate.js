/**
 * translate.js — Client-side helper for the Translator feature.
 *
 * Converts the selected image file to base64 and POSTs it to the
 * Firebase Cloud Function proxy. The Cloud Function holds the Anthropic
 * API key server-side; this module never sees it.
 *
 * Usage:
 *   import { translateImage } from './lib/translate.js';
 *   const { original, translated } = await translateImage(file);
 */

import { auth } from "./firebase";
import { downscaleImage } from "./images";

// Matches the longest edge the vision API keeps before it downsamples on its
// own, so nothing legible is lost by resizing to it first.
const TRANSLATE_MAX_DIMENSION = 1568;

// Slightly above the gallery's setting: this image exists to be read, and text
// edges are the first thing JPEG compression softens.
const TRANSLATE_QUALITY = 0.9;

// Accepted media types (must match the file input's accept attribute)
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// 5 MB in bytes
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Validate a File object before sending.
 * Returns an error string, or null if valid.
 */
export function validateImageFile(file) {
  if (!file) return "No file selected.";
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Unsupported file type. Please upload a JPG, PNG, or WEBP image.";
  }
  if (file.size > MAX_BYTES) {
    return "File is too large. Please choose an image under 5 MB.";
  }
  return null;
}

/**
 * Convert a File to a base64-encoded string (without the data URL prefix).
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:<mediaType>;base64,<data>"
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Translate the text in the provided image file.
 *
 * @param {File} imageFile - A browser File object (JPG, PNG, or WEBP)
 * @returns {Promise<{ original: string, translated: string }>}
 * @throws {Error} if validation fails, the network request fails, or the
 *   Cloud Function returns an error response.
 */
export async function translateImage(imageFile) {
  // Shrink before validating, so a full-resolution photo of a menu is resized
  // rather than refused for being over the 5 MB limit.
  //
  // TRANSLATE_MAX_DIMENSION is not arbitrary: the vision API downsamples
  // anything longer than this on its longest edge, so pixels above it are
  // uploaded across the Pacific and then discarded. Capping here costs no
  // legibility and shrinks the base64 body — which is 4/3 the file size — by
  // roughly an order of magnitude on a modern phone photo.
  const upload = await downscaleImage(imageFile, {
    maxDimension: TRANSLATE_MAX_DIMENSION,
    quality: TRANSLATE_QUALITY,
  });

  const validationError = validateImageFile(upload);
  if (validationError) throw new Error(validationError);

  // Read the Cloud Function URL from the Vite environment
  const functionUrl = import.meta.env.VITE_TRANSLATE_FUNCTION_URL;
  if (!functionUrl) {
    throw new Error("Translator is not configured. VITE_TRANSLATE_FUNCTION_URL is missing.");
  }

  // The Cloud Function requires a verified Firebase ID token — the API key
  // it holds is only spent for authenticated cohort members.
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please sign in to use the translator.");
  }
  const idToken = await currentUser.getIdToken();

  // Convert image to base64
  const imageBase64 = await fileToBase64(upload);

  // POST to the Cloud Function
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      imageBase64,
      mediaType: upload.type,
    }),
  });

  if (!response.ok) {
    let message = `Translation failed (HTTP ${response.status}).`;
    try {
      const errData = await response.json();
      if (errData.error) message = errData.error;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  return {
    original: data.original ?? "",
    translated: data.translated ?? "",
  };
}
