/**
 * gemini.js — Ask a Google Gemini model about one image (generateContent)
 *
 * Failures are GeminiError: `reason` is short (Google's status and error message, never the key
 * or the image) and is shown to admins only; `busy` marks Google being overloaded or out of quota
 * (503 / 429), when another model may still answer.
 */

export const GEMINI_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 4000;

export class GeminiError extends Error {
  constructor(reason, { status = 0 } = {}) {
    super(reason);
    this.name = "GeminiError";
    this.reason = reason;
    this.status = status;
    this.busy = status === 503 || status === 429;
  }
}

/** base64 of the image bytes (chunked: String.fromCharCode takes a bounded argument list) */
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
export async function geminiDescribeImage(apiKey, modelId, req) {
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
              { inlineData: { mimeType: req.mimeType, data: req.imageBase64 } },
              { text: req.userText },
            ],
          }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    );
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new GeminiError("پاسخ مدل بیش از حد طول کشید.");
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
