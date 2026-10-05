/**
 * workersAi.js — Ask a Workers AI text model (the `AI` binding), trying the next model on a failure
 * or an answer that isn't usable
 */

/**
 * A model to try: its id, or { id, options } with options of its own (e.g. reasoning_effort,
 * response_format) added to the request
 * @typedef {string|{ id: string, options?: object }} WorkersAiModel
 */

const modelId = (model) => (typeof model === "string" ? model : model.id);

/** The answer's text, or already-parsed JSON (older models give `response`, newer ones an OpenAI-like body) */
function answerOf(res) {
  return res?.response ?? res?.choices?.[0]?.message?.content ?? res;
}

/**
 * The first usable answer
 * @param {object} env - env.AI
 * @param {WorkersAiModel[]} models - tried in order
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ maxTokens: number, temperature?: number, accept?: (answer: string|object) => any }} opts
 *   accept: the answer as the caller uses it, or null to try the next model (e.g. broken JSON, text
 *   in the wrong language)
 * @returns {Promise<{ answer: string|object, value: any, model: string }>}
 */
export async function askWorkersAi(env, models, messages, { maxTokens, temperature = 0.1, accept = (a) => a }) {
  let lastError = null;
  for (const model of models) {
    try {
      const res = await env.AI.run(modelId(model), {
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(typeof model === "string" ? {} : model.options),
      });
      const answer = answerOf(res);
      if (!answer || (typeof answer === "string" && !answer.trim())) {
        lastError = new Error("empty answer");
        continue;
      }
      const value = accept(answer);
      if (value === null || value === undefined) {
        lastError = new Error(`unusable answer from ${modelId(model)}`);
        continue;
      }
      return { answer, value, model: modelId(model) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("no model");
}

export const hasWorkersAi = (env) => typeof env?.AI?.run === "function";
