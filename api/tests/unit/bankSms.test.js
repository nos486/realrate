import { describe, it, expect } from 'vitest';
import {
  normalizeSmsText,
  normalizeSender,
  smsCategoryOf,
  parseBankSms,
  smsDateToIso,
  smsFingerprint,
  isSensitiveSms,
  matchSmsAccount,
  banksForSender,
  nativeSmsRules,
} from '../../src/domain/bankSms.js';
import { BANK_SMS_TEMPLATES, SMS_DESCRIPTION_CATEGORIES } from '../../src/domain/bankSmsTemplates.js';
import { BUILTIN_CATEGORIES } from '../../src/domain/categoryDocument.js';

// 1405/07/06 (Mehr 6th)
const TODAY = new Date(2026, 8, 28);
// 1405/07/12
const LATER = new Date(2026, 9, 4);
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
    bank: 'ewano',
    // From PARSIANBANK, Parsian's sender: not a Parsian account message
    options: { sender: 'PARSIANBANK', today: LATER },
    text: 'برداشت مبلغ 98,306,141 ریال از موجودی اوانو کارت\nمانده کارت: 0 ریال\nزمان: 1405/07/12-08:46:38\newano \nPowered by Vee',
    expect: { templateId: 'ewano-balance', direction: 'debit', amount: 9830614.1, balance: 0, date: '2026-10-04', time: '08:46' },
  },
  {
    bank: 'ewano',
    options: { sender: 'PARSIANBANK', today: LATER },
    text: 'واریز مبلغ 98,306,141 ریال به موجودی اوانوکارت\nمانده کارت: 98,306,141 ریال\nزمان: 1405/07/12-08:46:37 \newano \nPowered by Vee',
    expect: { templateId: 'ewano-balance', direction: 'credit', amount: 9830614.1, balance: 9830614.1, date: '2026-10-04', time: '08:46' },
  },
  {
    bank: 'ewano',
    // Without the closing lines
    options: { sender: 'PARSIANBANK', today: LATER },
    text: 'برداشت مبلغ 10,000 ریال از موجودی اوانو کارت\nمانده کارت: 5,000 ریال\nزمان: 1405/07/12-09:01:02',
    expect: { templateId: 'ewano-balance', direction: 'debit', amount: 1000, balance: 500, date: '2026-10-04', time: '09:01' },
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
  {
    bank: 'blu',
    // As delivered: no space between the amount and «ریال»
    options: { sender: '+989999987641', today: LATER },
    text: 'بلو\nبرداشت پول\nسینا عزیز، 3,000,000ریال از حساب شما پرید.\nموجودی: 63,475,726 ریال\n۱۶:۰۰\n۱۴۰۵.۰۷.۱۲',
    expect: { templateId: 'blu-balance', direction: 'debit', amount: 300000, balance: 6347572.6, date: '2026-10-04', time: '16:00' },
  },
  {
    bank: 'pasargad',
    text: '232.800.1442198.1\n-80,000\n06/16_19:45\nمانده: 31,516,369',
    expect: { templateId: 'pasargad-balance', direction: 'debit', amount: 8000, balance: 3151636.9, accountLast4: '1981', date: '2026-09-07', time: '19:45' },
  },
  {
    bank: 'shahr',
    // Arabic «ي» as delivered, seconds after the time
    text: '*بانک شهر*\nسود\nواريز به:700814110204\nمبلغ:377,743ريال\nموجودي:89,371,480ريال\n1405/07/1 00:41:16',
    expect: { templateId: 'shahr-balance', direction: 'credit', amount: 37774.3, balance: 8937148, accountLast4: '0204', date: '2026-09-23', time: '00:41', description: 'سود' },
  },
  {
    bank: 'mellat',
    text: 'حساب1848394556\nواریز31,500,000\nمانده31,894,014\n05/06/28-13:57',
    expect: { templateId: 'mellat-balance', direction: 'credit', amount: 3150000, balance: 3189401.4, accountLast4: '4556', date: '2026-09-19', time: '13:57' },
  },
  // The samples below were read on 1405/07/12 (LATER); the sender tells Resalat from Pasargad
  {
    bank: 'resalat',
    options: { sender: 'ResalatBank', today: LATER },
    text: '10.3372914.1 \n-13,550,000  \n07/11_00:12 \nمانده: 428,428,242',
    expect: { templateId: 'resalat-balance', direction: 'debit', amount: 1355000, balance: 42842824.2, accountLast4: '9141', date: '2026-10-03', time: '00:12' },
  },
  {
    bank: 'resalat',
    options: { sender: 'ResalatBank', today: LATER },
    text: '10.3372914.1 \n+4,692,800  \n07/11_22:01 \nمانده: 433,121,042',
    expect: { templateId: 'resalat-balance', direction: 'credit', amount: 469280, balance: 43312104.2, date: '2026-10-03', time: '22:01' },
  },
  {
    bank: 'mehr-iran',
    options: { sender: 'B.QMEHRIRAN', today: LATER },
    text: '300362322544 \n400,000-\n1405/7/1-16:31\nمانده:2,279,556',
    expect: { templateId: 'mehr-iran-balance', direction: 'debit', amount: 40000, balance: 227955.6, accountLast4: '2544', date: '2026-09-23', time: '16:31' },
  },
  {
    bank: 'mehr-iran',
    options: { sender: 'B.QMEHRIRAN', today: LATER },
    text: ' 300362322544  \n5,000,000+\n1405/7/11-14:40\n مانده:7,239,695',
    expect: { templateId: 'mehr-iran-balance', direction: 'credit', amount: 500000, balance: 723969.5, date: '2026-10-03', time: '14:40' },
  },
  {
    bank: 'tejarat',
    options: { sender: 'TejaratBank', today: LATER },
    // Arabic «ي» in «طريق», as delivered
    text: '*بانک تجارت*  \nحساب: 0177002186043  \nبرداشت: 60,000 ریال  \nاز طريق: پایانه فروش   \nمانده: 24,502,460 ریال  \n1405/07/11 \n14:15',
    expect: { templateId: 'tejarat-balance', direction: 'debit', amount: 6000, balance: 2450246, accountLast4: '6043', date: '2026-10-03', time: '14:15', description: 'پایانه فروش' },
  },
  {
    bank: 'tejarat',
    options: { sender: 'TejaratBank', today: LATER },
    text: '*بانک تجارت*  \nحساب: 0177002186043  \nواریز: 5,000,000 ریال  \nاز طريق: شتاب   \nمانده: 24,562,460 ریال  \n1405/07/05 \n18:39',
    expect: { templateId: 'tejarat-balance', direction: 'credit', amount: 500000, balance: 2456246, date: '2026-09-27', time: '18:39', description: 'شتاب' },
  },
  {
    bank: 'melli',
    options: { sender: '700717', today: LATER },
    // Arabic «ي/ك» throughout, as delivered
    text: 'بانك ملي ايران\nبرداشت:500,000-\nحساب:10000\nمانده:23,488,359\n0705-20:46',
    expect: { templateId: 'melli-balance', direction: 'debit', amount: 50000, balance: 2348835.9, account: '10000', date: '2026-09-27', time: '20:46', description: 'برداشت' },
  },
  {
    bank: 'melli',
    options: { sender: '700717', today: LATER },
    text: 'بانك ملي ايران\nانتقال:25,000,000+\nحساب:10000\nمانده:198,088,329\n0625-19:42',
    expect: { templateId: 'melli-balance', direction: 'credit', amount: 2500000, balance: 19808832.9, date: '2026-09-16', time: '19:42', description: 'انتقال' },
  },
  {
    bank: 'melli',
    options: { sender: '700717', today: LATER },
    text: 'بانك ملي ايران\nپايا:140,000,000-\nحساب:10000\nمانده:46,075,429\n0629-15:50',
    expect: { templateId: 'melli-balance', direction: 'debit', amount: 14000000, date: '2026-09-20', time: '15:50', description: 'پایا' },
  },
  {
    bank: 'melli',
    options: { sender: '700717', today: LATER },
    text: 'بانك ملي ايران\nخريداينترنتي:7,714,450-\nحساب:10000\nمانده:186,675,429\n0626-20:17',
    expect: { templateId: 'melli-balance', direction: 'debit', amount: 771445, date: '2026-09-17', time: '20:17', description: 'خریداینترنتی' },
  },
  {
    bank: 'khavarmianeh',
    options: { sender: 'KH M BANK', today: LATER },
    text: 'بانک خاورمیانه\n838/000115456\n-208,000,000\n07/08\n15:58\nمانده 536,365\nبرداشت حواله پل',
    expect: { templateId: 'khavarmianeh-balance', direction: 'debit', amount: 20800000, balance: 53636.5, account: '838000115456', accountLast4: '5456', date: '2026-09-30', time: '15:58', description: 'برداشت حواله پل' },
  },
  {
    bank: 'khavarmianeh',
    options: { sender: 'KH M BANK', today: LATER },
    // Without the closing line
    text: 'بانک خاورمیانه\n838/000115456\n+200,000,000\n07/08\n15:57\nمانده 208,536,365',
    expect: { templateId: 'khavarmianeh-balance', direction: 'credit', amount: 20000000, balance: 20853636.5, date: '2026-09-30', time: '15:57', description: '' },
  },
];

