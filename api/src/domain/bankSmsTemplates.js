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

/**
 * The category a recorded message starts in, from what the message itself says it is (the `desc`
 * a template reads, e.g. Shahr's «سود»), for every bank: the first rule of the transaction's
 * direction with one of its words in the description (a whole word) wins; the user can still
 * change it in the form. To add one: a row here, with a category of the incomes (credit) or the
 * expenses (debit) — utils/categoryDocument.js. Docs: docs/BANK_SMS.md.
 * @type {Array<{ direction: 'credit'|'debit', words: string[], category: string }>}
 */
export const SMS_DESCRIPTION_CATEGORIES = [
  // The bank's interest on a deposit account
  { direction: 'credit', words: ['سود'], category: 'investment' },
];

/** @type {import('./bankSms.js').BankSmsBank[]} */
export const BANK_SMS_TEMPLATES = [
  {
    bankId: 'parsian',
    senders: ['PARSIANBANK'],
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
  {
    // Ewano card, Parsian's wallet: its own balance (not a Parsian account), sent from PARSIANBANK
    // too — the sender's Parsian templates are tried first, then these
    bankId: 'ewano',
    senders: ['PARSIANBANK'],
    templates: [
      {
        // برداشت مبلغ 98,306,141 ریال از موجودی اوانو کارت
        // مانده کارت: 0 ریال
        // زمان: 1405/07/12-08:46:38
        // ewano
        // Powered by Vee
        // (a deposit: «واریز مبلغ … ریال به موجودی اوانوکارت»; the closing lines may be missing)
        id: 'ewano-balance',
        unit: 'rial',
        direction: { debit: ['برداشت', 'خرید', 'پرداخت', 'انتقال'], credit: ['واریز'] },
        pattern: re(String.raw`^(?<kind>[^\d\n]+?)\s?مبلغ\s?(?<amount>${P.amount})\s?ریال\s?(?:از|به)\s?موجودی\s?اوانو[\s\u200c]?کارت\nمانده کارت\s?:\s?(?<balance>${P.balance})\s?ریال\nزمان\s?:\s?(?<date>${P.date})-(?<time>${P.time})(?::\d{2})?(?:\n[A-Za-z][A-Za-z ]*)*$`),
      },
    ],
  },
  {
    bankId: 'blu',
    senders: ['+989999987641'],
    templates: [
      {
        // بلو
        // برداشت پول
        // سینا عزیز، 20,000,000 ریال از حساب شما پرید.
        // موجودی: 77,436,726 ریال
        // ۱۰:۴۷
        // ۱۴۰۵.۰۷.۰۶
        // (a deposit: «واریز پول» … «ریال به حساب شما نشست.»; the space before «ریال» may be
        // missing: «3,000,000ریال»)
        id: 'blu-balance',
        unit: 'rial',
        direction: { debit: ['برداشت', 'خرید', 'پرداخت', 'انتقال'], credit: ['واریز'] },
        pattern: re(String.raw`^بلو\n(?<kind>[^\n]+)\n[^\n]*?(?<amount>${P.amount})\s?ریال[^\n]*\nموجودی\s?:\s?(?<balance>${P.balance})\s?ریال\n(?<time>${P.time})\n(?<date>${P.date})$`),
      },
    ],
  },
  {
    bankId: 'pasargad',
    senders: ['B.Pasargad'],
    templates: [
      {
        // 232.800.1442198.1
        // -80,000
        // 06/16_19:45
        // مانده: 31,516,369
        id: 'pasargad-balance',
        unit: 'rial',
        direction: 'sign',
        pattern: re(String.raw`^(?<account>\d[\d.*]{4,30})\n(?<amount>${P.amount})\n(?<date>${P.date})_(?<time>${P.time})\nمانده\s?:\s?(?<balance>${P.balance})$`),
      },
    ],
  },
  {
    bankId: 'shahr',
    // Spaces, dots and dashes don't matter (normalizeSender): «BankShahr», «BANK-SHAHR» too
    senders: ['Bank Shahr', 'Shahr Bank'],
    templates: [
      {
        // *بانک شهر*
        // سود
        // واريز به:700814110204
        // مبلغ:377,743ريال
        // موجودي:89,371,480ريال
        // 1405/07/1 00:41:16
        // (the second line names the transaction and may be missing; a withdrawal: «برداشت از:»)
        id: 'shahr-balance',
        unit: 'rial',
        direction: { debit: ['برداشت', 'خرید', 'پرداخت', 'انتقال'], credit: ['واریز'] },
        pattern: re(String.raw`^\*?\s?بانک شهر\s?\*?\n(?:(?<desc>[^\n:]+)\n)?(?<kind>[^\n:]+?)\s?(?:به|از)?\s?:\s?(?<account>${P.digits})\nمبلغ\s?:\s?(?<amount>${P.amount})\s?ریال\nموجودی\s?:\s?(?<balance>${P.balance})\s?ریال\n(?<date>${P.date})\s(?<time>${P.time})(?::\d{2})?$`),
      },
    ],
  },
  {
    bankId: 'mellat',
    senders: ['Bank Mellat'],
    templates: [
      {
        // حساب1848394556
        // واریز31,500,000
        // مانده31,894,014
        // 05/06/28-13:57
        id: 'mellat-balance',
        unit: 'rial',
        direction: { debit: ['برداشت', 'خرید', 'پرداخت', 'انتقال'], credit: ['واریز'] },
        pattern: re(String.raw`^حساب\s?:?\s?(?<account>${P.digits})\n(?<kind>[^\d\n+-]+?)\s?:?\s?(?<amount>${P.amount})\nمانده\s?:?\s?(?<balance>${P.balance})\n(?<date>${P.date})-(?<time>${P.time})$`),
      },
    ],
  },
  {
    bankId: 'resalat',
    senders: ['ResalatBank'],
    templates: [
      {
        // 10.3372914.1
        // -13,550,000
        // 07/11_00:12
        // مانده: 428,428,242
        // (the same shape as Pasargad's: the sender tells them apart)
        id: 'resalat-balance',
        unit: 'rial',
        direction: 'sign',
        pattern: re(String.raw`^(?<account>\d[\d.*]{4,30})\n(?<amount>${P.amount})\n(?<date>${P.date})_(?<time>${P.time})\nمانده\s?:\s?(?<balance>${P.balance})$`),
      },
    ],
  },
  {
    bankId: 'mehr-iran',
    senders: ['B.QMEHRIRAN'],
    templates: [
      {
        // 300362322544
        // 400,000-
        // 1405/7/1-16:31
        // مانده:2,279,556
        id: 'mehr-iran-balance',
        unit: 'rial',
        direction: 'sign',
        pattern: re(String.raw`^(?<account>${P.digits})\n(?<amount>${P.amount})\n(?<date>${P.date})-(?<time>${P.time})\nمانده\s?:\s?(?<balance>${P.balance})$`),
      },
    ],
  },
  {
    bankId: 'tejarat',
    senders: ['TejaratBank'],
    templates: [
      {
        // *بانک تجارت*
        // حساب: 0177002186043
        // برداشت: 60,000 ریال
        // از طريق: پایانه فروش
        // مانده: 24,502,460 ریال
        // 1405/07/11
        // 14:15
        // (a deposit: «واریز:»; the «از طریق» line, the channel, may be missing)
        id: 'tejarat-balance',
        unit: 'rial',
        direction: { debit: ['برداشت', 'خرید', 'پرداخت', 'انتقال'], credit: ['واریز'] },
        pattern: re(String.raw`^\*?\s?بانک تجارت\s?\*?\nحساب\s?:\s?(?<account>${P.digits})\n(?<kind>[^\d\n:+-]+?)\s?:\s?(?<amount>${P.amount})\s?ریال\n(?:از طریق\s?:\s?(?<desc>[^\n]+)\n)?مانده\s?:\s?(?<balance>${P.balance})\s?ریال\n(?<date>${P.date})\s(?<time>${P.time})$`),
      },
    ],
  },
  {
    bankId: 'melli',
    senders: ['700717'],
    templates: [
      {
        // بانك ملي ايران
        // برداشت:500,000-
        // حساب:10000
        // مانده:23,488,359
        // 0705-20:46
        // (the first word names the transaction: برداشت / انتقال / پايا / خريداينترنتي …, the
        // amount's sign its direction; the date is MMDD, no separator)
        id: 'melli-balance',
        unit: 'rial',
        direction: 'sign',
        pattern: re(String.raw`^بانک ملی ایران\n(?<desc>[^\d\n:+-]+?)\s?:\s?(?<amount>${P.amount})\nحساب\s?:\s?(?<account>${P.digits})\nمانده\s?:\s?(?<balance>${P.balance})\n(?<date>\d{4})-(?<time>${P.time})$`),
      },
    ],
  },
  {
    bankId: 'khavarmianeh',
    senders: ['KH M BANK'],
    templates: [
      {
        // بانک خاورمیانه
        // 838/000115456
        // -208,000,000
        // 07/08
        // 15:58
        // مانده 536,365
        // برداشت حواله پل
        // (the last line, what it was, may be missing)
        id: 'khavarmianeh-balance',
        unit: 'rial',
        direction: 'sign',
        pattern: re(String.raw`^بانک خاورمیانه\n(?<account>\d[\d/*]{4,30})\n(?<amount>${P.amount})\n(?<date>${P.date})\s(?<time>${P.time})\nمانده\s?:?\s?(?<balance>${P.balance})(?:\n(?<desc>[^\n]+))?$`),
      },
    ],
  },
];

