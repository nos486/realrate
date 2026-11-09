/**
 * gemini.js — Ask a Google Gemini model about one image or one audio clip (generateContent)
 *
 * Failures are GeminiError: `reason` is short (Google's status and error message, never the key
 * or the image) and is shown to admins only; `busy` marks Google being overloaded or out of quota
 * (503 / 429), when another model may still answer.
 */

export const GEMINI_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 4000;

export class GeminiError extends Error {
  constructor(reason, { status = 0, timedOut = false } = {}) {
    super(reason);
    this.name = "GeminiError";
    this.reason = reason;
    this.status = status;
    this.busy = status === 503 || status === 429;
    this.timedOut = timedOut;
    // A model Google no longer serves (to this account): another may still answer
    this.unavailable = status === 404;
  }
}

/** base64 of the image or audio bytes (chunked: String.fromCharCode takes a bounded argument list) */
export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const shortReason = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * The model's text answer about the image
 * @param {string} apiKey
 * @param {string} modelId
 * @param {{ systemPrompt: string, userText: string, imageBase64: string, mimeType: string }} req
 * @returns {Promise<string>}
 */
export function geminiDescribeImage(apiKey, modelId, req) {
  return geminiDescribeMedia(apiKey, modelId, { ...req, mediaBase64: req.imageBase64 });
}

/**
 * The model's text answer about a voice clip
 * @param {string} apiKey
 * @param {string} modelId
 * @param {{ systemPrompt: string, userText: string, audioBase64: string, mimeType: string }} req
 * @returns {Promise<string>}
 */
export function geminiDescribeAudio(apiKey, modelId, req) {
  return geminiDescribeMedia(apiKey, modelId, { ...req, mediaBase64: req.audioBase64 });
}

/**
 * The model's text answer to a text-only prompt (the news section's models)
 * @param {string} apiKey
 * @param {string} modelId
 * @param {{ systemPrompt: string, userText: string, maxTokens?: number, temperature?: number, timeoutMs?: number }} req
 * @returns {Promise<string>}
 */
export function geminiAskText(apiKey, modelId, req) {
  return geminiDescribeMedia(apiKey, modelId, { ...req, mediaBase64: "" });
}

async function geminiDescribeMedia(apiKey, modelId, req) {
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.systemPrompt }] },
          contents: [{
            role: "user",
            parts: [
              ...(req.mediaBase64 ? [{ inlineData: { mimeType: req.mimeType, data: req.mediaBase64 } }] : []),
              { text: req.userText },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: req.maxTokens || MAX_OUTPUT_TOKENS,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          },
        }),
        signal: AbortSignal.timeout(req.timeoutMs || GEMINI_TIMEOUT_MS),
      },
    );
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new GeminiError("پاسخ مدل بیش از حد طول کشید.", { timedOut: true });
    }
    throw new GeminiError(shortReason(err?.message) || "اتصال به Gemini برقرار نشد.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new GeminiError(`HTTP ${res.status}: ${shortReason(detail)}`, { status: res.status });
  }

  const body = await res.json();
  const candidate = body?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  if (!text) {
    const why = body?.promptFeedback?.blockReason || candidate?.finishReason || "empty";
    throw new GeminiError(`پاسخی برنگشت (${why}).`);
  }
  return text;
}
