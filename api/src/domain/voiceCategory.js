/**
 * voiceCategory.js — Finding an expense's category (and what else it asks for) from the words said
 *
 * Pure and model-free: the quick voice note on a bank SMS is only transcribed, then this reads the
 * text. The category is picked among the user's own, by (1) the names of their custom categories,
 * (2) the word table of config/voiceCategoryWords.js for the built-in keys, (3) the names of the
 * built-in ones. Nothing matches → the fallback («سایر»). Persian is normalized (ی ک ه, digits kept,
 * half-space as a space) and the usual endings are accepted, so «پیتزاها» and «کافه‌ای» match.
 * Runs in both the Worker and the browser.
 */

import { FALLBACK_CATEGORY } from './categoryDocument.js';
import { EXPENSE_WORDS, INCOME_WORDS, ACTION_WORDS, LABEL_STOP_WORDS } from '../config/voiceCategoryWords.js';

export const VOICE_TITLE_LENGTH = 120;

/** Endings a word may carry and still be the word (plural, "-y", possessive, Latin plural) */
const SUFFIXES = new Set(['', 'ی', 'ه', 'ها', 'های', 'ای', 'ام', 'م', 'مو', 'مون', 'رو', 's', 'es', 'ing']);

/** Lowercase, unify Arabic/Persian letter forms, drop marks, punctuation and the half-space: words split by spaces */
export function normalizeVoiceText(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةہۀ]/g, 'ه')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[‌‍‏‎]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const words = (text) => (text ? text.split(' ') : []);

/** Does `token` equal `word` with an allowed ending? (a one-letter word must match exactly) */
const tokenMatches = (token, word) => token === word || (word.length >= 2 && token.startsWith(word) && SUFFIXES.has(token.slice(word.length)));

