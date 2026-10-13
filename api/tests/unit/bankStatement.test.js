import { describe, it, expect } from 'vitest';
import {
  normalizeStatementText, parseStatementDateTime, parseStatementAmount, findStatementColumns, readStatement,
  analyzeStatement, resolvePlan, buildRecords, summarizePlan, countBalanceMismatches, indexExisting, statementKeywordRule,
} from '../../src/domain/bankStatement.js';
import { STATEMENT_BANKS, STATEMENT_BANK_BY_ID, STATEMENT_KINDS, STATEMENT_KEYWORD_RULES } from '../../src/domain/bankStatementTemplates.js';
import { validateExpense } from '../../src/domain/expenseDocument.js';
import { validateIncome } from '../../src/domain/incomeDocument.js';
import { validateTransfer } from '../../src/domain/transferDocument.js';
import { BUILTIN_CATEGORIES } from '../../src/domain/categoryDocument.js';
import { smsTransactionKey } from '../../src/domain/bankSms.js';
import {
  parsianSheet, PARSIAN_SAMPLE, OWN_CARD, OWN_ACCOUNT, OTHER_OWN_CARD, OTHER_OWN_ACCOUNT, OWNER,
} from '../helpers/parsianRows.js';

const read = (sample) => readStatement(parsianSheet(sample), 'parsian');
const byDesc = (statement, text) => statement.transactions.filter((t) => t.description.includes(text));
const ACCOUNTS = [
  { id: 'acc_main', name: 'پارسیان', type: 'bank', bankId: 'parsian', cardLast4: '0001', accountNumber: OWN_ACCOUNT },
  { id: 'acc_second', name: 'سینا', type: 'bank', bankId: 'sina', cardLast4: '0002', accountNumber: OTHER_OWN_ACCOUNT },
];

describe('reading cells', () => {
  it('normalizes letters, digits and diacritics', () => {
    expect(normalizeStatementText('  تراکنش پُل  ۱۲۳  كيف ')).toBe('تراکنش پل 123 کیف');
  });

  it('reads a Shamsi date and time, padded or not', () => {
    expect(parseStatementDateTime('1405/06/31 - 17:38:24')).toEqual({ date: '2026-09-22', time: '17:38:24' });
    expect(parseStatementDateTime('1405/06/31 - 16:6:22')).toEqual({ date: '2026-09-22', time: '16:06:22' });
    expect(parseStatementDateTime('۱۴۰۵/۰۶/۳۱')).toEqual({ date: '2026-09-22', time: '' });
    expect(parseStatementDateTime('2026-09-22 10:00')).toEqual({ date: '2026-09-22', time: '10:00:00' });
  });

  it('rejects dates that do not exist', () => {
    expect(parseStatementDateTime('1405/13/01')).toBeNull();
    expect(parseStatementDateTime('1405/07/31')).toBeNull();
    expect(parseStatementDateTime('hello')).toBeNull();
    expect(parseStatementDateTime('1405/06/31 - 25:00:00')).toBeNull();
  });

  it('reads an amount with its sign, doubled minus included', () => {
    expect(parseStatementAmount('- 9,200,000')).toEqual({ value: 9_200_000, sign: '-' });
    expect(parseStatementAmount('+ 1,000')).toEqual({ value: 1000, sign: '+' });
    expect(parseStatementAmount('- -39,227,925,914')).toEqual({ value: 39_227_925_914, sign: '-' });
    expect(parseStatementAmount('۱۲٬۰۰۰')).toEqual({ value: 12000, sign: '' });
    expect(parseStatementAmount('')).toBeNull();
  });
});

describe('finding the table', () => {
  it('maps the header words to columns, leaving the summary box beside the table alone', () => {
    const { headerRow, cols } = findStatementColumns(parsianSheet(), STATEMENT_BANK_BY_ID.parsian);
    expect(headerRow).toBe(0);
    expect(cols).toEqual({ date: 1, description: 2, direction: 3, amount: 4, balance: 5 });
  });

  it('finds a header that is not the first row', () => {
    const rows = [['گردش حساب'], [], ...parsianSheet()];
    expect(findStatementColumns(rows, STATEMENT_BANK_BY_ID.parsian).headerRow).toBe(2);
  });

  it('says so when the file is not the bank\'s export', () => {
    expect(readStatement([['a', 'b'], ['1', '2']], 'parsian')).toMatchObject({ ok: false });
    expect(readStatement(parsianSheet(), 'nobank')).toMatchObject({ ok: false });
  });
});

