const MAX_TRANSLATION_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TRANSLATION_BASE64_LENGTH = Math.ceil(MAX_TRANSLATION_IMAGE_BYTES / 3) * 4;
const IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const DESIGNATOR_RE = /^[A-Z0-9]{2}[0-9]{1,4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TranslationRequest {
  imageBase64: string;
  mediaType: string;
}

export interface FlightLookupRequest {
  designator: string;
  date: string;
  forceRefresh: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTranslationRequest(body: unknown): TranslationRequest | null {
  if (!isRecord(body)) return null;
  const { imageBase64, mediaType } = body;
  if (typeof imageBase64 !== "string" || typeof mediaType !== "string") return null;
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) return null;
  if (
    imageBase64.length === 0 ||
    imageBase64.length > MAX_TRANSLATION_BASE64_LENGTH ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(imageBase64)
  ) return null;

  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_TRANSLATION_IMAGE_BYTES) return null;
  return { imageBase64, mediaType };
}

export function parseFlightLookupRequest(body: unknown): FlightLookupRequest | null {
  if (!isRecord(body)) return null;
  const { designator: rawDesignator, date, forceRefresh } = body;
  if (typeof rawDesignator !== "string" || typeof date !== "string") return null;
  if (forceRefresh !== undefined && typeof forceRefresh !== "boolean") return null;

  const designator = rawDesignator.replace(/\s+/g, "").toUpperCase();
  if (!DESIGNATOR_RE.test(designator) || !ISO_DATE_RE.test(date)) return null;

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
  return { designator, date, forceRefresh: forceRefresh === true };
}
