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
import corsLib from "cors";

// Reference the secret stored in Firebase Secret Manager.
// Set it once with: firebase functions:secrets:set ANTHROPIC_API_KEY
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

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
  allowedHeaders: ["Content-Type"],
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
