/**
 * visionProviders.js — Ask a vision model about one image, whichever provider hosts it
 *
 * Every provider takes the same request (a system prompt, a user text, one base64 image, the JSON
 * schema wanted back) and returns the model's answer as text (or an already-parsed object, when
 * Workers AI parses it), so the cheque scan doesn't care which one ran.
 *
 * Failures are VisionProviderError: `reason` is short and safe to show an admin (the provider's
 * status and error message; never the key or the image).
 */

import Anthropic from "@anthropic-ai/sdk";
import { AI_PROVIDER_SECRETS } from "../../config/ai.config.js";
import { logger } from "../../lib/logger.js";

export const AI_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 4000;

export class VisionProviderError extends Error {
  constructor(reason, { timeout = false } = {}) {
    super(reason);
    this.name = "VisionProviderError";
    this.reason = reason;
    this.timeout = timeout;
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

/** fetch with the scan's timeout */
async function fetchWithTimeout(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new VisionProviderError("پاسخ مدل بیش از حد طول کشید.", { timeout: true });
    }
    throw new VisionProviderError(shortReason(err?.message) || "اتصال به سرویس برقرار نشد.");
  }
}

/** The body of a failed HTTP response, as a short reason */
async function httpFailure(res) {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || JSON.stringify(body);
  } catch {
    detail = await res.text().catch(() => "");
  }
  return new VisionProviderError(`HTTP ${res.status}: ${shortReason(detail)}`);
}

// ── Workers AI (the Worker's AI binding) ───────────────────────────────────────

async function runWorkersAi(env, model, req) {
  const payload = {
    messages: [
      { role: "system", content: req.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: req.userText },
          { type: "image_url", image_url: { url: `data:${req.mimeType};base64,${req.imageBase64}` } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: model.maxTokens || 1000,
  };
  const timeoutMs = model.timeoutMs || AI_TIMEOUT_MS;
  const run = async (body) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new VisionProviderError("پاسخ مدل بیش از حد طول کشید.", { timeout: true })), timeoutMs);
    });
    try {
      return await Promise.race([env.AI.run(model.id, body), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  let out;
  try {
    // JSON mode first; a model that doesn't take it with an image gets the plain request
    try {
      out = await run({ ...payload, response_format: { type: "json_schema", json_schema: req.jsonSchema } });
    } catch (err) {
      if (err instanceof VisionProviderError && err.timeout) throw err;
      logger.warn("[Vision] Workers AI refused JSON mode, retrying without it:", { model: model.id, error: err.message });
      out = await run(payload);
    }
  } catch (err) {
    if (err instanceof VisionProviderError) throw err;
    throw new VisionProviderError(shortReason(err?.message) || "Workers AI error");
  }

  if (typeof out === "string") return out;
  if (typeof out?.response === "string") return out.response;
  if (out?.response && typeof out.response === "object") return out.response;
  if (out?.choices?.[0]?.message?.content) return out.choices[0].message.content;
  return out ?? "";
}

// ── Google Gemini (generateContent) ────────────────────────────────────────────

async function runGemini(env, model, req, apiKey) {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`,
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
    },
  );
  if (!res.ok) throw await httpFailure(res);
  const body = await res.json();
  const candidate = body?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  if (!text) {
    const why = body?.promptFeedback?.blockReason || candidate?.finishReason || "empty";
    throw new VisionProviderError(`پاسخی برنگشت (${why}).`);
  }
  return text;
}

// ── Anthropic Claude (official SDK) ────────────────────────────────────────────

async function runAnthropic(env, model, req, apiKey) {
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  let response;
  try {
    response = await client.messages.create({
      model: model.id,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: req.systemPrompt,
      // Reading one cheque needs little reasoning (Haiku 4.5 takes no effort setting)
      ...(model.id.startsWith("claude-haiku") ? {} : { output_config: { effort: "low" } }),
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: req.mimeType, data: req.imageBase64 } },
          { type: "text", text: req.userText },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new VisionProviderError("پاسخ مدل بیش از حد طول کشید.", { timeout: true });
    }
    if (err instanceof Anthropic.APIError) {
      throw new VisionProviderError(`HTTP ${err.status ?? "-"}: ${shortReason(err.message)}`);
    }
    throw new VisionProviderError(shortReason(err?.message) || "Anthropic error");
  }
  if (response.stop_reason === "refusal") {
    throw new VisionProviderError("مدل از پاسخ دادن خودداری کرد.");
  }
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// ── OpenAI (Chat Completions) ──────────────────────────────────────────────────

async function runOpenAi(env, model, req, apiKey) {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: "system", content: req.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: req.userText },
            { type: "image_url", image_url: { url: `data:${req.mimeType};base64,${req.imageBase64}`, detail: "high" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!res.ok) throw await httpFailure(res);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new VisionProviderError(`پاسخی برنگشت (${body?.choices?.[0]?.finish_reason || "empty"}).`);
  return text;
}

const RUNNERS = {
  "workers-ai": runWorkersAi,
  gemini: runGemini,
  anthropic: runAnthropic,
  openai: runOpenAi,
};

/**
 * Ask `model` (a CHEQUE_SCAN_MODELS entry) about one image
 * @param {object} env
 * @param {object} model
 * @param {{ systemPrompt: string, userText: string, imageBase64: string, mimeType: string, jsonSchema: object }} req
 * @returns {Promise<string|object>} the model's answer
 */
export async function runVisionModel(env, model, req) {
  const runner = RUNNERS[model.provider];
  if (!runner) throw new VisionProviderError(`Unknown provider ${model.provider}`);
  const apiKey = model.provider === "workers-ai" ? null : env[AI_PROVIDER_SECRETS[model.provider]];
  return runner(env, model, req, apiKey);
}