describe('readStatement (Parsian)', () => {
  const statement = read();

  it('reads every row, in tomans, with the Gregorian day and the direction', () => {
    expect(statement.ok).toBe(true);
    expect(statement.transactions).toHaveLength(PARSIAN_SAMPLE.length);
    expect(statement.skipped).toEqual([]);
    const first = byDesc(statement, 'ترمینال 11111111').find((t) => t.amount === 920_000);
    expect(first).toMatchObject({ date: '2026-07-25', time: '08:05:09', direction: 'debit', kind: 'purchase' });
    expect(statement.period).toEqual({ from: '2026-07-23', to: '2026-08-13' });
  });

  it('keeps the running balance consistent and counts rows that break it', () => {
    expect(statement.balanceMismatches).toBe(0);
    const broken = parsianSheet();
    broken[3][5] = '5,000';
    expect(read2(broken).balanceMismatches).toBeGreaterThan(0);
    function read2(rows) { return readStatement(rows, 'parsian'); }
    expect(countBalanceMismatches([])).toBe(0);
  });

  it('gives every row a distinct key, and the SMS key of the same transaction', () => {
    expect(new Set(statement.transactions.map((t) => t.importKey)).size).toBe(statement.transactions.length);
    const tx = byDesc(statement, 'ترمینال 11111111').find((t) => t.amount === 920_000);
    expect(tx.smsKey).toBe(smsTransactionKey({ bankId: 'parsian', direction: 'debit', amount: 920_000, date: '2026-07-25', time: '08:05' }));
  });

  it('lists the rows it cannot read, never dropping them silently', () => {
    const rows = parsianSheet();
    rows[2][1] = 'not a date';
    rows[3][4] = 'abc';
    rows[4][3] = 'نامشخص';
    rows[4][4] = '1,000';
    const result = readStatement(rows, 'parsian');
    expect(result.skipped.map((s) => s.row)).toEqual([3, 4, 5]);
    expect(result.transactions).toHaveLength(PARSIAN_SAMPLE.length - 3);
  });

  it('classifies each shape of description', () => {
    const kinds = Object.fromEntries(statement.transactions.map((t) => [t.description.slice(0, 18), t.kind]));
    expect(Object.values(kinds)).toEqual(expect.arrayContaining([
      'purchase', 'card_transfer', 'account_transfer', 'batch_transfer', 'instant_transfer', 'company_payment',
      'fee', 'cheque', 'loan_received', 'loan_payment', 'dividend', 'bill_payment', 'cash_withdrawal', 'reversal',
    ]));
    expect(statement.transactions.filter((t) => t.kind === 'other')).toHaveLength(0);
  });

  it('reads the fields a description names', () => {
    const purchase = byDesc(statement, 'داروخانه')[0];
    expect(purchase.fields).toMatchObject({ card: OWN_CARD, terminal: '33333333', merchant: 'داروخانه دکتر نمونه', reference: '100000000004' });
    const incoming = byDesc(statement, 'مریم کریمی')[0];
    expect(incoming.fields).toMatchObject({ fromCard: '6219000000000003', fromName: 'مریم کریمی', toCard: OWN_CARD, toName: OWNER });
    const pol = byDesc(statement, 'علی رضایی')[0];
    expect(pol.fields).toMatchObject({ name: 'علی رضایی', sheba: 'IR000000000000000000000001' });
    const outgoingAccount = byDesc(statement, 'صاحب سپرده مقصد')[0];
    expect(outgoingAccount.fields).toMatchObject({ fromAccount: OWN_ACCOUNT, toAccount: OTHER_OWN_ACCOUNT, toName: OWNER });
    const paya = byDesc(statement, 'واریز پایا')[0];
    expect(paya.fields).toMatchObject({ name: 'کارگزاری نمونه', sheba: 'IR000000000000000000000003' });
    expect(byDesc(statement, 'چک شماره')[0].fields.chequeNo).toBe('700123');
  });

  it('takes a withdrawal of «وصول تسهیلات» as an installment and a deposit as the loan received', () => {
    expect(byDesc(statement, 'وصول تسهیلات')[0]).toMatchObject({ direction: 'debit', kind: 'loan_payment' });
    expect(byDesc(statement, 'بهاءامول')[0]).toMatchObject({ direction: 'credit', kind: 'loan_received' });
  });
});

