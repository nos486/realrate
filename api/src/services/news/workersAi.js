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

/**
 * The answer's text, or already-parsed JSON: older models give `response`, newer ones a chat
 * completion (`choices`), a few a Responses-API body (`output`)
 */
export function answerOf(res) {
  if (res?.response !== undefined && res.response !== null) return res.response;
  const choice = res?.choices?.[0]?.message?.content;
  if (choice !== undefined && choice !== null) return choice;
  if (typeof res?.output_text === "string") return res.output_text;
  if (Array.isArray(res?.output)) {
    const text = res.output
      .filter((o) => o?.type === "message")
      .flatMap((o) => o.content || [])
      .map((c) => c?.text || "")
      .join("");
    if (text) return text;
  }
  return res;
}

/**
 * One model's raw reply
 * @param {object} env - env.AI
 * @param {WorkersAiModel} model
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ maxTokens: number, temperature?: number }} opts
 * @returns {Promise<{ answer: string|object, usage: object|null }>}
 */
export async function runWorkersAiModel(env, model, messages, { maxTokens, temperature = 0.1 }) {
  const res = await env.AI.run(modelId(model), {
    messages,
    max_tokens: maxTokens,
    temperature,
    ...(typeof model === "string" ? {} : model.options),
  });
  return { answer: answerOf(res), usage: res?.usage || null };
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
      const { answer } = await runWorkersAiModel(env, model, messages, { maxTokens, temperature });
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
