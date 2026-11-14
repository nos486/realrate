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
 * What a voice note on a bank message can ask for besides recording it as it is. The app sends the
 * ones that make sense for the message (e.g. `transfer` only with two accounts); each opens the
 * same flow as the message's button, so the user confirms there.
 *   transfer: between the user's own accounts · project: an expense of a project (`projectId`)
 *   loan: a deposit that is a received loan · share: a deposit that is a friend's share
 *   credit_settle: a withdrawal that pays a credit account's debt
 */
export const SMS_VOICE_ACTIONS = ['transfer', 'project', 'loan', 'share', 'credit_settle'];

/** The actions a client asked to be offered, cleaned to the known ones */
export function cleanVoiceActions(input) {
  return Array.isArray(input) ? [...new Set(input.filter((a) => SMS_VOICE_ACTIONS.includes(a)))] : [];
}

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
 * @param {{ actions?: string[], projects?: Array<{ id: string, name: string }> }} [offered] the actions the
 *   app offered and the user's open projects (by id or name)
 * @returns {{ understood: boolean, title: string, category: string, action: string, projectId: string }}
 *   `understood: false` when nothing usable was said (no title, and no action); `category` is always one of
 *   `categories` or the fallback; `action` is '' (record it as it is) or one of the offered ones
 */
export function normalizeSmsVoice(raw, categories = [], { actions = [], projects = [] } = {}) {
  const data = typeof raw === 'string' ? parseChequeScanJson(raw) : raw;
  const title = String(data?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, SMS_VOICE_LIMITS.titleLength);
  const asked = String(data?.category ?? '').trim();
  const byValue = categories.find((c) => c.value === asked);
  // The model may answer with the label instead of the key
  const byLabel = byValue || categories.find((c) => c.label === asked);
  const asAction = String(data?.action ?? '').trim();
  const action = actions.includes(asAction) ? asAction : '';
  const askedProject = String(data?.projectId ?? '').trim();
  const projectId = action === 'project' ? (projects.find((p) => p.id === askedProject) || projects.find((p) => p.name === askedProject))?.id || '' : '';
  return {
    understood: (Boolean(title) || Boolean(action)) && data?.understood !== false,
    title,
    category: byLabel ? byLabel.value : FALLBACK_CATEGORY,
    action,
    projectId,
  };
}
