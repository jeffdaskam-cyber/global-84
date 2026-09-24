// src/lib/galleryDownload.js
// Gallery downloads: single photos and browser-built zips.
//
// Everything here fetch()es Storage files, which needs CORS on the bucket
// (storage-cors.json). Each request carries a g84dl=1 marker so the service
// worker's image cache (vite.config.js) never serves it an opaque <img>
// response it can't read, and never fills up with multi-MB originals.

const CITY_LABELS = { singapore: "Singapore", vietnam: "Vietnam" };

// Size guesses for files whose size wasn't recorded (photos uploaded before
// sizes were stored). Deliberately high: parts are materialized in memory, so
// underestimating risks a part far over the cap on a phone. A 1600px JPEG
// display copy is well under 1 MB; a PNG or an image that couldn't be
// downscaled can approach Storage's 10 MB display limit.
const UNKNOWN_JPEG_ESTIMATE_BYTES = 1024 * 1024;
const UNKNOWN_OTHER_ESTIMATE_BYTES = 5 * 1024 * 1024;

const MOBILE_PART_LIMIT_BYTES = 150 * 1024 * 1024;
const DESKTOP_PART_LIMIT_BYTES = 500 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;
// Browsers block a burst of programmatic downloads; spacing parts out keeps
// every part's save from being swallowed.
const PAUSE_BETWEEN_PARTS_MS = 1500;

const CONTENT_TYPE_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export function isCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

export function partLimitBytes() {
  return isCoarsePointer() ? MOBILE_PART_LIMIT_BYTES : DESKTOP_PART_LIMIT_BYTES;
}

export function downloadUrlFor(photo) {
  return photo.originalUrl || photo.url;
}

/** Bytes a photo's download is expected to take. */
export function estimatedBytes(photo) {
  if (photo.originalUrl) {
    if (photo.originalSize) return photo.originalSize;
  } else if (photo.displaySize) {
    return photo.displaySize;
  }
  const ext = extensionFor(photo);
  return ext === "jpg" ? UNKNOWN_JPEG_ESTIMATE_BYTES : UNKNOWN_OTHER_ESTIMATE_BYTES;
}

function createdAtMillis(photo) {
  const ts = photo.createdAt;
  if (ts?.toMillis) return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  // A serverTimestamp that hasn't resolved yet: the photo was just added.
  return Date.now();
}

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function extensionFor(photo) {
  if (photo.originalUrl) {
    const fromType = CONTENT_TYPE_EXT[photo.originalContentType];
    if (fromType) return fromType;
  }
  const path = (photo.originalUrl && photo.originalPath) || photo.storagePath || "";
  const fromPath = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
  if (fromPath === "jpeg") return "jpg";
  return /^[a-z0-9]{1,5}$/.test(fromPath) ? fromPath : "jpg";
}

function sanitizeName(name) {
  const cleaned = String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "Member";
}

/**
 * Sortable, readable name: YYYY-MM-DD_City_Uploader-Name_###.ext
 * Without an index (single downloads) a short id suffix keeps names unique.
 */
export function fileNameFor(photo, index) {
  const date = isoDate(new Date(createdAtMillis(photo)));
  const city = CITY_LABELS[photo.city] || "Trip";
  const uploader = sanitizeName(photo.uploaderName);
  const suffix = index != null ? String(index).padStart(3, "0") : String(photo.id || "").slice(0, 6);
  return `${date}_${city}_${uploader}_${suffix}.${extensionFor(photo)}`;
}

