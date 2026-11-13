/**
 * voiceEngines.js — The engines that can understand a voice note on a bank SMS
 *
 * `auto` is what everyone gets: Gemini, trying the models of config/ai.config.js in turn. The others
 * run ONE engine so they can be compared: the admin picks one in the site settings (the assistant and
 * dictation use it; the quick note on a bank SMS always uses SMS_STT_ENGINE). A `gemini` engine hears the clip
 * itself; a `workers` engine is Cloudflare Workers AI: a speech-to-text model writes what was said,
 * then the news section's GLM model (config/news.config.js) picks the title and category from the
 * text. `input` is how the speech model wants the audio: `base64` or `bytes` (an array of numbers); `language` and `task` are told to
 * the speech model when it takes them (Persian and "transcribe": it must not guess another language or translate).
 * Shared with the web app through a symlink.
 */

export const DEFAULT_VOICE_ENGINE = "auto";

export const VOICE_ENGINES = [
  { id: "auto", label: "خودکار (Gemini، با جایگزین)", kind: "chain" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", kind: "gemini", model: "gemini-3.5-flash-lite" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", kind: "gemini", model: "gemini-3.6-flash" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", kind: "gemini", model: "gemini-3.8-flash" },
  { id: "cf-whisper-turbo", label: "Cloudflare: Whisper Large v3 Turbo + GLM", kind: "workers", stt: "@cf/openai/whisper-large-v3-turbo", input: "base64", language: "fa", task: "transcribe" },
  { id: "cf-whisper", label: "Cloudflare: Whisper + GLM", kind: "workers", stt: "@cf/openai/whisper", input: "bytes" },
];

/** The engine of the quick voice note on a bank SMS: only the speech model runs (no GLM), the words are read by tables */
export const SMS_STT_ENGINE = "cf-whisper-turbo";

/** The engine with this id, or null */
export const voiceEngineById = (id) => VOICE_ENGINES.find((e) => e.id === id) || null;
