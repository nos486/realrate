/**
 * workersAi.js — Ask a Workers AI text model (the `AI` binding)
 */

/**
 * A model: its id, and options of its own (e.g. reasoning_effort, response_format) added to the
 * request
 * @typedef {{ id: string, options?: object }} WorkersAiModel
 */

/** The answer's text, or already-parsed JSON: older models give `response`, newer ones a chat completion */
export function answerOf(res) {
  if (res?.response !== undefined && res.response !== null) return res.response;
  return res?.choices?.[0]?.message?.content ?? res;
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
