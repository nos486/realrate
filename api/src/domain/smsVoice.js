/**
 * smsVoice.js — Turning the model's answer to a voice note into an expense's title and category
 *
 * Pure: the category must be one of the user's own (the list sent with the voice note), else the
 * fallback category ("other" / «سایر»). Nothing here knows an asset, a bank or a category by name.
 */

import { FALLBACK_CATEGORY } from './categoryDocument.js';
import { parseChequeScanJson } from './chequeScan.js';

export const SMS_VOICE_LIMITS = { titleLength: 120, categories: 80, labelLength: 40 };

/**
 * The categories a client sent, cleaned: `[{ value, label }]`, bounded, no duplicates
 * @param {unknown} input parsed JSON
 * @returns {Array<{ value: string, label: string }>}
 */
export function cleanVoiceCategories(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const list = [];
  for (const c of input) {
    const value = String(c?.value ?? '').trim().slice(0, 40);
    const label = String(c?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, SMS_VOICE_LIMITS.labelLength);
    if (!value || !label || seen.has(value)) continue;
    seen.add(value);
    list.push({ value, label });
    if (list.length >= SMS_VOICE_LIMITS.categories) break;
  }
  return list;
}

/**
 * Normalize the model's raw answer
 * @param {string|object|null} raw the answer text (or its parsed JSON)
 * @param {Array<{ value: string, label: string }>} categories the user's categories
 * @returns {{ understood: boolean, title: string, category: string }} `understood: false` when
 *   nothing usable was said (no title); `category` is always one of `categories` or the fallback
 */
export function normalizeSmsVoice(raw, categories = []) {
  const data = typeof raw === 'string' ? parseChequeScanJson(raw) : raw;
  const title = String(data?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, SMS_VOICE_LIMITS.titleLength);
  const asked = String(data?.category ?? '').trim();
  const byValue = categories.find((c) => c.value === asked);
  // The model may answer with the label instead of the key
  const byLabel = byValue || categories.find((c) => c.label === asked);
  return {
    understood: Boolean(title) && data?.understood !== false,
    title,
    category: byLabel ? byLabel.value : FALLBACK_CATEGORY,
  };
}
