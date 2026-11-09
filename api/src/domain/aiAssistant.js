/**
 * aiAssistant.js — Turning the model's answer to what the user said to the AI assistant into data
 *
 * One assistant, one door (POST /api/ai/voice): the model first names the INTENT of what was said, then
 * fills that intent's data. Today the only intent is `records` (a spoken list of expenses and incomes);
 * a report, a summary or a question about the user's own spending («این ماه چقدر خوراک خرج کردم؟»)
 * is a new row in AI_INTENTS plus its prompt part and its handler in web/src/features/ai/aiIntents.js.
 * The data is encrypted and only the browser can read it, so such an intent returns a structured
 * query for the app to run on the decrypted records — never the user's data going to the server.
 *
 * Records: every item is an expense or an income
 *
 * An item is kept even when its amount was not understood (amount 0): the app shows every item for
 * the user to confirm and complete before anything is saved. Pure: every item is an expense or an income with a positive whole amount in tomans; its category
 * must be one of the user's own (the lists sent with the clip), else the fallback («سایر»); its
 * account one of the user's accounts, else none; its day a real day not after today (Tehran), else
 * today. Nothing here knows a bank, a category or an account by name.
 */

import { FALLBACK_CATEGORY } from './categoryDocument.js';
import { parseChequeScanJson } from './chequeScan.js';
import { isValidIsoDate } from './isoDate.js';

/** The intents the assistant understands (the model names one of these) */
export const AI_INTENTS = ['records'];

export const AI_VOICE_LIMITS = { items: 10, accounts: 40, nameLength: 60, titleLength: 120, maxAmount: 100_000_000_000 };

/**
 * The accounts a client sent, cleaned: `[{ id, name }]`, bounded, no duplicates
 * @param {unknown} input parsed JSON
 * @returns {Array<{ id: string, name: string }>}
 */
export function cleanAiAccounts(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const list = [];
  for (const a of input) {
    const id = String(a?.id ?? '').trim().slice(0, 60);
    const name = String(a?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, AI_VOICE_LIMITS.nameLength);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name });
    if (list.length >= AI_VOICE_LIMITS.accounts) break;
  }
  return list;
}

/**
 * Normalize the model's raw answer
 * @param {string|object|null} raw the answer text (or its parsed JSON)
 * @param {{ expense: Array<{value: string, label: string}>, income: Array<{value: string, label: string}>,
 *   accounts: Array<{id: string, name: string}>, today: string }} context the user's lists and today (YYYY-MM-DD)
 * @returns {{ understood: boolean, intent: 'records', items: Array<{ kind: 'expense'|'income', amount: number, title: string,
 *   category: string, date: string, accountId: string }> }}
 */
export function normalizeAiVoice(raw, { expense = [], income = [], accounts = [], today }) {
  const data = typeof raw === 'string' ? parseChequeScanJson(raw) : raw;
  const items = [];
  for (const row of Array.isArray(data?.items) ? data.items : []) {
    const kind = row?.kind === 'income' ? 'income' : row?.kind === 'expense' ? 'expense' : null;
    const said = Math.round(Number(String(row?.amount ?? '').replace(/[,،\s]/g, '')));
    if (!kind || said > AI_VOICE_LIMITS.maxAmount) continue;
    // An amount that was not said (or not understood) stays 0: the app asks the user for it
    const amount = Number.isFinite(said) && said > 0 ? said : 0;
    const title = String(row?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, AI_VOICE_LIMITS.titleLength);
    if (!title) continue;
    const asked = String(row?.category ?? '').trim();
    const categories = kind === 'income' ? income : expense;
    const category = (categories.find((c) => c.value === asked) || categories.find((c) => c.label === asked))?.value || FALLBACK_CATEGORY;
    const day = String(row?.date ?? '').trim();
    const date = isValidIsoDate(day) && day <= today ? day : today;
    const accountAsked = String(row?.accountId ?? '').trim();
    const accountId = (accounts.find((a) => a.id === accountAsked) || accounts.find((a) => a.name === accountAsked))?.id || '';
    items.push({ kind, amount, title, category, date, accountId });
    if (items.length >= AI_VOICE_LIMITS.items) break;
  }
  return { understood: items.length > 0 && data?.understood !== false, intent: 'records', items };
}
