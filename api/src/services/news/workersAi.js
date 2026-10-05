/**
 * workersAi.js — Ask a Workers AI text model (the `AI` binding)
 */

/**
 * A model: its id, and options of its own (e.g. reasoning_effort, response_format) added to the
 * request
 * @typedef {{ id: string, options?: object }} WorkersAiModel
 */

/**
 * The answer's text, or already-parsed JSON: older models give `response`, newer ones a chat
 * completion. A completion with no text says why (the output tokens ran out while the model was
 * still reasoning, …) instead of passing on an empty answer.
 */
export function answerOf(res) {
  if (res?.response !== undefined && res.response !== null) return res.response;
  const choice = res?.choices?.[0];
  if (!choice) return res;
  const content = choice.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error(choice.finish_reason === "length"
    ? "no answer: the output token limit ran out during the model's reasoning"
    : `no answer (finish_reason: ${choice.finish_reason || "none"})`);
}

/**
 * The model's answer
 * @param {object} env - env.AI
 * @param {WorkersAiModel} model
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ maxTokens: number, temperature?: number }} opts
 * @returns {Promise<string|object>}
 */
export async function askWorkersAi(env, model, messages, { maxTokens, temperature = 0.1 }) {
  return answerOf(await env.AI.run(model.id, { messages, max_tokens: maxTokens, temperature, ...model.options }));
}

export const hasWorkersAi = (env) => typeof env?.AI?.run === "function";
