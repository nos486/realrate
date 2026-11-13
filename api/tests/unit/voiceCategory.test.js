/**
 * voiceCategory.test.js — Reading the words of a voice note: the category from the word table and the
 * user's own category names, the title, and the offered actions
 */

import { describe, it, expect } from 'vitest';
import { isForeignScript, normalizeVoiceText, matchVoiceCategory, matchVoiceAction, cleanVoiceTitle, parseSmsVoice } from '../../src/domain/voiceCategory.js';
import { BUILTIN_CATEGORIES } from '../../src/domain/categoryDocument.js';
import { EXPENSE_WORDS, INCOME_WORDS, ACTION_WORDS } from '../../src/config/voiceCategoryWords.js';

const builtin = (kind) => BUILTIN_CATEGORIES[kind].filter((c) => !c.hidden && !c.retired).map(({ value, label }) => ({ value, label }));
const EXPENSE = builtin('expense');
const INCOME = builtin('income');
const pick = (text, kind = 'expense') => matchVoiceCategory(text, kind === 'income' ? INCOME : EXPENSE, kind);

describe('normalizeVoiceText', () => {
  it('unifies Arabic letters, drops marks and the half-space', () => {
    expect(normalizeVoiceText('كافي‌شاپ!')).toBe('کافی شاپ');
    expect(normalizeVoiceText('  Pizza,   Hut ')).toBe('pizza hut');
  });
});

describe('matchVoiceCategory (expenses)', () => {
  it.each([
    ['پیتزا', 'dining'], ['قهوه', 'dining'], ['کافی شاپ', 'dining'], ['کافیشاپ', 'dining'], ['ناهار با دوستان', 'dining'], ['اسنپ فود', 'dining'],
    ['نان', 'groceries'], ['میوه و سبزی', 'groceries'], ['خرید سوپرمارکت', 'groceries'],
    ['بنزین', 'transport'], ['اسنپ', 'transport'], ['کرایه تاکسی', 'transport'],
    ['قبض برق', 'bills'], ['شارژ ساختمان', 'bills'],
    ['اجاره خانه', 'housing'], ['کفش', 'shopping'], ['داروخانه', 'health'], ['کلاس زبان', 'education'],
    ['سینما', 'entertainment'], ['بلیط هواپیما', 'entertainment'], ['نتفلیکس', 'subscriptions'], ['اینترنت', 'subscriptions'],
    ['کادوی تولد', 'gifts'], ['قسط وام', 'installments'], ['کارمزد بانکی', 'credit_fees'], ['تیپاکس', 'running_costs'],
    ['خرید سکه', 'investment'],
    ['pizza', 'dining'], ['Coffee', 'dining'], ['taxi', 'transport'], ['netflix', 'subscriptions'],
  ])('%s → %s', (text, key) => expect(pick(text)).toBe(key));

  it('accepts the usual endings', () => {
    expect(pick('پیتزاها')).toBe('dining');
    expect(pick('کافه‌ای')).toBe('dining');
  });

  it('prefers the longer phrase over a single word', () => {
    expect(pick('اسنپ فود')).toBe('dining');
    expect(pick('بیمه تکمیلی')).toBe('health');
  });

  it('falls back to other for unknown words', () => {
    expect(pick('چیز عجیب')).toBe('other');
    expect(pick('')).toBe('other');
  });

  it('skips a built-in category the user does not have', () => {
    expect(matchVoiceCategory('پیتزا', EXPENSE.filter((c) => c.value !== 'dining'))).toBe('other');
  });

  it('puts the user\'s own category names first', () => {
    const own = [...EXPENSE, { value: 'c_pet12345', label: 'حیوان خانگی' }, { value: 'c_pzz12345', label: 'پیتزا' }];
    expect(matchVoiceCategory('غذای حیوان خانگی', own)).toBe('c_pet12345');
    expect(matchVoiceCategory('پیتزا', own)).toBe('c_pzz12345');
  });

  it('does not take every «هزینه» or «خرید» for a category called that', () => {
    expect(pick('هزینه تیپاکس')).toBe('running_costs');
    expect(pick('خرید نان')).toBe('groceries');
  });

  it('can match the name of a renamed built-in category', () => {
    const renamed = EXPENSE.map((c) => (c.value === 'gifts' ? { ...c, label: 'عیدانه' } : c)).filter((c) => !['dining'].includes(c.value));
    expect(matchVoiceCategory('عیدانه مادرم', renamed)).toBe('gifts');
  });
});

