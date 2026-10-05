/**
 * workersAi.js — Ask a Workers AI text model (the `AI` binding), trying the next model on a failure
 */

/**
 * The model's answer: text, or already-parsed JSON (Workers AI gives `response`; some models an
 * OpenAI-like body)
 * @param {object} env - env.AI
 * @param {string[]} models - tried in order
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ maxTokens: number, temperature?: number }} opts
 * @returns {Promise<{ answer: string|object, model: string }>}
 */
export async function askWorkersAi(env, models, messages, { maxTokens, temperature = 0.1 }) {
  let lastError = null;
  for (const model of models) {
    try {
      const res = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature });
      const answer = res?.response ?? res?.choices?.[0]?.message?.content ?? res;
      if (answer && (typeof answer !== "string" || answer.trim())) return { answer, model };
      lastError = new Error("empty answer");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("no model");
}

export const hasWorkersAi = (env) => typeof env?.AI?.run === "function";
