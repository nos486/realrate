import { describe, it, expect } from 'vitest';
import {
  normalizeSmsText,
  normalizeSender,
  parseBankSms,
  smsDateToIso,
  smsFingerprint,
  matchSmsAccount,
  banksForSender,
} from '../../src/domain/bankSms.js';
import { BANK_SMS_TEMPLATES } from '../../src/domain/bankSmsTemplates.js';

// 1405/07/06 (Mehr 6th)
const TODAY = new Date(2026, 8, 28);
const parse = (text, options = {}) => parseBankSms(text, BANK_SMS_TEMPLATES, { today: TODAY, ...options });

/**
 * Real messages of each bank (numbers changed). Adding a bank = adding its samples here:
 * every sample must read, with the fields given.
 */
const SAMPLES = [
  {
    bank: 'parsian',
    text: '30101540968603\nمبلغ:397,500-\nمانده:81,294,045\n07/06\n14:49',
    expect: { templateId: 'parsian-balance', direction: 'debit', amount: 39750, balance: 8129404.5, account: '30101540968603', accountLast4: '8603', date: '2026-09-28', time: '14:49' },
  },
  {
    bank: 'parsian',
    text: '30101540968603\nمبلغ:2,582,800,000+\nمانده:2,616,820,545\n07/04\n09:22',
    expect: { templateId: 'parsian-balance', direction: 'credit', amount: 258280000, balance: 261682054.5, date: '2026-09-26', time: '09:22' },
  },
  {
    bank: 'blu',
    text: 'بلو\nبرداشت پول\nسینا عزیز، 20,000,000 ریال از حساب شما پرید.\nموجودی: 77,436,726 ریال\n۱۰:۴۷\n۱۴۰۵.۰۷.۰۶',
    expect: { templateId: 'blu-balance', direction: 'debit', amount: 2000000, balance: 7743672.6, date: '2026-09-28', time: '10:47' },
  },
  {
    bank: 'blu',
    // As delivered: a space starting some lines
    text: 'بلو\nواریز پول\n سینا عزیز، 2,500,000 ریال به حساب شما نشست.\n موجودی: 104,451,226 ریال\n۱۸:۲۳\n۱۴۰۵.۰۷.۰۳',
    expect: { templateId: 'blu-balance', direction: 'credit', amount: 250000, balance: 10445122.6, date: '2026-09-25', time: '18:23' },
  },
];

describe('bank SMS samples', () => {
  it.each(SAMPLES.map((s, i) => [`${s.bank} #${i + 1}`, s]))('%s reads', (_name, sample) => {
    const tx = parse(sample.text);
    expect(tx).not.toBeNull();
    expect(tx.bankId).toBe(sample.bank);
    expect(tx).toMatchObject(sample.expect);
  });
});

describe('reading messages the way phones deliver them', () => {
  const base = SAMPLES[0].text;

  it('Persian digits, Persian separators and direction marks', () => {
    const persian = '‏۳۰۱۰۱۵۴۰۹۶۸۶۰۳\n‏مبلغ:۳۹۷٬۵۰۰-\nمانده:۸۱٬۲۹۴٬۰۴۵\n۰۷/۰۶\n۱۴:۴۹';
    expect(parse(persian)).toMatchObject({ direction: 'debit', amount: 39750, date: '2026-09-28' });
  });

  it('the sign before the amount, spaces around the colon, CRLF and blank lines', () => {
    const text = '30101540968603\r\n\r\nمبلغ : -397,500\r\nمانده : 81,294,045\r\n07/06\r\n14:49  ';
    expect(parse(text)).toMatchObject({ direction: 'debit', amount: 39750 });
  });

  it('an amount without a sign has no direction: not read', () => {
    expect(parse(base.replace('397,500-', '397,500'))).toBeNull();
  });

  it('something else is not read', () => {
    expect(parse('کد تایید شما: 12345')).toBeNull();
    expect(parse('')).toBeNull();
  });

  it('the same message gives the same fingerprint, another message another one', () => {
    expect(smsFingerprint(base)).toBe(smsFingerprint(`‏${base.replace(/\n/g, '\r\n')}`));
    expect(smsFingerprint(base)).not.toBe(smsFingerprint(SAMPLES[1].text));
  });
});

describe('dates', () => {
  it('a month/day is the most recent such day', () => {
    expect(smsDateToIso('07/06', TODAY)).toBe('2026-09-28');
    // Tomorrow is still this year (time zones), later is last year
    expect(smsDateToIso('07/07', TODAY)).toBe('2026-09-29');
    expect(smsDateToIso('12/29', TODAY)).toBe('2026-03-20');
    expect(smsDateToIso('01/01', TODAY)).toBe('2026-03-21');
  });

  it('with a year', () => {
    expect(smsDateToIso('1405/07/06', TODAY)).toBe('2026-09-28');
    expect(smsDateToIso('05/07/06', TODAY)).toBe('2026-09-28');
  });

  it('not a date', () => {
    expect(smsDateToIso('13/01', TODAY)).toBe('');
    expect(smsDateToIso('ab', TODAY)).toBe('');
  });
});

describe('senders and accounts', () => {
  it('normalizes sender numbers', () => {
    expect(normalizeSender('+98 9123456789')).toBe('9123456789');
    expect(normalizeSender('09123456789')).toBe('9123456789');
    expect(normalizeSender('Bank-X')).toBe('bank-x');
  });

  it('tries the sender\'s bank first, every bank for an unknown sender', () => {
    const banks = [{ bankId: 'a', senders: ['+982000'], templates: [] }, { bankId: 'b', senders: [], templates: [] }];
    expect(banksForSender(banks, '02000').map((b) => b.bankId)).toEqual(['a']);
    expect(banksForSender(banks, '99999').map((b) => b.bankId)).toEqual(['a', 'b']);
  });

  it('matches the account by bank and last 4 digits, else the only account of the bank', () => {
    const tx = parse(SAMPLES[0].text);
    const accounts = [
      { id: 'acc_1', bankId: 'parsian', accountNumber: '3010-1540-111' },
      { id: 'acc_2', bankId: 'parsian', accountNumber: '30101540968603' },
      { id: 'acc_3', bankId: 'mellat', cardLast4: '8603' },
    ];
    expect(matchSmsAccount(tx, accounts)).toBe('acc_2');
    expect(matchSmsAccount(tx, [accounts[0]])).toBe('acc_1');
    expect(matchSmsAccount(tx, [accounts[0], { id: 'acc_4', bankId: 'parsian' }])).toBe('');
    expect(matchSmsAccount(tx, [accounts[2]])).toBe('');
  });
});

describe('templates', () => {
  it('every template has a unique id and an anchored pattern', () => {
    const ids = BANK_SMS_TEMPLATES.flatMap((b) => b.templates.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const bank of BANK_SMS_TEMPLATES) {
      for (const t of bank.templates) {
        expect(t.id.startsWith(`${bank.bankId}-`)).toBe(true);
        expect(t.pattern.source.startsWith('^') && t.pattern.source.endsWith('$')).toBe(true);
        expect(t.pattern.source).toContain('(?<amount>');
      }
    }
  });

  it('every bank has at least one sample message', () => {
    for (const bank of BANK_SMS_TEMPLATES) {
      expect(SAMPLES.some((s) => s.bank === bank.bankId)).toBe(true);
    }
  });

  it('normalization', () => {
    expect(normalizeSmsText(' a  b \n\n c ')).toBe('a b\nc');
  });
});
