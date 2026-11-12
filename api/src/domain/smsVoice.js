/**
 * smsVoice.js — The request side of a voice note on a bank SMS: its limits, offered actions and category list
 *
 * Pure. The note itself is read by voiceCategory.js (`parseSmsVoice`): the category is always one of
 * the user's own (the list sent with the voice note), else the fallback category ("other" / «سایر»).
 */

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
