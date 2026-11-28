/**
 * newsModel.js — Ask the news section's model, the one the admin chose (config/aiModels.js)
 *
 * The prompts are built once; this sends them to Workers AI (with the model's own options) or to Gemini
 * as text. The chosen model is asked first; when it fails the other available ones are tried in turn,
 * and only when all fail does the error go up.
 */

import { GEMINI_API_KEY_SECRET } from "../../config/ai.config.js";
import { newsModelChoiceById, newsModelFallbackOrder, DEFAULT_NEWS_MODEL_CHOICE } from "../../config/aiModels.js";
import { loadAiSettings } from "../ai/aiSettings.service.js";
import { geminiAskText } from "../ai/gemini.js";
import { logger } from "../../lib/logger.js";
import { askWorkersAi, hasWorkersAi } from "./workersAi.js";

/** The options a Workers AI choice is asked with: the feature's, minus reasoning ones for a model that doesn't reason */
function workersOptions(choice, base) {
  const { reasoning_effort: effort, ...rest } = base.options || {};
  return choice.reasoning && effort !== undefined ? { ...rest, reasoning_effort: effort } : rest;
}

/**
 * The models to use now, the admin's choice first and then every other available one, cheapest first
 * (config/aiModels.js), so a model that fails (retired: 5028, over capacity, an unreadable request) never stops the run
 * @param {object} env
 * @param {{ id: string, label: string, options?: object }} base the feature's Workers AI options
 * @returns {Promise<{ id: string, label: string, kind: string, available: boolean, used: () => string, ask: (messages: object[], opts: { maxTokens: number, temperature?: number }) => Promise<string|object> }>}
 */
export async function resolveNewsModel(env, base) {
  const { newsModel } = await loadAiSettings(env);
  const first = newsModelChoiceById(newsModel) || newsModelChoiceById(DEFAULT_NEWS_MODEL_CHOICE);
  const key = env?.[GEMINI_API_KEY_SECRET];
  const chain = newsModelFallbackOrder(first.id)
    .filter((c) => (c.kind === "gemini" ? Boolean(key) : hasWorkersAi(env)))
    .map((c) => c.kind === "gemini"
      ? {
          id: c.model,
          label: c.label,
          ask: (messages, { maxTokens, temperature = 0 }) => geminiAskText(key, c.model, {
            systemPrompt: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
            userText: messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n"),
            maxTokens,
            temperature,
          }),
        }
      : {
          id: c.model,
          label: c.label,
          ask: (messages, opts) => askWorkersAi(env, { id: c.model, options: workersOptions(c, base) }, messages, opts),
        });
  let used = chain[0]?.id || first.model || first.id;
  return {
    id: chain[0]?.id || first.model || first.id,
    label: chain[0]?.label || first.label,
    kind: first.kind,
    available: chain.length > 0,
    /** The model that answered last (the chosen one unless it failed) */
    used: () => used,
    async ask(messages, opts) {
      let firstError;
      for (const m of chain) {
        try {
          const answer = await m.ask(messages, opts);
          used = m.id;
          if (firstError) logger.warn("[News] the chosen model failed — another answered", { failed: chain[0].id, used: m.id, error: String(firstError?.message || firstError).slice(0, 200) });
          return answer;
        } catch (err) {
          firstError ??= err;
        }
      }
      throw firstError;
    },
  };
}