describe('analyzeStatement', () => {
  const statement = read();
  const analysis = analyzeStatement(statement.transactions, { accounts: ACCOUNTS, accountId: 'acc_main' });
  const group = (predicate) => analysis.groups.find(predicate);

  it('learns the user\'s own card, account and name from their side of the rows', () => {
    expect(analysis.own.cards).toContain(OWN_CARD);
    expect(analysis.own.accounts).toContain(OWN_ACCOUNT);
    expect(analysis.own.hasNames).toBe(true);
  });

  it('groups rows by the other side: two deposits from one account, the purchases at one terminal', () => {
    const batch = group((g) => g.kind === 'batch_transfer');
    expect(batch).toMatchObject({ count: 2, total: 150_000_000, direction: 'credit' });
    const terminal = group((g) => g.label.includes('11111111'));
    expect(terminal).toMatchObject({ count: 2, kind: 'purchase' });
    const sameCard = group((g) => g.kind === 'card_transfer' && g.direction === 'credit');
    expect(sameCard.count).toBe(2);
    expect(sameCard.partyName).toBe('مریم کریمی');
    const toCard = group((g) => g.kind === 'card_transfer' && g.direction === 'debit' && g.label.includes('0009'));
    expect(toCard.count).toBe(2);
  });

  it('asks about what the bank\'s words do not settle, and not about what they do', () => {
    expect(group((g) => g.kind === 'batch_transfer').needsAnswer).toBe(true);
    expect(group((g) => g.kind === 'fee').needsAnswer).toBe(false);
    expect(group((g) => g.kind === 'loan_received').suggestion).toMatchObject({ category: 'loan_received', confidence: 'high' });
    expect(group((g) => g.kind === 'loan_payment').suggestion).toMatchObject({ category: 'installments', confidence: 'high' });
    expect(group((g) => g.kind === 'dividend').suggestion).toMatchObject({ category: 'investment' });
    expect(group((g) => g.kind === 'bill_payment').suggestion).toMatchObject({ category: 'bills' });
  });

  it('suggests a category from the other side\'s own words', () => {
    expect(group((g) => g.label.includes('داروخانه') || g.label.includes('33333333')).suggestion).toMatchObject({ category: 'health', confidence: 'medium', reason: 'keyword' });
    expect(group((g) => g.partyName === 'کارگزاری نمونه').suggestion).toMatchObject({ category: 'asset_sale', confidence: 'medium' });
  });

  it('does not read the bank\'s boilerplate as a keyword («از کانال اینترنت بانک»)', () => {
    const tx = byDesc(statement, 'ترمینال 22222222')[0];
    expect(statementKeywordRule(tx)).toBeNull();
  });

  it('recognises transfers to the user\'s other accounts, by card and by account number', () => {
    const byCard = analysis.transactions.find((t) => t.description.includes(`به کارت ${OTHER_OWN_CARD}`));
    expect(byCard.partyAccountId).toBe('acc_second');
    expect(byCard.suggestion).toMatchObject({ action: 'transfer', accountId: 'acc_second', confidence: 'high', reason: 'own_account' });
    const byAccount = analysis.transactions.find((t) => t.description.includes(`به حساب ${OTHER_OWN_ACCOUNT}`));
    expect(byAccount.partyAccountId).toBe('acc_second');
    expect(byAccount.suggestion.action).toBe('transfer');
    // Without that account among the user's, they are plain expenses to answer about
    const unknown = analyzeStatement(statement.transactions, { accounts: [ACCOUNTS[0]], accountId: 'acc_main' });
    expect(unknown.transactions.find((t) => t.id === byCard.id).partyAccountId).toBe('');
  });

  it('takes a name that is the user\'s own for a probable transfer, with the account still to choose', () => {
    const none = analyzeStatement(statement.transactions, { accounts: [ACCOUNTS[0]], accountId: 'acc_main' });
    const toSelf = none.transactions.find((t) => t.description.includes(`به حساب ${OTHER_OWN_ACCOUNT}`));
    expect(toSelf.suggestion).toMatchObject({ action: 'transfer', accountId: '', confidence: 'none', reason: 'own_name' });
  });

  it('never makes the account imported into the other side of its own transfer', () => {
    const only = analyzeStatement(statement.transactions, { accounts: [ACCOUNTS[0]], accountId: 'acc_main' });
    expect(only.transactions.every((t) => t.partyAccountId !== 'acc_main')).toBe(true);
  });

  it('pairs a reversal with its purchase and leaves both out', () => {
    const reversed = analysis.transactions.filter((t) => t.reversed);
    expect(reversed.map((t) => t.kind).sort()).toEqual(['purchase', 'reversal']);
  });

  it('finds what is already recorded: this file, an SMS, or the same day and amount by hand', () => {
    const first = statement.transactions.find((t) => t.description.includes('ترمینال 11111111') && t.amount === 920_000);
    const second = statement.transactions.find((t) => t.description.includes('ترمینال 11111111') && t.amount === 18_000_000);
    const third = statement.transactions.find((t) => t.description.includes('ترمینال 22222222'));
    const existing = {
      expenses: [
        { importKey: first.importKey, date: first.date, amount: first.amount },
        { smsKey: smsTransactionKey({ bankId: 'parsian', direction: 'debit', amount: second.amount, date: second.date, time: second.time.slice(0, 5) }), date: second.date, amount: second.amount },
        { date: third.date, amount: third.amount, currency: 'IRT' },
      ],
      incomes: [], transfers: [],
    };
    const marked = analyzeStatement(statement.transactions, { accounts: ACCOUNTS, accountId: 'acc_main', existing });
    const status = (tx) => marked.transactions.find((t) => t.id === tx.id).duplicate;
    expect(status(first)).toBe('exact');
    expect(status(second)).toBe('exact');
    expect(status(third)).toBe('maybe');
    expect(marked.transactions.filter((t) => t.duplicate)).toHaveLength(3);
  });

  it('lets one hand-recorded expense cover only one of two identical rows', () => {
    const twin = { date: '2026-07-25', amount: 920_000, currency: 'IRT' };
    const rows = [...statement.transactions, { ...statement.transactions.find((t) => t.amount === 920_000), id: 'twin', importKey: 'imp|twin', smsKey: 'twin' }];
    const marked = analyzeStatement(rows, { existing: { expenses: [twin] } });
    expect(marked.transactions.filter((t) => t.duplicate === 'maybe')).toHaveLength(1);
  });

  it('never counts a foreign-currency record as the same bank row', () => {
    const index = indexExisting({ expenses: [{ date: '2026-07-25', amount: 920_000, currency: 'USD' }] });
    expect(index.byHand.size).toBe(0);
  });
});

