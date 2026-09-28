/**
 * bankSmsTemplates.js — How each bank's transaction SMS reads (the data for bankSms.js)
 *
 * To add a bank (full guide: docs/BANK_SMS.md):
 *  1. add `{ bankId, senders, templates }` below — `bankId` from config/banks.config.js
 *  2. write each message shape as a template: a regex anchored on the whole message, after
 *     normalizeSmsText (ASCII digits, one trimmed line per line), with the named groups bankSms.js
 *     lists (amount required; balance, account, card, date, time, kind, desc)
 *  3. add real sample messages (numbers changed) to api/tests/unit/bankSms.test.js
 *
 * Lines are joined with "\n". Reusable pieces are in P below.
 */

/** Pattern pieces shared by the templates */
const P = {
  // An amount with separators, the sign on either side ("397,500-", "-397,500", "+1,000")
  amount: String.raw`[+-]?\d[\d,]*[+-]?`,
  // A balance, possibly negative
  balance: String.raw`-?\d[\d,]*-?`,
  // A Shamsi date: MM/DD, YY/MM/DD or YYYY/MM/DD
  date: String.raw`(?:\d{2,4}[/.-])?\d{1,2}[/.-]\d{1,2}`,
  time: String.raw`\d{1,2}:\d{2}`,
  // Account or card digits, possibly masked
  digits: String.raw`[\d*]{4,26}`,
};

const re = (source) => new RegExp(source, 'u');

/** @type {import('./bankSms.js').BankSmsBank[]} */
export const BANK_SMS_TEMPLATES = [
  {
    bankId: 'parsian',
    senders: [],
    templates: [
      {
        // 30101540968603
        // مبلغ:397,500-
        // مانده:81,294,045
        // 07/06
        // 14:49
        id: 'parsian-balance',
        unit: 'rial',
        direction: 'sign',
        pattern: re(String.raw`^(?<account>${P.digits})\nمبلغ\s?:\s?(?<amount>${P.amount})\nمانده\s?:\s?(?<balance>${P.balance})\n(?<date>${P.date})\n(?<time>${P.time})$`),
      },
    ],
  },
];

/** The banks that have templates (for "supported banks" lists) */
export const SMS_BANK_IDS = BANK_SMS_TEMPLATES.map((b) => b.bankId);
