/**
 * Client-side image downscaling.
 *
 * A photo straight off a modern phone is 3–12 MB. Uploading that to a
 * US-hosted Storage bucket from Vietnam is the single most expensive thing
 * anyone does in this app, and it happens on the worst link of the trip: an
 * international leg that shares a handful of submarine cables and degrades
 * badly whenever one is cut. Resizing to something the gallery can actually
 * display first cuts the payload by roughly an order of magnitude.
 *
 * Every failure path returns the original file. A photo that uploads slowly is
 * a far better outcome than one that does not upload at all, so nothing here
 * is allowed to turn a decoding quirk into a lost upload.
 */

// Comfortably above what the gallery renders (a masonry column on a phone) and
// still sharp on a desktop lightbox.
export const MAX_IMAGE_DIMENSION = 1600;

// High enough that compression artifacts are not visible in a travel photo.
export const JPEG_QUALITY = 0.82;

// Formats where re-encoding would lose something the pixels do not capture:
// GIF would lose animation, SVG has no inherent raster size.
const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);

/**
 * Encoding the output as the input's own format keeps the file extension and
 * any alpha channel intact — worth more than the extra bytes PNG costs, since
 * the storage path in gallery.js is derived from the original filename.
 */
function outputTypeFor(inputType) {
  if (inputType === "image/png") return "image/png";
  if (inputType === "image/webp") return "image/webp";
  return "image/jpeg";
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscale an image file so its longest edge is at most `maxDimension`.
 *
 * @param {File} file
 * @param {{maxDimension?: number, quality?: number}} [options]
 * @returns {Promise<File>} The smaller file, or the original when shrinking it
 *   was impossible or would not have helped.
 */
export async function downscaleImage(file, options = {}) {
  const {
    maxDimension = MAX_IMAGE_DIMENSION,
    quality = JPEG_QUALITY,
  } = options;

  if (!file?.type?.startsWith("image/")) return file;
  if (SKIP_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap;
  try {
    // from-image applies the EXIF orientation tag during decode. Without it,
    // photos taken in portrait land sideways, since drawImage works on raw
    // pixels and ignores the tag.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDimension / longestEdge);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    if (!canvas.width || !canvas.height) return file;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const type = outputTypeFor(file.type);
    const blob = await canvasToBlob(canvas, type, quality);

    // Re-encoding can enlarge an already-optimised file. The size check is the
    // arbiter, so an image that is already small simply passes through even
    // though it was decoded and redrawn.
    if (!blob || blob.size >= file.size) return file;

    const name = type === file.type ? file.name : renameExtension(file.name, type);
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

function renameExtension(name, type) {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base}.${ext}`;
}