describe('resolvePlan', () => {
  const statement = read();
  const analysis = analyzeStatement(statement.transactions, { accounts: ACCOUNTS, accountId: 'acc_main' });
  const plan = (options = {}) => resolvePlan(analysis, { accountId: 'acc_main', ...options });
  const rowOf = (rows, text, amount) => rows.find((r) => r.tx.description.includes(text) && (!amount || r.tx.amount === amount));

  it('records a confident kind by itself and the rest as «سایر»', () => {
    const rows = plan();
    expect(rowOf(rows, 'کارمزد تمدید').decision).toMatchObject({ action: 'expense', category: 'credit_fees' });
    expect(rowOf(rows, 'کارمزد تمدید').title).toBe('کارمزد بانکی');
    expect(rowOf(rows, 'ترمینال 22222222').decision).toMatchObject({ action: 'expense', category: 'other' });
    expect(rowOf(rows, 'ترمینال 22222222').source).toBe('default');
    expect(rowOf(rows, 'مریم کریمی').decision).toMatchObject({ action: 'income', category: 'other' });
  });

  it('puts small expenses nobody was asked about in one category', () => {
    const rows = plan({ small: { enabled: true, maxToman: 2_000_000, category: 'running_costs' } });
    expect(rowOf(rows, 'ترمینال 11111111', 920_000)).toMatchObject({ source: 'small', decision: { category: 'running_costs' } });
    // …but not the big one, a confident kind, or a deposit
    expect(rowOf(rows, 'ترمینال 11111111', 18_000_000).source).toBe('default');
    expect(rowOf(rows, 'کارمزد تمدید').source).toBe('suggestion');
    expect(rowOf(rows, 'مریم کریمی').decision.category).toBe('other');
  });

  it('lets a group answer apply to all its rows, and a row override beat the group', () => {
    const batch = analysis.groups.find((g) => g.kind === 'batch_transfer');
    const answers = { [batch.key]: { action: 'income', category: 'salary', title: 'حقوق شرکت' } };
    let rows = plan({ answers });
    const salary = rows.filter((r) => r.groupKey === batch.key);
    expect(salary).toHaveLength(2);
    expect(salary.every((r) => r.decision.category === 'salary' && r.title === 'حقوق شرکت' && r.source === 'group')).toBe(true);
    rows = plan({ answers, rowOverrides: { [salary[0].tx.id]: { action: 'income', category: 'bonus' } } });
    expect(rows.find((r) => r.tx.id === salary[0].tx.id)).toMatchObject({ source: 'row', decision: { category: 'bonus' } });
    expect(rows.find((r) => r.tx.id === salary[1].tx.id).decision.category).toBe('salary');
  });

  it('keeps a debit an expense and a credit an income whatever was answered', () => {
    const batch = analysis.groups.find((g) => g.kind === 'batch_transfer');
    const rows = plan({ answers: { [batch.key]: { action: 'expense', category: 'bills' } } });
    expect(rows.filter((r) => r.groupKey === batch.key).every((r) => r.decision.action === 'income')).toBe(true);
  });

  it('needs the other account of a transfer, and says so', () => {
    const group = analysis.groups.find((g) => g.kind === 'card_transfer' && g.direction === 'debit');
    const without = plan({ answers: { [group.key]: { action: 'transfer', accountId: '' } } }).filter((r) => r.groupKey === group.key);
    expect(without.every((r) => r.issue && !r.included)).toBe(true);
    const same = plan({ answers: { [group.key]: { action: 'transfer', accountId: 'acc_main' } } }).filter((r) => r.groupKey === group.key);
    expect(same.every((r) => r.issue)).toBe(true);
    const ok = plan({ answers: { [group.key]: { action: 'transfer', accountId: 'acc_second' } } }).filter((r) => r.groupKey === group.key);
    expect(ok.every((r) => !r.issue && r.included)).toBe(true);
  });

  it('saves new rows, and leaves out reversed, recorded and skipped ones unless asked', () => {
    const first = statement.transactions.find((t) => t.description.includes('ترمینال 11111111') && t.amount === 920_000);
    const marked = analyzeStatement(statement.transactions, {
      accounts: ACCOUNTS, accountId: 'acc_main',
      existing: { expenses: [{ importKey: first.importKey, date: first.date, amount: first.amount }] },
    });
    const rows = resolvePlan(marked, { accountId: 'acc_main' });
    expect(rows.find((r) => r.tx.id === first.id)).toMatchObject({ status: 'duplicate', included: false });
    const reversed = rows.filter((r) => r.status === 'reversed');
    expect(reversed).toHaveLength(2);
    expect(reversed.every((r) => !r.included)).toBe(true);
    // The user can bring back a reversed row, never a recorded one
    const forced = resolvePlan(marked, { accountId: 'acc_main', include: { [reversed[0].tx.id]: true, [first.id]: true } });
    expect(forced.find((r) => r.tx.id === reversed[0].tx.id).included).toBe(true);
    expect(forced.find((r) => r.tx.id === first.id).included).toBe(false);
    const skipped = resolvePlan(marked, { accountId: 'acc_main', rowOverrides: { [rows[0].tx.id]: { action: 'skip' } } });
    expect(skipped[0]).toMatchObject({ included: false });
  });

  it('summarizes what will be saved', () => {
    const summary = summarizePlan(plan());
    expect(summary.expense.count + summary.income.count + summary.transfer.count + summary.reversed).toBe(PARSIAN_SAMPLE.length);
    expect(summary.reversed).toBe(2);
    expect(summary.transfer.count).toBe(2);
  });
});

