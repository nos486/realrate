/**
 * bankStatementTemplates.js — How each bank's exported statement reads (the data for bankStatement.js)
 *
 * To add a bank (full guide: docs/BANK_STATEMENT_IMPORT.md):
 *  1. add `{ bankId, label, unit, columns, rules }` to STATEMENT_BANKS — `bankId` from
 *     config/banks.config.js
 *  2. `columns`: the header words of the columns to read (a header cell matches when it contains
 *     the word, spaces and punctuation ignored)
 *  3. `rules`: one per shape of description, first match wins. A rule says what the row is
 *     (`kind`, a key of STATEMENT_KINDS), reads the fields out of the description (named groups of
 *     `fields`) and which of them identify the other side (`party`)
 *  4. add real samples (numbers and names changed) to api/tests/unit/bankStatement.test.js
 *
 * Descriptions are matched after normalizeStatementText: ASCII digits, Persian letters, no
 * diacritics, single spaces.
 */

import { t } from './i18n.js';

const re = (source, flags = 'u') => new RegExp(source, flags);

/**
 * What a row is, whatever the bank: its name, and the record it starts as (per direction).
 * `confident`: the kind alone says what it is, so nothing is asked about it. A kind with no
 * entry for a direction starts as an «other» record there, and its group is asked about.
 * `title`: the record's title (the party's name is added for a transfer); none = the category's name.
 * @type {Record<string, { label: string, debit?: object, credit?: object }>}
 */
export const STATEMENT_KINDS = {
  purchase: { label: t('خرید با کارت') },
  cash_withdrawal: { label: t('برداشت نقدی'), debit: { category: 'other', title: t('برداشت نقدی'), confident: true } },
  bill_payment: { label: t('پرداخت قبض و خدمات'), debit: { category: 'bills', title: t('پرداخت قبض و خدمات'), confident: true } },
  card_transfer: { label: t('کارت به کارت'), debit: { title: t('انتقال به') }, credit: { title: t('واریز از') } },
  account_transfer: { label: t('انتقال بین حساب‌ها'), debit: { title: t('انتقال به') }, credit: { title: t('واریز از') } },
  instant_transfer: { label: t('انتقال پایا، ساتنا و پل'), debit: { title: t('انتقال به') }, credit: { title: t('واریز از') } },
  batch_transfer: { label: t('واریز گروهی (مثل حقوق)'), credit: { title: t('واریز گروهی') } },
  company_payment: { label: t('واریز از شرکت'), credit: { title: t('واریز از') } },
  fee: { label: t('کارمزد بانکی'), debit: { category: 'credit_fees', title: t('کارمزد بانکی'), confident: true } },
  loan_received: { label: t('دریافت وام'), credit: { category: 'loan_received', title: t('دریافت وام'), confident: true } },
  loan_payment: { label: t('قسط وام'), debit: { category: 'installments', title: t('پرداخت قسط وام'), confident: true } },
  loan_cost: { label: t('هزینه‌ی وام'), debit: { category: 'credit_fees', title: t('هزینه‌ی وام'), confident: true } },
  dividend: { label: t('سود سهام'), credit: { category: 'investment', title: t('سود سهام'), confident: true } },
  cheque: { label: t('وصول چک'), credit: { category: 'other', title: t('وصول چک') } },
  cash_deposit: { label: t('واریز نقدی'), credit: { category: 'other', title: t('واریز نقدی') } },
  reversal: { label: t('برگشت تراکنش'), credit: { category: 'other', title: t('برگشت تراکنش'), confident: true } },
  other: { label: t('سایر') },
};

/**
 * Words in a description, a name or a merchant that say what a row is (the first rule of the
 * row's direction with a word inside wins; matched as whole words after normalizing). A row the
 * kind alone does not settle starts in this category, which the user can still change. To add
 * one: a row here, with a category of the expenses (debit) or the incomes (credit) —
 * utils/categoryDocument.js.
 * @type {Array<{ direction: 'credit'|'debit', words: string[], category: string, title?: string }>}
 */
