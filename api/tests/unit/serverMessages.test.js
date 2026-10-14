/**
 * serverMessages.test.js — The Worker's Persian replies with values filled in are shown in the active language
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { tMessage, setActiveLocale, registerMessages } from '../../src/domain/i18n.js';
import serverMessages from '../../../web/src/i18n/en/server-messages.js';
import apiErrors from '../../../web/src/i18n/en/api-errors.js';

describe('tMessage', () => {
  beforeAll(() => {
    registerMessages('en', apiErrors);
    registerMessages('en', serverMessages);
  });
  afterEach(() => setActiveLocale('fa'));

  it('leaves Persian untouched', () => {
    setActiveLocale('fa');
    expect(tMessage('رمز عبور باید حداقل ۸ کاراکتر باشد.')).toBe('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  });

  it('translates a fixed message exactly', () => {
    setActiveLocale('en');
    expect(tMessage('رمز عبور تعیین شد؛ از این پس می‌توانید با ایمیل و رمز هم وارد شوید.')).toMatch(/^Password set/);
  });

  it('fills a template with Latin digits', () => {
    setActiveLocale('en');
    expect(tMessage('رمز عبور باید حداقل ۸ کاراکتر باشد.')).toBe('The password must be at least 8 characters.');
    expect(tMessage('قسط ۳ قبلاً پرداخت شده و قابل ویرایش نیست.')).toBe('Installment 3 is already paid and cannot be edited.');
  });

  it('keeps names and translates labels inside a template', () => {
    setActiveLocale('en');
    expect(tMessage('پورتفوی «سهام من» با موفقیت ساخته شد.')).toBe('Portfolio “سهام من” was created.');
  });

  it('returns an unknown message unchanged', () => {
    setActiveLocale('en');
    expect(tMessage('پیامی که ترجمه ندارد')).toBe('پیامی که ترجمه ندارد');
  });
});

describe('tMessage with the real plan limits and labels', () => {
  beforeAll(async () => {
    const catalog = (await import('../../../web/src/i18n/en/catalog.js')).default;
    const planLimits = (await import('../../../web/src/i18n/en/plan-limits.js')).default;
    registerMessages('en', catalog);
    registerMessages('en', planLimits);
  });
  afterEach(() => setActiveLocale('fa'));

  it('translates every free-plan comparison text and every limit refusal without leaving Persian', async () => {
    const { PLAN_COMPARISON, PLAN_LIMITS } = await import('../../src/config/planLimits.js');
    setActiveLocale('en');
    for (const row of PLAN_COMPARISON) {
      for (const text of [row.free, row.pro]) expect(tMessage(text), text).not.toMatch(/[؀-ۿ]/);
    }
    for (const rule of Object.values(PLAN_LIMITS)) {
      const closed = `${rule.label} در پلن رایگان بسته است. برای استفاده به Pro ارتقا دهید.`;
      const what = rule.monthly != null ? `${rule.monthly} ${rule.label} در ماه` : `${rule.total} ${rule.label}`;
      const limited = `پلن رایگان فقط ${what} را اجازه می‌دهد. برای ادامه به Pro ارتقا دهید.`;
      for (const text of [closed, limited]) expect(tMessage(text), text).not.toMatch(/[؀-ۿ]/);
    }
  });
});