describe('matchVoiceCategory (incomes)', () => {
  it.each([
    ['حقوق', 'salary'], ['پاداش', 'bonus'], ['عیدی', 'bonus'], ['مزایا', 'benefits'], ['پروژه سایت', 'freelance'],
    ['فروش محصول', 'business'], ['سود سپرده', 'investment'], ['اجاره', 'rental'], ['هدیه', 'gift'],
    ['فروش لپ‌تاپ', 'asset_sale'], ['فروش ماشین', 'asset_sale'], ['وام', 'loan_received'], ['انعام', 'small_income'],
  ])('%s → %s', (text, key) => expect(pick(text, 'income')).toBe(key));
});

describe('matchVoiceAction', () => {
  const ALL = ['transfer', 'project', 'loan', 'share', 'credit_settle'];
  const PROJECTS = [{ id: 'grp_1', name: 'خانه' }, { id: 'grp_2', name: 'سفر شمال' }];
  it('finds an offered action', () => {
    expect(matchVoiceAction('انتقال بین حساب‌هام است', ALL).action).toBe('transfer');
    expect(matchVoiceAction('واریز وام است', ALL).action).toBe('loan');
    expect(matchVoiceAction('سهم دوستم است', ALL).action).toBe('share');
    expect(matchVoiceAction('پرداخت کارت اعتباری است', ALL).action).toBe('credit_settle');
  });
  it('ignores an action the app did not offer', () => {
    expect(matchVoiceAction('انتقال بین حساب‌هام است', ['project']).action).toBe('');
    expect(matchVoiceAction('انتقال', []).action).toBe('');
  });
  it('needs the word «پروژه» and picks the project by its name', () => {
    expect(matchVoiceAction('برای پروژه سفر شمال است', ALL, PROJECTS)).toEqual({ action: 'project', projectId: 'grp_2' });
    expect(matchVoiceAction('برای پروژه است', ALL, PROJECTS)).toEqual({ action: 'project', projectId: '' });
    expect(matchVoiceAction('کرایه خانه', ALL, PROJECTS).action).toBe('');
  });
});

describe('parseSmsVoice', () => {
  it('cleans the title and reads it', () => {
    expect(parseSmsVoice(' پیتزا. ', EXPENSE)).toEqual({ understood: true, title: 'پیتزا', category: 'dining', action: '', projectId: '' });
  });
  it('is not understood with no words', () => {
    expect(parseSmsVoice('  . ', EXPENSE).understood).toBe(false);
    expect(cleanVoiceTitle('x'.repeat(300))).toHaveLength(120);
  });
});

describe('a wrong guess of the language', () => {
  it('spots another script or Urdu-only letters', () => {
    expect(isForeignScript('پیتزا')).toBe(false);
    expect(isForeignScript('Pizza Hut پیتزا')).toBe(false);
    expect(isForeignScript('пицца')).toBe(true);
    expect(isForeignScript('ٹیکسی')).toBe(true);
    expect(isForeignScript('披萨')).toBe(true);
  });
  it('is not understood, so nothing is recorded', () => {
    expect(parseSmsVoice('пицца', EXPENSE).understood).toBe(false);
    expect(parseSmsVoice('ٹیکسی ہے', EXPENSE).understood).toBe(false);
  });
});

describe('the word tables', () => {
  it('only name real category keys, and no word is listed twice in one category', () => {
    const keys = (kind) => new Set(BUILTIN_CATEGORIES[kind].map((c) => c.value));
    for (const [kind, table] of [['expense', EXPENSE_WORDS], ['income', INCOME_WORDS]]) {
      for (const [key, list] of Object.entries(table)) {
        expect(keys(kind).has(key), `${kind}:${key}`).toBe(true);
        const normalized = list.map(normalizeVoiceText);
        expect(new Set(normalized).size, `${kind}:${key} has a duplicate`).toBe(normalized.length);
      }
    }
    expect(Object.keys(ACTION_WORDS).sort()).toEqual(['credit_settle', 'loan', 'project', 'share', 'transfer']);
  });
});