export const STATEMENT_KEYWORD_RULES = [
  { direction: 'credit', words: ['حقوق', 'دستمزد'], category: 'salary' }, // i18n-ignore
  { direction: 'credit', words: ['مزایا', 'عیدی', 'بن'], category: 'benefits' }, // i18n-ignore
  { direction: 'credit', words: ['پاداش'], category: 'bonus' }, // i18n-ignore
  { direction: 'credit', words: ['اجاره', 'رهن'], category: 'rental' }, // i18n-ignore
  { direction: 'credit', words: ['سود', 'سود سهام', 'سود سپرده'], category: 'investment' }, // i18n-ignore
  { direction: 'credit', words: ['کارگزاری'], category: 'asset_sale', title: t('برداشت از کارگزاری') }, // i18n-ignore
  { direction: 'credit', words: ['تسهیلات', 'وام'], category: 'loan_received' }, // i18n-ignore
  { direction: 'debit', words: ['کارگزاری'], category: 'investment', title: t('واریز به کارگزاری') }, // i18n-ignore
  { direction: 'debit', words: ['قسط', 'اقساط'], category: 'installments' }, // i18n-ignore
  { direction: 'debit', words: ['رستوران', 'کافه', 'کافی شاپ', 'کافی‌شاپ', 'فست فود', 'پیتزا', 'کباب', 'چلوکبابی', 'ساندویچ', 'بستنی', 'شیرینی', 'قنادی'], category: 'dining' }, // i18n-ignore
  { direction: 'debit', words: ['سوپرمارکت', 'سوپر', 'هایپر', 'هایپرمارکت', 'میوه', 'نانوایی', 'قصابی', 'پروتئین', 'بقالی', 'خواربار', 'شهروند', 'رفاه'], category: 'groceries' }, // i18n-ignore
  { direction: 'debit', words: ['داروخانه', 'دارو', 'درمانگاه', 'بیمارستان', 'دندانپزشکی', 'آزمایشگاه', 'پزشک', 'کلینیک', 'رادیولوژی', 'فیزیوتراپی'], category: 'health' }, // i18n-ignore
  { direction: 'debit', words: ['اسنپ', 'تپسی', 'تاکسی', 'مترو', 'اتوبوس', 'بنزین', 'پمپ بنزین', 'عوارض', 'پارکینگ', 'کارواش', 'حمل و نقل'], category: 'transport' }, // i18n-ignore
  { direction: 'debit', words: ['ایرانسل', 'همراه اول', 'رایتل', 'مخابرات', 'اینترنت', 'شاتل', 'های وب', 'مبین نت', 'نتفلیکس', 'اسپاتیفای'], category: 'subscriptions' }, // i18n-ignore
  { direction: 'debit', words: ['برق', 'گاز', 'آب', 'شهرداری', 'شارژ', 'قبض', 'عوارض شهرداری'], category: 'bills' }, // i18n-ignore
  { direction: 'debit', words: ['دانشگاه', 'آموزشگاه', 'کتاب', 'کتابفروشی', 'مدرسه', 'دبستان', 'مهدکودک', 'کلاس'], category: 'education' }, // i18n-ignore
  { direction: 'debit', words: ['دیجی کالا', 'دیجیکالا', 'پوشاک', 'کفش', 'لباس', 'فروشگاه', 'بوتیک'], category: 'shopping' }, // i18n-ignore
  { direction: 'debit', words: ['سینما', 'تئاتر', 'بلیط', 'هتل', 'پرواز', 'علی بابا', 'علیبابا', 'اقامتگاه', 'تفریحی'], category: 'entertainment' }, // i18n-ignore
  { direction: 'debit', words: ['خیریه', 'کمیته امداد', 'محک', 'نیکوکاری', 'صدقه', 'کمک'], category: 'gifts' }, // i18n-ignore
];

/** Persian/Arabic diacritics and tatweel: dropped when text is normalized */
export const STATEMENT_DIACRITICS = /[ً-ٰٟـ]/g; // i18n-ignore

/**
 * Small expenses can be put in one category together («هزینه‌های جاری» below 2 million tomans by
 * default): the user can change both in the import
 */
export const STATEMENT_SMALL_DEFAULT = { maxToman: 2_000_000, category: 'running_costs' };

/**
 * @typedef {object} StatementRule
 * @property {string} id            Unique, "<bank>-<what>"
 * @property {string} kind          A key of STATEMENT_KINDS
 * @property {'debit'|'credit'} [direction]  Only rows of this direction
 * @property {RegExp} test          Matched against the normalized description
 * @property {RegExp|RegExp[]} [fields]  Named groups read from the description: any of `terminal`,
 *   `merchant`, `channel`, `reference`, `card`, `fromCard`, `toCard`, `fromName`, `toName`, `name`,
 *   `sheba`, `fromAccount`, `toAccount`, `billId`, `chequeNo`
 * @property {{ debit?: string[], credit?: string[] }|string[]} [party] The fields that identify
 *   the other side, best first (per direction, or for both): the first one present is the group's
 *   key. The first present of `name` / `fromName` / `toName` also names it.
 * @property {{ debit?: object, credit?: object }} [self] The user's own side, to learn which
 *   card, account and name are theirs: `{ card, account, name }` field names
 */

