/**
 * aiAssistant.js — Turning the model's answer to what the user said to the AI assistant into data
 *
 * One assistant, one door (POST /api/ai/voice): the model first names the INTENT of what was said, then
 * fills that intent's data. Intents: `records` (a spoken list of expenses and incomes), `edit` (change or
 * delete one record already saved: «آخرین هزینه‌ام را ۳۰۰ هزار کن»; the model names it and the change, the app
 * finds the record on the device and asks which one when several fit), `create` (a new cheque or subscription:
 * the model fills the type's fields, the app shows them as a form to complete and saves) and `question`
 * («این ماه چقدر خوراک خرج کردم؟ با پارسال مقایسه کن»: one to three plain Persian questions in the words
 * web/src/features/reports/askQuery.js reads). A new capability is a new row in AI_INTENTS plus its prompt
 * part (services/ai/assistant.service.js) and its handler in web/src/features/ai/aiIntents.js.
 * The data is encrypted and only the browser can read it, so a question is only REWRITTEN here; the app
 * answers it on the decrypted records — never the user's data going to the server.
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
export const AI_INTENTS = ['records', 'question', 'edit', 'create'];

/** The things `create` can make (web/src/features/ai/aiCreate.js has the matching form) */
export const AI_CREATE_TYPES = ['cheque', 'subscription'];
export const SUBSCRIPTION_CYCLES = [1, 3, 6, 12];

export const AI_VOICE_LIMITS = { questions: 3, questionLength: 120, items: 10, accounts: 40, nameLength: 60, titleLength: 120, maxAmount: 100_000_000_000 };

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

const cleanText = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
const pastDay = (value, today) => (isValidIsoDate(String(value ?? '').trim()) && String(value).trim() <= today ? String(value).trim() : '');

/** The `edit` intent: which record (the latest, or one found by a word and/or a day) and what changes */
function normalizeEdit(data, { expense, income, accounts, today }) {
  const kind = data.kind === 'income' ? 'income' : data.kind === 'expense' ? 'expense' : '';
  const op = data.op === 'delete' ? 'delete' : 'update';
  const target = {
    which: data.target?.which === 'last' ? 'last' : 'search',
    text: cleanText(data.target?.text, AI_VOICE_LIMITS.nameLength),
    date: pastDay(data.target?.date, today),
  };
  const changes = {};
  if (op === 'update') {
    const c = data.changes || {};
    const amount = Math.round(Number(String(c.amount ?? '').replace(/[,،\s]/g, '')));
    if (Number.isFinite(amount) && amount > 0 && amount <= AI_VOICE_LIMITS.maxAmount) changes.amount = amount;
    const title = cleanText(c.title, AI_VOICE_LIMITS.titleLength);
    if (title) changes.title = title;
    const categories = kind === 'income' ? income : expense;
    const category = (categories.find((x) => x.value === String(c.category ?? '').trim()) || categories.find((x) => x.label === String(c.category ?? '').trim()))?.value;
    if (category) changes.category = category;
    const date = pastDay(c.date, today);
    if (date) changes.date = date;
    const asked = String(c.accountId ?? '').trim();
    const accountId = (accounts.find((a) => a.id === asked) || accounts.find((a) => a.name === asked))?.id;
    if (accountId) changes.accountId = accountId;
  }
  const found = target.which === 'last' || target.text || target.date;
  const understood = Boolean(found) && (op === 'delete' || Object.keys(changes).length > 0) && data.understood !== false;
  return { understood, intent: 'edit', op, kind, target, changes };
}

const wholeAmount = (value) => {
  const amount = Math.round(Number(String(value ?? '').replace(/[,،\s]/g, '')));
  return Number.isFinite(amount) && amount > 0 && amount <= AI_VOICE_LIMITS.maxAmount ? amount : 0;
};
const anyDay = (value, fallback) => (isValidIsoDate(String(value ?? '').trim()) ? String(value).trim() : fallback);

/**
 * The `create` intent: the fields of a new cheque or subscription. A missing amount stays 0 (the app asks),
 * a missing day is today, and the user checks everything in the form before it is saved.
 */
function normalizeCreate(data, { accounts, today }) {
  const type = AI_CREATE_TYPES.includes(data.type) ? data.type : '';
  const d = data.data || {};
  const asked = String(d.accountId ?? '').trim();
  const accountId = (accounts.find((a) => a.id === asked) || accounts.find((a) => a.name === asked))?.id || '';
  if (type === 'cheque') {
    const counterparty = cleanText(d.counterparty, AI_VOICE_LIMITS.nameLength);
    return {
      understood: Boolean(counterparty) && data.understood !== false,
      intent: 'create',
      type,
      data: {
        direction: d.direction === 'issued' ? 'issued' : 'received',
        counterparty,
        amount: wholeAmount(d.amount),
        dueDate: anyDay(d.dueDate, today),
        bankName: cleanText(d.bankName, AI_VOICE_LIMITS.nameLength),
        chequeNumber: String(d.chequeNumber ?? '').replace(/\D/g, '').slice(0, 20),
        accountId,
        notes: cleanText(d.notes, 200),
      },
    };
  }
  if (type === 'subscription') {
    const name = cleanText(d.name, AI_VOICE_LIMITS.nameLength);
    const cycle = Number(d.cycleMonths);
    return {
      understood: Boolean(name) && data.understood !== false,
      intent: 'create',
      type,
      data: {
        name,
        amount: wholeAmount(d.amount),
        cycleMonths: SUBSCRIPTION_CYCLES.includes(cycle) ? cycle : 1,
        startDate: anyDay(d.startDate, today),
        autoRenew: d.autoRenew !== false,
        accountId,
      },
    };
  }
  return { understood: false, intent: 'create', type: '', data: {} };
}

/**
 * Normalize the model's raw answer
 * @param {string|object|null} raw the answer text (or its parsed JSON)
 * @param {{ expense: Array<{value: string, label: string}>, income: Array<{value: string, label: string}>,
 *   accounts: Array<{id: string, name: string}>, today: string }} context the user's lists and today (YYYY-MM-DD)
 * @returns {{ understood: boolean, intent: 'records'|'question', questions?: string[], items?: Array<{ kind: 'expense'|'income', amount: number, title: string,
 *   category: string, date: string, accountId: string }> }}
 */
export function normalizeAiVoice(raw, { expense = [], income = [], accounts = [], today }) {
  const data = typeof raw === 'string' ? parseChequeScanJson(raw) : raw;
  if (data?.intent === 'edit') return normalizeEdit(data, { expense, income, accounts, today });
  if (data?.intent === 'create') return normalizeCreate(data, { accounts, today });
  if (data?.intent === 'question') {
    const questions = (Array.isArray(data.questions) ? data.questions : [])
      .map((q) => String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, AI_VOICE_LIMITS.questionLength))
      .filter(Boolean)
      .slice(0, AI_VOICE_LIMITS.questions);
    return { understood: questions.length > 0 && data.understood !== false, intent: 'question', questions };
  }
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