/** Position of the phrase (`phrase`: normalized words) in `tokens`, or -1; the last word may carry an ending */
function find(tokens, phrase) {
  const n = phrase.length;
  for (let i = 0; i + n <= tokens.length; i += 1) {
    let ok = true;
    for (let j = 0; j < n; j += 1) {
      if (j < n - 1 ? tokens[i + j] !== phrase[j] : !tokenMatches(tokens[i + j], phrase[j])) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

const LABEL_STOP = new Set(LABEL_STOP_WORDS.map(normalizeVoiceText).flatMap((w) => words(w)));

/** A table compiled once: `[{ key, entries: [{ phrase, size }] }]`, where a phrase also gets its joined spelling («کافی شاپ» → «کافیشاپ») */
function compile(table) {
  return Object.entries(table).map(([key, list]) => {
    const entries = [];
    for (const raw of list) {
      const phrase = words(normalizeVoiceText(raw));
      if (!phrase.length) continue;
      entries.push({ phrase, size: phrase.length });
      if (phrase.length > 1) entries.push({ phrase: [phrase.join('')], size: phrase.length });
    }
    return { key, entries };
  });
}

const compiled = {
  expense: compile(EXPENSE_WORDS),
  income: compile(INCOME_WORDS),
  actions: compile(ACTION_WORDS),
};

/** Best match of a table's entries in the tokens: the biggest phrase wins */
function bestSize(tokens, entries) {
  let best = 0;
  for (const { phrase, size } of entries) if (size > best && find(tokens, phrase) >= 0) best = size;
  return best;
}

/** Tokens of a category's name that say something (no filler, at least three letters) */
const labelTokens = (label) => words(normalizeVoiceText(label)).filter((w) => w.length >= 3 && !LABEL_STOP.has(w));

/**
 * The category key for the words said
 * @param {string} text what was said
 * @param {Array<{ value: string, label: string }>} categories the user's categories of the kind
 * @param {'expense'|'income'} [kind]
 * @returns {string} one of `categories` values, or the fallback
 */
export function matchVoiceCategory(text, categories = [], kind = 'expense') {
  const tokens = words(normalizeVoiceText(text));
  if (!tokens.length) return FALLBACK_CATEGORY;
  const have = new Map(categories.map((c) => [c.value, c]));
  const scores = []; // { value, tier, size, order }
  let order = 0;

  // The user's own categories (c_…) by their names: they named it, so it wins
  for (const c of categories) {
    if (!c.value.startsWith('c_')) continue;
    const labelWords = words(normalizeVoiceText(c.label));
    const whole = labelWords.length > 1 && find(tokens, labelWords) >= 0;
    const part = labelTokens(c.label).filter((w) => find(tokens, [w]) >= 0).length;
    if (whole || part) scores.push({ value: c.value, tier: 3, size: whole ? labelWords.length : part, order: order++ });
  }
  // The word table, for the built-in keys the user still has
  for (const { key, entries } of compiled[kind === 'income' ? 'income' : 'expense']) {
    if (!have.has(key)) continue;
    const size = bestSize(tokens, entries);
    if (size) scores.push({ value: key, tier: 2, size, order: order++ });
  }
  // The names of the built-in ones (renamed or not), weakest
  for (const c of categories) {
    if (c.value.startsWith('c_') || c.value === FALLBACK_CATEGORY) continue;
    const part = labelTokens(c.label).filter((w) => find(tokens, [w]) >= 0).length;
    if (part) scores.push({ value: c.value, tier: 1, size: part, order: order++ });
  }
  scores.sort((a, b) => b.tier - a.tier || b.size - a.size || a.order - b.order);
  return scores[0]?.value ?? FALLBACK_CATEGORY;
}

/**
 * Which of the offered actions the words ask for (the first listed in the table that matches), and the project when it is one
 * @param {string} text
 * @param {string[]} actions the actions the app offered
 * @param {Array<{ id: string, name: string }>} projects the user's open projects
 * @returns {{ action: string, projectId: string }} `action` '' when the note only describes the expense
 */
export function matchVoiceAction(text, actions = [], projects = []) {
  const tokens = words(normalizeVoiceText(text));
  if (!tokens.length || !actions.length) return { action: '', projectId: '' };
  // A project is named by its own name together with the word "project"
  if (actions.includes('project')) {
    const says = compiled.actions.find((a) => a.key === 'project');
    if (says && bestSize(tokens, says.entries)) {
      const named = projects
        .map((p) => ({ p, size: words(normalizeVoiceText(p.name)).filter((w) => w.length >= 2 && !LABEL_STOP.has(w) && find(tokens, [w]) >= 0).length }))
        .filter((m) => m.size)
        .sort((a, b) => b.size - a.size)[0];
      return { action: 'project', projectId: named?.p.id || '' };
    }
  }
  let best = { action: '', size: 0 };
  for (const { key, entries } of compiled.actions) {
    if (key === 'project' || !actions.includes(key)) continue;
    const size = bestSize(tokens, entries);
    if (size > best.size) best = { action: key, size };
  }
  return { action: best.action, projectId: '' };
}

/** The title: what was said, cleaned (no trailing punctuation, one space between words, bounded) */
export function cleanVoiceTitle(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/^[\s.,،؛;:!؟?…-]+|[\s.,،؛;:!؟?…-]+$/gu, '').slice(0, VOICE_TITLE_LENGTH).trim();
}

/**
 * Read a voice note on a bank message: the title is the words said, the category and the action come from the tables
 * @param {string} heard the transcript
 * @param {Array<{ value: string, label: string }>} categories the user's categories of the kind
 * @param {{ kind?: 'expense'|'income', actions?: string[], projects?: Array<{ id: string, name: string }> }} [options]
 * @returns {{ understood: boolean, title: string, category: string, action: string, projectId: string }}
 */
export function parseSmsVoice(heard, categories = [], { kind = 'expense', actions = [], projects = [] } = {}) {
  const title = cleanVoiceTitle(heard);
  if (!title) return { understood: false, title: '', category: FALLBACK_CATEGORY, action: '', projectId: '' };
  const { action, projectId } = matchVoiceAction(title, actions, projects);
  return { understood: true, title, category: matchVoiceCategory(title, categories, kind), action, projectId };
}