/**
 * @typedef {object} StatementBank
 * @property {string} bankId
 * @property {string} label            Shown in the picker
 * @property {string} howTo            How to get the file
 * @property {'rial'|'toman'} unit     Unit of the amounts in the file
 * @property {Record<string, string>} columns  Header words: date, description, direction, amount, balance
 * @property {{ debit: string[], credit: string[] }} directionWords  What the direction column holds
 * @property {StatementRule[]} rules
 */

/** @type {StatementBank[]} */
export const STATEMENT_BANKS = [
  {
    bankId: 'parsian',
    label: 'همراه بانک پارسیان (اکسل)', // i18n-ignore
    howTo: 'در «همراه بانک پارسیان»، از بخش گردش حساب بازه‌ی تاریخ را انتخاب کنید و «خروجی اکسل» بگیرید؛ فایل .xlsx را اینجا بدهید.', // i18n-ignore
    unit: 'rial',
    columns: { date: 'تاریخ', description: 'توضیحات', direction: 'واریز/برداشت', amount: 'مبلغ', balance: 'موجودی' }, // i18n-ignore
    directionWords: { debit: ['برداشت'], credit: ['واریز'] }, // i18n-ignore
    rules: [
      {
        id: 'parsian-reversal',
        kind: 'reversal',
        direction: 'credit',
        test: re(String.raw`^برگشت سند`), // i18n-ignore
        fields: re(String.raw`شماره بازیابی\s*(?<reference>\d+)`), // i18n-ignore
      },
      {
        id: 'parsian-purchase',
        kind: 'purchase',
        direction: 'debit',
        test: re(String.raw`^خرید کالا یا سرویس`), // i18n-ignore
        fields: re(String.raw`با کارت\s*(?<card>\d{16}).*?شماره بازیابی\s*(?<reference>\d+).*?ترمینال\s*(?<terminal>[\w.]+)\s*-\s*(?<merchant>.+?)\s+از کانال\s*(?<channel>.+?)\s+با شماره`), // i18n-ignore
        party: ['terminal'],
        self: { debit: { card: 'card' } },
      },
      {
        id: 'parsian-bill',
        kind: 'bill_payment',
        direction: 'debit',
        test: re(String.raw`^خدمات پرداخت با شناسه`), // i18n-ignore
        fields: re(String.raw`شناسه\s*(?<billId>\d+).*?کارت\s*(?<card>\d{16})`), // i18n-ignore
        party: ['billId'],
        self: { debit: { card: 'card' } },
      },
      {
        id: 'parsian-cash',
        kind: 'cash_withdrawal',
        direction: 'debit',
        test: re(String.raw`^برداشت وجه با کارت`), // i18n-ignore
        fields: re(String.raw`کارت\s*(?<card>\d{16})`), // i18n-ignore
        self: { debit: { card: 'card' } },
      },
      {
        id: 'parsian-card-transfer',
        kind: 'card_transfer',
        test: re(String.raw`^انتقال از کارت`), // i18n-ignore
        fields: re(String.raw`^انتقال از کارت\s*(?<fromCard>\d{16})\s*(?<fromName>.*?)\s*به کارت\s*(?<toCard>\d{16})\s*(?<toName>.*?)\s*با شماره بازیابی\s*(?<reference>\d+)`), // i18n-ignore
        party: { debit: ['toCard'], credit: ['fromCard'] },
        self: { debit: { card: 'fromCard', name: 'fromName' }, credit: { card: 'toCard', name: 'toName' } },
      },
      {
        id: 'parsian-account-transfer',
        kind: 'account_transfer',
        test: re(String.raw`^انتقال وجه از طریق`), // i18n-ignore
        // The owner of the other account is named «مبدا» on a deposit and «مقصد» on a withdrawal
        fields: [
          re(String.raw`از حساب\s*(?<fromAccount>\d+)\s+به حساب\s*(?<toAccount>\d+)`), // i18n-ignore
          re(String.raw`صاحب سپرده مبدا:\s*(?<fromName>.+?)\s*$`), // i18n-ignore
          re(String.raw`صاحب سپرده مقصد:\s*(?<toName>.+?)\s*$`), // i18n-ignore
        ],
        party: { debit: ['toAccount'], credit: ['fromAccount'] },
        self: { debit: { account: 'fromAccount' }, credit: { account: 'toAccount' } },
      },
      {
        id: 'parsian-batch-transfer',
        kind: 'batch_transfer',
        test: re(String.raw`^انتقال وجه گروهی`), // i18n-ignore
        fields: re(String.raw`از حساب\s*(?<fromAccount>\d+)`), // i18n-ignore
        party: ['fromAccount'],
      },
      {
        id: 'parsian-own-account',
        kind: 'account_transfer',
        test: re(String.raw`^انتقالی از حساب شماره`), // i18n-ignore
        fields: re(String.raw`از حساب شماره\s*(?<fromAccount>\d+)\s*-?\s*به حساب شماره\s*(?<toAccount>\d+)`), // i18n-ignore
        party: { debit: ['toAccount'], credit: ['fromAccount'] },
        self: { debit: { account: 'fromAccount' }, credit: { account: 'toAccount' } },
      },
      {
        // «تراکنش پُل به مشخصات …، به نامِ X و شماره شبا IR…»
        id: 'parsian-pol',
        kind: 'instant_transfer',
        test: re(String.raw`^تراکنش (?:به همراه کارمزد|پل) `), // i18n-ignore
        fields: re(String.raw`(?:به نام|نام:)\s*\*?(?<name>[^*]+?)\*?\s+(?:و )?(?:شماره )?شبا:?\s*(?<sheba>IR\d{24})`), // i18n-ignore
        party: ['sheba', 'name'],
      },
      {
        id: 'parsian-paya-in',
        kind: 'instant_transfer',
        direction: 'credit',
        test: re(String.raw`^واریز\s*(?:پایا|ساتنا)`), // i18n-ignore
        // «واریز پایا … نام: *X* شبا: IR…» and «واریزساتنا … از شبا IR… به نام X - بابت …»
        fields: [
          re(String.raw`نام:\s*\*?(?<name>[^*]+?)\*?\s+شبا:\s*(?<sheba>IR\d{24})`), // i18n-ignore
          re(String.raw`از شبا\s*(?<sheba>IR\d{24})\s+به نام\s*(?<name>.+?)\s+(?:-|بابت)`), // i18n-ignore
        ],
        party: ['sheba', 'name'],
      },
      {
        id: 'parsian-satna-out',
        kind: 'instant_transfer',
        direction: 'debit',
        test: re(String.raw`^برداشت (?:کارمزد )?دستور پرداخت`), // i18n-ignore
        fields: re(String.raw`شبا\s*(?<sheba>IR\d{24})\s+به نام\s*(?<name>.+?)\s*-`), // i18n-ignore
        party: ['sheba', 'name'],
      },
      {
        id: 'parsian-company',
        kind: 'company_payment',
        direction: 'credit',
        test: re(String.raw`^واریز\s+\d{4}/\d{2}/\d{2}\s`), // i18n-ignore
        fields: re(String.raw`^واریز\s+\d{4}/\d{2}/\d{2}\s+(?<name>.+?)\s+شناسه`), // i18n-ignore
        party: ['name'],
      },
      {
        // «…بابت وصول تسهیلات» taken from the account is an installment being collected
        id: 'parsian-loan-payment',
        kind: 'loan_payment',
        direction: 'debit',
        test: re(String.raw`تسهیلات`), // i18n-ignore
      },
      {
        id: 'parsian-loan-in',
        kind: 'loan_received',
        direction: 'credit',
        test: re(String.raw`تسهیلات`), // i18n-ignore
      },
      {
        id: 'parsian-loan-stamp',
        kind: 'loan_cost',
        direction: 'debit',
        test: re(String.raw`^سند ابطال تمبر`), // i18n-ignore
      },
      {
        id: 'parsian-dividend',
        kind: 'dividend',
        direction: 'credit',
        test: re(String.raw`^سود سهام`), // i18n-ignore
      },
      {
        id: 'parsian-cheque-in',
        kind: 'cheque',
        direction: 'credit',
        test: re(String.raw`^واریز بابت چک`), // i18n-ignore
        fields: re(String.raw`چک شماره\s*(?<chequeNo>\d+)`), // i18n-ignore
        party: ['chequeNo'],
      },
      {
        id: 'parsian-cash-in',
        kind: 'cash_deposit',
        direction: 'credit',
        test: re(String.raw`^واریز نقدی`), // i18n-ignore
      },
      {
        // Every «کارمزد …» line: a transfer's, a cheque's, an SMS plan's
        id: 'parsian-fee',
        kind: 'fee',
        direction: 'debit',
        test: re(String.raw`^(?:انتقالی )?(?:برداشت )?کارمزد`), // i18n-ignore
      },
      {
        // «حساب … بدهکار»: a small debit the bank takes from the account (a service charge)
        id: 'parsian-debit-entry',
        kind: 'fee',
        direction: 'debit',
        test: re(String.raw`^حساب\s*\d+\s*بدهکار`), // i18n-ignore
      },
      {
        // A row that is only the account holder's name
        id: 'parsian-name-only',
        kind: 'other',
        test: re(String.raw`^[آ-ی\s_]{5,40}$`), // i18n-ignore
        fields: re(String.raw`^(?<name>.+)$`),
        party: ['name'],
      },
    ],
  },
];

/** The bank definitions by id */
export const STATEMENT_BANK_BY_ID = Object.fromEntries(STATEMENT_BANKS.map((b) => [b.bankId, b]));
