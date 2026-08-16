/**
 * translateImage — Firebase Cloud Function (HTTPS)
 *
 * Receives a base64-encoded image from the React app, calls the Anthropic
 * API using a server-side secret (never exposed to the browser), and returns
 * the translation result.
 *
 * The Anthropic API key is stored in Firebase Secret Manager and is only
 * accessible to this Cloud Function at runtime — it never touches the browser
 * bundle or any environment variable visible to Vite.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import corsLib from "cors";

// Initialize the Admin SDK once (used to verify caller ID tokens).
if (getApps().length === 0) {
  initializeApp();
}

// Only verified emails in this domain may call the translator. Keep in sync
// with VITE_ALLOWED_EMAIL_DOMAIN and the Firestore/Storage rules.
const ALLOWED_EMAIL_DOMAIN = "du.edu";

// Per-user rate limit. Auth stops strangers; this stops a single authenticated
// member (or a stolen session token) from looping the endpoint and running up
// the Anthropic bill. Counts are kept in a top-level `translateRateLimits`
// collection that has no match block in firestore.rules, so it is default-denied
// to every client — only this Admin SDK code can read or reset it. A member
// therefore cannot clear their own counter to bypass the limit.
const RATE_LIMIT_MAX = 30;                     // translate calls allowed per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;   // rolling window length: 1 hour

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limit for one member, enforced atomically in a Firestore
 * transaction so a burst of concurrent requests from the same uid can't race
 * past the ceiling. Each window starts on the first call after the previous one
 * expires; within a window we count up to RATE_LIMIT_MAX and then reject.
 */
