/**
 * smsVoiceRoutes.js — Route handler for the voice note on a bank SMS (experimental)
 *
 * POST /api/sms/voice — multipart `audio` (a few seconds of speech) and `categories` (JSON
 * `[{ value, label }]`, the user's expense categories — or income categories with `kind=income`, for a deposit);
 * Whisper (Cloudflare Workers AI) writes what was said and tables read it (domain/voiceCategory.js): no language model; answers `{ understood, title, category, action, projectId }` (`action`: '' to record it, or one of `actions` — an optional JSON list of what the app offers, with `projects` `[{id,name}]`).
 * Behind the `sms_voice` feature (admins only until opened to groups) and its daily `sms_voice`
 * limit. Nothing is stored; a failed call gives its use back.
 */

import { requireFeature, hasFeature } from '../lib/features.js';
import { consumeQuota, refundQuota } from '../lib/usageQuota.js';
import { processSmsVoice } from '../services/ai/smsVoice.service.js';
import { cleanVoiceCategories, cleanVoiceActions } from '../domain/smsVoice.js';
import { cleanAiAccounts } from '../domain/aiAssistant.js';
import { jsonResponse } from '../lib/helpers.js';
import { AppError } from '../lib/AppError.js';

const MAX_AUDIO_BYTES = 1024 * 1024; // 1 MB: well over 30 s of speech
const MAX_FORM_BYTES = MAX_AUDIO_BYTES + 64 * 1024;

/** What the browsers' recorders make: the declared type (without `;codecs=`) → a check of the first bytes */
const SIGNATURES = {
  'audio/webm': (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  'audio/ogg': (b) => String.fromCharCode(...b.slice(0, 4)) === 'OggS',
  'audio/mp4': (b) => String.fromCharCode(...b.slice(4, 8)) === 'ftyp',
  'audio/wav': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF',
};
const ALIASES = { 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'video/webm': 'audio/webm', 'video/mp4': 'audio/mp4' };

/** The clip's plain type when its bytes are what it says, else null */
async function audioType(file) {
  const declared = String(file.type || '').split(';')[0].trim().toLowerCase();
  const type = ALIASES[declared] || declared;
  const check = SIGNATURES[type];
  if (!check) return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return check(bytes) ? type : null;
}

/**
 * The multipart form of a voice request, with its clip checked (size, and the bytes match the type)
 * @returns {Promise<{ formData: FormData, audio: File, mimeType: string }>}
 */
export async function readVoiceForm(request) {
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
    throw AppError.badRequest('درخواست باید شامل فرم چندبخشی (multipart/form-data) باشد.');
  }
  if (Number(request.headers.get('content-length')) > MAX_FORM_BYTES) {
    throw new AppError('حجم صدا بیش از حد مجاز است.', 413, 'PAYLOAD_TOO_LARGE');
  }
  let formData;
  try {
    formData = await request.formData();
  } catch {
    throw AppError.badRequest('خطا در پردازش فرم چندبخشی ارسالی.');
  }
  const audio = formData.get('audio');
  if (!audio || typeof audio === 'string' || !audio.size) throw AppError.badRequest('ارسال فایل صدا الزامی است.');
  if (audio.size > MAX_AUDIO_BYTES) throw new AppError('حجم صدا بیش از حد مجاز است.', 413, 'PAYLOAD_TOO_LARGE');
  const mimeType = await audioType(audio);
  if (!mimeType) throw new AppError('فرمت صدا نامعتبر است.', 400, 'INVALID_FILE_TYPE');
  return { formData, audio, mimeType };
}

/** POST /api/sms/voice */
export async function handleSmsVoiceRoute(request, env) {
  const user = await requireFeature(request, env, 'sms_voice');
  const { formData, audio } = await readVoiceForm(request);

  let categories = [];
  try {
    categories = cleanVoiceCategories(JSON.parse(String(formData.get('categories') || '[]')));
  } catch {
    throw AppError.badRequest('فهرست دسته‌ها نامعتبر است.');
  }

  // What else the note may ask for (the app offers only what fits the message) and the user's projects
  let actions = [];
  let projects = [];
  try {
    actions = cleanVoiceActions(JSON.parse(String(formData.get('actions') || '[]')));
    projects = cleanAiAccounts(JSON.parse(String(formData.get('projects') || '[]')));
  } catch {
    throw AppError.badRequest('فهرست کارهای پیشنهادی نامعتبر است.');
  }

  const debug = await hasFeature(env, user, 'cheque_scan_debug');
  const quota = await consumeQuota(env, user, 'sms_voice');

  let result;
  try {
    result = await processSmsVoice(env, { audioBuffer: await audio.arrayBuffer(), categories, kind: formData.get('kind') === 'income' ? 'income' : 'expense', actions, projects, debug });
  } catch (err) {
    await refundQuota(env, user, 'sms_voice');
    throw err;
  }
  if (!result.understood) await refundQuota(env, user, 'sms_voice');
  return jsonResponse({ success: true, ...result, quota }, 200, request);
}
