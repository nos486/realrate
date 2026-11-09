/**
 * newsModel.js — Ask the news section's model, the one the admin chose (config/aiModels.js)
 *
 * The prompts are built once; this sends them to Workers AI (with the model's own options) or to Gemini
 * as text. Only the chosen model is asked: when it fails nothing falls back to another.
 */

import { GEMINI_API_KEY_SECRET } from "../../config/ai.config.js";
import { newsModelChoiceById, DEFAULT_NEWS_MODEL_CHOICE } from "../../config/aiModels.js";
import { loadAiSettings } from "../ai/aiSettings.service.js";
import { geminiAskText } from "../ai/gemini.js";
import { askWorkersAi, hasWorkersAi } from "./workersAi.js";

/**
 * The model to use now: the admin's choice, with the Workers AI `base` model (its options) for the default
 * @param {object} env
 * @param {{ id: string, label: string, options?: object }} base the Workers AI model of the feature
 * @returns {Promise<{ id: string, label: string, kind: string, available: boolean, ask: (messages: object[], opts: { maxTokens: number, temperature?: number }) => Promise<string|object> }>}
 */
export async function resolveNewsModel(env, base) {
  const { newsModel } = await loadAiSettings(env);
  const choice = newsModelChoiceById(newsModel) || newsModelChoiceById(DEFAULT_NEWS_MODEL_CHOICE);
  if (choice.kind === "gemini") {
    const key = env?.[GEMINI_API_KEY_SECRET];
    return {
      id: choice.model,
      label: choice.label,
      kind: "gemini",
      available: Boolean(key),
      ask: (messages, { maxTokens, temperature = 0 }) => geminiAskText(key, choice.model, {
        systemPrompt: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
        userText: messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n"),
        maxTokens,
        temperature,
      }),
    };
  }
  return {
    id: base.id,
    label: base.label,
    kind: "workers",
    available: hasWorkersAi(env),
    ask: (messages, opts) => askWorkersAi(env, base, messages, opts),
  };
}