export async function fetchPhotoBlob(photo, signal) {
  const url = downloadUrlFor(photo);
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}g84dl=1`, { signal, mode: "cors" });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  return res.blob();
}

function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the save in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function isAbortError(err) {
  return err?.name === "AbortError";
}

function abortError() {
  return new DOMException("Download cancelled.", "AbortError");
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true }
    );
  });
}

/**
 * Download one photo. On phones the share sheet offers "Save Image" to Photos;
 * everywhere else it's a normal file download.
 */
export async function downloadSingle(photo) {
  const blob = await fetchPhotoBlob(photo);
  const name = fileNameFor(photo);
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });

  // Desktop Chrome/Safari also report canShare for files, but a desktop user
  // wants the file in Downloads, not a share sheet.
  if (isCoarsePointer() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // The user closed the sheet: nothing to do.
      if (isAbortError(err)) return;
      // NotAllowedError etc. (e.g. the tap's user activation expired while
      // fetching): fall through to a plain download.
    }
  }

  saveBlob(file, name);
}

/**
 * Sort photos chronologically and split them into parts that stay under the
 * byte limit. Each photo keeps its global index so numbering runs across
 * parts. Pass `indexes` (photo id → index) to reuse numbers from an earlier
 * run, so a retry never produces a filename that's already been saved.
 */
export function planParts(photos, limit = partLimitBytes(), indexes) {
  const sorted = photos
    .map((photo) => ({ photo, at: createdAtMillis(photo) }))
    .sort((a, b) => a.at - b.at)
    .map(({ photo }, i) => ({ photo, index: indexes?.get(photo.id) ?? i + 1 }));

  const parts = [];
  let current = [];
  let bytes = 0;
  for (const item of sorted) {
    const size = estimatedBytes(item.photo);
    if (current.length > 0 && bytes + size > limit) {
      parts.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) parts.push(current);

  const totalBytes = sorted.reduce((sum, { photo }) => sum + estimatedBytes(photo), 0);
  return { parts, totalBytes };
}

/**
 * Fetch items with bounded concurrency, yielding results in order so the zip
 * stays chronological. Only FETCH_CONCURRENCY blobs are ever in flight ahead
 * of the zip writer.
 */
async function* fetchInOrder(items, signal, onSettled) {
  const pending = [];
  let next = 0;
  const startNext = () => {
    const item = items[next++];
    pending.push(
      fetchPhotoBlob(item.photo, signal).then(
        (blob) => {
          onSettled();
          return { item, blob };
        },
        (error) => {
          onSettled();
          return { item, error };
        }
      )
    );
  };

  while (next < items.length && pending.length < FETCH_CONCURRENCY) startNext();
  while (pending.length > 0) {
    const result = await pending.shift();
    if (next < items.length) startNext();
    yield result;
  }
}

/**
 * Build and save zip(s) of the given photos in the browser.
 *
 * @param {object[]} photos
 * @param {object} options
 * @param {string} options.zipBaseName - e.g. "Global84_Photos_Singapore"
 * @param {function} [options.onProgress] - ({ done, total, part, parts })
 * @param {AbortSignal} [options.signal]
 * @param {Map<string, number>} [options.indexes] - Reuse file numbers (retry)
 * @returns {Promise<{ downloaded: number, failed: object[], failedIndexes: Map<string, number> }>}
 *   Rejects with an AbortError if cancelled; nothing partial is saved.
 */
export async function downloadZip(photos, { zipBaseName, onProgress, signal, indexes } = {}) {
  const { downloadZip: makeZip } = await import("client-zip");

  const { parts } = planParts(photos, undefined, indexes);
  const total = photos.length;
  const date = isoDate(new Date());
  const failed = [];
  const failedIndexes = new Map();
  let downloaded = 0;
  let done = 0;

  for (let p = 0; p < parts.length; p++) {
    if (signal?.aborted) throw abortError();
    const part = p + 1;
    const report = () => onProgress?.({ done, total, part, parts: parts.length });
    report();

    let added = 0;
    async function* entries() {
      const results = fetchInOrder(parts[p], signal, () => {
        done += 1;
        report();
      });
      for await (const { item, blob, error } of results) {
        if (signal?.aborted) throw abortError();
        if (error) {
          if (isAbortError(error)) throw error;
          console.warn("Skipping photo that couldn't be downloaded.", item.photo.id, error);
          failed.push(item.photo);
          failedIndexes.set(item.photo.id, item.index);
          continue;
        }
        added += 1;
        yield {
          name: fileNameFor(item.photo, item.index),
          lastModified: new Date(createdAtMillis(item.photo)),
          input: blob,
        };
      }
    }

    const zip = await makeZip(entries()).blob();
    if (signal?.aborted) throw abortError();
    if (added === 0) continue;

    const suffix = parts.length > 1 ? `_part${part}of${parts.length}` : "";
    saveBlob(zip, `${zipBaseName}_${date}${suffix}.zip`);
    downloaded += added;

    if (part < parts.length) await pause(PAUSE_BETWEEN_PARTS_MS, signal);
  }

  return { downloaded, failed, failedIndexes };
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