describe('buildRecords', () => {
  const statement = read();
  const analysis = analyzeStatement(statement.transactions, { accounts: ACCOUNTS, accountId: 'acc_main' });
  const toCard = analysis.groups.find((g) => g.kind === 'card_transfer' && g.direction === 'debit' && g.label.includes('0009'));
  const plan = resolvePlan(analysis, {
    accountId: 'acc_main',
    answers: { [toCard.key]: { action: 'transfer', accountId: 'acc_second' } },
    small: { enabled: true, maxToman: 2_000_000, category: 'running_costs' },
  });
  const records = buildRecords(plan, { accountId: 'acc_main', bankId: 'parsian' });

  it('makes records the documents accept, every one of them', () => {
    expect(records.expenses.length).toBeGreaterThan(0);
    expect(records.incomes.length).toBeGreaterThan(0);
    expect(records.transfers).toHaveLength(4);
    for (const e of records.expenses) expect(validateExpense({ ...e, groupId: 'grp_1' }).error, JSON.stringify(e)).toBeUndefined();
    for (const i of records.incomes) expect(validateIncome(i).error, JSON.stringify(i)).toBeUndefined();
    for (const t of records.transfers) expect(validateTransfer(t).error, JSON.stringify(t)).toBeUndefined();
  });

  it('marks them as imported, with the row\'s key and the bank', () => {
    const e = validateExpense({ ...records.expenses[0], groupId: 'grp_1' }).value;
    expect(e).toMatchObject({ source: 'import', bankId: 'parsian', accountId: 'acc_main', currency: 'IRT' });
    expect(e.importKey).toMatch(/^imp\|parsian\|/);
    const i = validateIncome(records.incomes[0]).value;
    expect(i).toMatchObject({ source: 'import', bankId: 'parsian', accountId: 'acc_main' });
    expect(i.importKey).toMatch(/^imp\|parsian\|/);
    expect(validateTransfer(records.transfers[0]).value.importKeys).toHaveLength(1);
  });

  it('puts a withdrawal\'s transfer from this account, a deposit\'s into it', () => {
    expect(records.transfers.filter((t) => t.fromAccountId === 'acc_main' && t.toAccountId === 'acc_second')).toHaveLength(4);
    const deposit = analysis.groups.find((g) => g.kind === 'card_transfer' && g.direction === 'credit');
    const incoming = buildRecords(resolvePlan(analysis, { accountId: 'acc_main', answers: { [deposit.key]: { action: 'transfer', accountId: 'acc_second' } } }), { accountId: 'acc_main', bankId: 'parsian' });
    expect(incoming.transfers.filter((t) => t.toAccountId === 'acc_main')).toHaveLength(2);
    expect(incoming.transfers.filter((t) => t.fromAccountId === 'acc_second')).toHaveLength(2);
  });

  it('keeps the bank\'s own description in the note, and the title short', () => {
    expect(records.expenses[0].notes).toMatch(/^ورودی از فایل/);
    expect(records.expenses.every((e) => e.notes.length <= 500 && e.title.length <= 120)).toBe(true);
  });

  it('saves nothing twice: a left-out row is not in the records', () => {
    const total = records.expenses.length + records.incomes.length + records.transfers.length;
    expect(total).toBe(PARSIAN_SAMPLE.length - 2);
  });

  it('writes an amount in tomans (the file is in rials)', () => {
    const rial = PARSIAN_SAMPLE.find((r) => r[4] === 9_200_000)[4];
    expect(records.expenses.some((e) => e.amount === rial / 10 && e.category === 'running_costs')).toBe(true);
  });
});

describe('the tables', () => {
  it('only name categories that exist', () => {
    const expense = new Set(BUILTIN_CATEGORIES.expense.map((c) => c.value));
    const income = new Set(BUILTIN_CATEGORIES.income.map((c) => c.value));
    for (const kind of Object.values(STATEMENT_KINDS)) {
      if (kind.debit?.category) expect(expense.has(kind.debit.category)).toBe(true);
      if (kind.credit?.category) expect(income.has(kind.credit.category)).toBe(true);
    }
    for (const rule of STATEMENT_KEYWORD_RULES) expect((rule.direction === 'debit' ? expense : income).has(rule.category), rule.words[0]).toBe(true);
  });

  it('give every rule a kind, a unique id and a bank in the picker', () => {
    for (const bank of STATEMENT_BANKS) {
      expect(new Set(bank.rules.map((r) => r.id)).size).toBe(bank.rules.length);
      for (const rule of bank.rules) {
        expect(STATEMENT_KINDS[rule.kind], rule.id).toBeTruthy();
        expect(rule.id.startsWith(`${bank.bankId}-`)).toBe(true);
      }
    }
  });
});