async function checkRateLimit(uid: string): Promise<RateLimitResult> {
  const ref = getFirestore().collection("translateRateLimits").doc(uid);
  const now = Date.now();

  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { windowStartMs?: number; count?: number } | undefined;

    const windowStartMs = data?.windowStartMs ?? 0;
    const count = data?.count ?? 0;

    // First call ever, or the previous window has elapsed: open a fresh window.
    if (now - windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStartMs: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    // Inside the current window and already at the ceiling: reject and tell the
    // caller how long until the window rolls over.
    if (count >= RATE_LIMIT_MAX) {
      const retryAfterSeconds = Math.ceil(
        (windowStartMs + RATE_LIMIT_WINDOW_MS - now) / 1000,
      );
      return { allowed: false, retryAfterSeconds };
    }

    // Inside the window with room left: count this call and allow it.
    tx.update(ref, { count: FieldValue.increment(1) });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

// Reference the secret stored in Firebase Secret Manager.
// Set it once with: firebase functions:secrets:set ANTHROPIC_API_KEY
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * Verify the Firebase ID token in the Authorization header and confirm the
 * caller is a verified member of the allowed domain. Returns the decoded uid
 * on success, or null if the request is unauthenticated / not a member.
 *
 * This is the real access boundary: `invoker: "public"` only means the
 * platform won't reject the request, and the CORS check constrains browsers
 * only. Without this, anyone could call the endpoint directly (e.g. curl) and
 * spend the Anthropic API budget.
 */
async function verifyMember(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) return null;

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const email = (decoded.email || "").toLowerCase();
    if (!decoded.email_verified) return null;
    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

// cors middleware — allows requests from the Vercel production domain,
// any *.vercel.app preview URL, and localhost:5173 (local Vite dev).
const cors = corsLib({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === "http://localhost:5173" ||
      origin.endsWith(".vercel.app")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

/**
 * Parse the Anthropic response text into separate "original" and "translated"
 * sections.  The model is prompted to return two labeled blocks; this function
 * splits on those labels.
 */
function parseTranslationResponse(text: string): { original: string; translated: string } {
  const originalMatch = text.match(/ORIGINAL TEXT[:\s]*([\s\S]*?)(?=ENGLISH TRANSLATION|$)/i);
  const translatedMatch = text.match(/ENGLISH TRANSLATION[:\s]*([\s\S]*?)$/i);

  return {
    original: (originalMatch?.[1] ?? "").trim() || text.trim(),
    translated: (translatedMatch?.[1] ?? "").trim() || text.trim(),
  };
}

/**
 * The HTTPS Cloud Function.
 *
 * Expected POST body (JSON):
 *   { imageBase64: string, mediaType: string }
 *
 * Response (JSON):
 *   { original: string, translated: string }
 */
export const translateImage = onRequest(
  {
    secrets: [anthropicApiKey],
    invoker: "public",   // allow unauthenticated requests at the platform level

    // Pinned to Singapore rather than the us-central1 default. The caller's
    // multi-megabyte base64 image is the expensive thing on the wire, so we keep
    // the upload leg short; sending that body to Iowa instead is the whole
    // latency problem. The Anthropic call afterwards is the same distance either
    // way. The per-user rate-limit transaction below does reach the nam5
    // Firestore in the US, but it moves only a few hundred bytes and is dwarfed
    // by the image it guards, so it doesn't change the calculus.
    //
    // The sibling functions deliberately stay in us-central1: the Firestore
    // triggers must sit next to a nam5 database, and deletePhoto writes to
    // Firestore and Storage, so moving it would add a hop rather than remove one.
    region: "asia-southeast1",
  },
  (req, res) => {
    // Wrap everything in the cors middleware so preflight and actual requests
    // both get correct Access-Control-* headers before any other logic runs.
    cors(req, res, async () => {
      // Only accept POST after CORS is handled
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed. Use POST." });
        return;
      }

      // Authenticate: require a verified Firebase ID token in the allowed
      // domain before doing any work that spends the API key.
      const uid = await verifyMember(req.headers.authorization);
      if (!uid) {
        res.status(401).json({ error: "Unauthorized. Sign in to use this feature." });
        return;
      }

      // Validate request body
      const { imageBase64, mediaType } = req.body as {
        imageBase64?: string;
        mediaType?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== "string") {
        res.status(400).json({ error: "Missing required field: imageBase64" });
        return;
      }
      if (!mediaType || typeof mediaType !== "string") {
        res.status(400).json({ error: "Missing required field: mediaType" });
        return;
      }

      // Rate-limit only genuine translate attempts (checked after body
      // validation, so a client bug spraying malformed requests doesn't burn a
      // member's quota). We count every attempt that reaches the Anthropic call,
      // success or not, because the cost and abuse vector is the outbound call
      // itself, not whether the model happens to return a good result.
      let rate: RateLimitResult;
      try {
        rate = await checkRateLimit(uid);
      } catch (err) {
        // Fail closed: if the counter store is unreachable we cannot prove the
        // caller is under the limit, so refuse rather than leave the Anthropic
        // budget unguarded. This is the whole point of the check.
        logger.error("translateImage: rate-limit check failed", err);
        res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
        return;
      }
      if (!rate.allowed) {
        res.set("Retry-After", String(rate.retryAfterSeconds));
        res.status(429).json({
          error: "You've hit the translation limit for now. Please try again later.",
        });
        return;
      }

      const apiKey = anthropicApiKey.value();

      try {
        logger.info("translateImage: calling Anthropic API", { mediaType });

        const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data: imageBase64,
                    },
                  },
                  {
                    type: "text",
                    text: `Please examine this image and perform two tasks:
1. Extract all visible text exactly as it appears in the original language.
2. Translate that text into English.

Format your response with exactly these two labeled sections:

ORIGINAL TEXT:
[The exact text as it appears in the image, preserving line breaks]

ENGLISH TRANSLATION:
[The English translation of the above text]

If there is no readable text in the image, write "No text detected" under each section.`,
                  },
                ],
              },
            ],
          }),
        });

        if (!anthropicResponse.ok) {
          const errorBody = await anthropicResponse.text();
          logger.error("translateImage: Anthropic API error", {
            status: anthropicResponse.status,
            body: errorBody,
          });
          res.status(502).json({
            error: `Translation service error (${anthropicResponse.status}). Please try again.`,
          });
          return;
        }

        const anthropicData = await anthropicResponse.json() as {
          content: Array<{ type: string; text: string }>;
        };

        const responseText = anthropicData.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");

        const result = parseTranslationResponse(responseText);

        logger.info("translateImage: success");
        res.status(200).json(result);
      } catch (err) {
        logger.error("translateImage: unexpected error", err);
        res.status(500).json({
          error: "An unexpected error occurred. Please try again.",
        });
      }
    });
  }
);