describe('bank SMS samples', () => {
  it.each(SAMPLES.map((s, i) => [`${s.bank} #${i + 1}`, s]))('%s reads', (_name, sample) => {
    const tx = parse(sample.text, sample.options);
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

  it('the transaction key: bank, direction, amount, day and time — whatever the wording', () => {
    const tx = parse(base);
    expect(tx.key).toBe('parsian|debit|39750|2026-09-28|14:49');
    // Other spacing and digits, same transaction
    expect(parse('30101540968603\nمبلغ : -۳۹۷,۵۰۰\nمانده:81,294,045\n07/06\n14:49').key).toBe(tx.key);
    expect(parse(base.replace('14:49', '14:50')).key).not.toBe(tx.key);
  });

  it('the same message gives the same fingerprint, another message another one', () => {
    expect(smsFingerprint(base)).toBe(smsFingerprint(`‏${base.replace(/\n/g, '\r\n')}`));
    expect(smsFingerprint(base)).not.toBe(smsFingerprint(SAMPLES[1].text));
  });
});

describe('one-time passwords and login codes', () => {
  // Same cases as BankSmsPlugin.isSensitive (checked with javac when it changed)
  it.each([
    'بانک پارسیان\nرمز پویا: 123456\nمبلغ:1,000',
    'رمز دوم پویا شما 88321 است',
    'رمز یک‌بار مصرف: 5521',
    'کد تأیید شما 4412',
    'كد ورود 9911',
    'Your OTP is 1234',
  ])('%s is never read', (text) => {
    expect(isSensitiveSms(text)).toBe(true);
    expect(parse(text)).toBeNull();
  });

  it('a transaction is not taken for one', () => {
    for (const sample of SAMPLES) expect(isSensitiveSms(sample.text)).toBe(false);
  });

  it('even in a transaction-shaped message', () => {
    expect(parse(`${SAMPLES[0].text.split('\n')[0]}\nمبلغ:1,000-\nمانده:5\n07/06\n14:49\nرمز پویا 1234`)).toBeNull();
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

  it('without separators (MMDD, YYMMDD, YYYYMMDD)', () => {
    expect(smsDateToIso('0706', TODAY)).toBe('2026-09-28');
    expect(smsDateToIso('050706', TODAY)).toBe('2026-09-28');
    expect(smsDateToIso('14050706', TODAY)).toBe('2026-09-28');
    expect(smsDateToIso('070', TODAY)).toBe('');
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
    expect(normalizeSender('Bank-X')).toBe('bankx');
  });

  it('a sender name is the same however the phone spaces or punctuates it', () => {
    for (const name of ['Bank Shahr', 'BankShahr', 'BANK-SHAHR', ' bank  shahr ', 'Bank.Shahr', 'bank_shahr']) {
      expect(normalizeSender(name)).toBe('bankshahr');
    }
    expect(normalizeSender('B.Pasargad')).toBe(normalizeSender('B Pasargad'));
  });

  it("Bank Shahr's message is read from every form of its sender, not from another bank's", () => {
    const text = '*بانک شهر*\nسود\nواريز به:700814110204\nمبلغ:377,743ريال\nموجودي:89,371,480ريال\n1405/07/1 00:41:16';
    for (const sender of ['Bank Shahr', 'BankShahr', 'BANK-SHAHR', 'ShahrBank']) {
      expect(banksForSender(BANK_SMS_TEMPLATES, sender).map((b) => b.bankId)).toEqual(['shahr']);
      expect(parseBankSms(text, BANK_SMS_TEMPLATES, { sender })).toMatchObject({ bankId: 'shahr', direction: 'credit', description: 'سود' });
    }
    // Another bank's sender: none of its templates reads it
    expect(parseBankSms(text, BANK_SMS_TEMPLATES, { sender: 'B.Pasargad' })).toBeNull();
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

describe('rules for the Android side (only withdrawals and deposits reach the app)', () => {
  const rules = nativeSmsRules(BANK_SMS_TEMPLATES);
  // A bank whose sender isn't known yet is read only when pasted, not by the app
  const withSenders = BANK_SMS_TEMPLATES.filter((b) => b.senders.length);

  it('one rule per bank with senders: its senders and its templates\' pattern sources', () => {
    expect(rules).toHaveLength(withSenders.length);
    // In the banks' order (two banks may share a sender: Parsian and its Ewano card)
    withSenders.forEach((bank, i) => {
      expect(rules[i].senders).toEqual(bank.senders);
      expect(rules[i].patterns).toEqual(bank.templates.map((t) => t.pattern.source));
    });
  });

  // BankSmsRules.java matches the same sources (checked with javac when they change); here the
  // sources alone, rebuilt, read every sample like the templates do
  it.each(SAMPLES.map((s, i) => [`${s.bank} #${i + 1}`, s]))('%s is a transaction by the rules', (_name, sample) => {
    const bank = BANK_SMS_TEMPLATES.find((b) => b.bankId === sample.bank);
    // The same sources, rebuilt, read the sample (the bank's rule is sent once its sender is known)
    const patterns = bank.templates.map((t) => t.pattern.source);
    expect(patterns.some((source) => new RegExp(source).test(normalizeSmsText(sample.text)))).toBe(true);
  });

  it('other bank messages are not', () => {
    const others = [
      'مشتری گرامی، مانده حساب شما 81,294,045 ریال است.',
      'بلو\nبا بلو بیشتر آشنا شوید',
      'مشتری گرامی شما در۱۴۰۵/۰۷/۰۶ ساعت۲۲:۵۰وارد همراه بانک تجارت شده اید.',
      // Khavarmianeh's notice of a Pol transfer (its withdrawal comes in a message of its own)
      'بانک خاورمیانه\nتراکنش:انتقال وجه پرداخت لحظه ای (پل)\nبه:نام گیرنده / فعال\nمبلغ:208,000,000ریال',
    ];
    for (const text of others) {
      expect(rules.some((r) => r.patterns.some((source) => new RegExp(source).test(normalizeSmsText(text))))).toBe(false);
    }
  });
});

describe('the category a message starts in, from its own description', () => {
  const rules = [
    { direction: 'credit', words: ['سود'], category: 'investment' },
    { direction: 'debit', words: ['کارمزد', 'قبض'], category: 'bills' },
  ];

  it('the first rule of its direction with one of its words, as a whole word', () => {
    expect(smsCategoryOf({ direction: 'credit', description: 'سود' }, rules)).toBe('investment');
    expect(smsCategoryOf({ direction: 'credit', description: 'واريز سود سپرده' }, rules)).toBe('investment');
    expect(smsCategoryOf({ direction: 'debit', description: 'پرداخت قبض' }, rules)).toBe('bills');
    // Another direction, part of a word, no description: none
    expect(smsCategoryOf({ direction: 'debit', description: 'سود' }, rules)).toBe('');
    expect(smsCategoryOf({ direction: 'credit', description: 'سودا' }, rules)).toBe('');
    expect(smsCategoryOf({ direction: 'credit', description: '' }, rules)).toBe('');
    expect(smsCategoryOf({ direction: 'credit' })).toBe('');
  });

  it('every rule names a category of its kind (incomes for deposits, expenses for withdrawals)', () => {
    for (const rule of SMS_DESCRIPTION_CATEGORIES) {
      const kind = rule.direction === 'credit' ? 'income' : 'expense';
      expect(['credit', 'debit']).toContain(rule.direction);
      expect(rule.words.length).toBeGreaterThan(0);
      expect(BUILTIN_CATEGORIES[kind].map((c) => c.value)).toContain(rule.category);
    }
  });

  it("Shahr's interest deposit starts as investment income", () => {
    const tx = parse('*بانک شهر*\nسود\nواريز به:700814110204\nمبلغ:377,743ريال\nموجودي:89,371,480ريال\n1405/07/1 00:41:16');
    expect(smsCategoryOf(tx, SMS_DESCRIPTION_CATEGORIES)).toBe('investment');
  });
});
