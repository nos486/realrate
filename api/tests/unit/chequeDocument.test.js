import { describe, it, expect } from 'vitest';
import {
  validateChequeInput,
  applyChequeStatus,
  buildChequeReminders,
  summarizeCheques,
  statusesFor,
  daysUntilDue,
  toAsciiDigits,
} from '../../src/domain/chequeDocument.js';

const TODAY = '2026-09-25';
const base = {
  direction: 'received',
  amount: 12000000,
  dueDate: '2026-10-01',
  counterparty: '  شرکت نمونه  ',
  bankId: 'mellat',
};

describe('validating a cheque', () => {
  it('normalizes a valid cheque and logs its registration', () => {
    const { value, error } = validateChequeInput(
      { ...base, amount: '۱۲,۰۰۰,۰۰۰', sayadId: '۱۲۳۴ ۵۶۷۸ ۱۲۳۴ ۵۶۷۸', chequeNumber: ' ۹۸۷/۶۵ ' },
      { today: TODAY }
    );
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      direction: 'received',
      status: 'pending',
      amount: 12000000,
      counterparty: 'شرکت نمونه',
      sayadId: '1234567812345678',
      chequeNumber: '987/65',
      issueDate: '',
      history: [{ status: 'pending', date: TODAY, note: '' }],
    });
  });

  it.each([
    ['unknown direction', { direction: 'loan' }],
    ['zero amount', { amount: 0 }],
    ['non-numeric amount', { amount: 'abc' }],
    ['shamsi due date', { dueDate: '1405/07/01' }],
    ['impossible date', { dueDate: '2026-13-40' }],
    ['Shamsi date in ISO shape', { dueDate: '1405-07-03' }],
    ['bad issue date', { issueDate: '2026-02-31x' }],
    ['missing counterparty', { counterparty: '   ' }],
    ['long counterparty', { counterparty: 'x'.repeat(121) }],
    ['short sayad id', { sayadId: '12345' }],
    ['letters in cheque number', { chequeNumber: 'AB12' }],
    ['unknown status', { status: 'lost' }],
    ['deposit status on an issued cheque', { direction: 'issued', status: 'deposited' }],
    ['transfer status on an issued cheque', { direction: 'issued', status: 'transferred' }],
    ['long notes', { notes: 'x'.repeat(501) }],
  ])('rejects %s', (_label, patch) => {
    expect(validateChequeInput({ ...base, ...patch }, { today: TODAY }).error).toBeTruthy();
  });

  it('keeps only valid history entries, capped to the limit', () => {
    const history = [
      { status: 'pending', date: '2026-09-01', note: 'ثبت' },
      { status: 'nope', date: '2026-09-02' },
      { status: 'cleared', date: 'yesterday' },
      ...Array.from({ length: 60 }, (_, i) => ({ status: 'deposited', date: '2026-09-03', note: String(i) })),
    ];
    const { value } = validateChequeInput({ ...base, status: 'deposited', history }, { today: TODAY });
    expect(value.history).toHaveLength(50);
    expect(value.history.at(-1).note).toBe('59');
    expect(value.history.every((h) => ['pending', 'deposited'].includes(h.status))).toBe(true);
  });

  it('offers only the statuses that fit the direction', () => {
    expect(statusesFor('issued').map((s) => s.value)).toEqual(['pending', 'cleared', 'bounced', 'cancelled']);
    expect(statusesFor('received').map((s) => s.value)).toContain('transferred');
  });
});

describe('tracking a cheque', () => {
  it('changes the status and appends the change to its log', () => {
    const { value } = validateChequeInput(base, { today: TODAY });
    const next = applyChequeStatus(value, 'bounced', '2026-10-02', ' کسری موجودی ');
    expect(next.status).toBe('bounced');
    expect(next.history).toEqual([
      { status: 'pending', date: TODAY, note: '' },
      { status: 'bounced', date: '2026-10-02', note: 'کسری موجودی' },
    ]);
    expect(value.status).toBe('pending');
    expect(validateChequeInput(next, { today: TODAY }).value.history).toEqual(next.history);
  });
});

describe('reminders and summary', () => {
  const cheques = [
    { id: 'a', direction: 'received', status: 'pending', amount: 100, dueDate: '2026-09-20' },
    { id: 'b', direction: 'issued', status: 'pending', amount: 200, dueDate: '2026-09-28' },
    { id: 'c', direction: 'received', status: 'deposited', amount: 300, dueDate: '2026-09-25' },
    { id: 'd', direction: 'issued', status: 'cleared', amount: 400, dueDate: '2026-09-21' },
    { id: 'e', direction: 'received', status: 'bounced', amount: 500, dueDate: '2026-09-10' },
    { id: 'f', direction: 'issued', status: 'pending', amount: 600, dueDate: '2026-12-30' },
  ];

  it('counts whole days to the due date', () => {
    expect(daysUntilDue(cheques[0], TODAY)).toBe(-5);
    expect(daysUntilDue(cheques[2], TODAY)).toBe(0);
  });

  it('lists overdue and upcoming open cheques only', () => {
    const { overdue, upcoming } = buildChequeReminders(cheques, TODAY);
    expect(overdue.map((c) => c.id)).toEqual(['a']);
    expect(upcoming.map((c) => [c.id, c.days])).toEqual([['c', 0], ['b', 3]]);
  });

  it('totals receivables, payables and bounced cheques', () => {
    const summary = summarizeCheques(cheques, TODAY);
    expect(summary.receivable).toEqual({ count: 2, total: 400 });
    expect(summary.payable).toEqual({ count: 2, total: 800 });
    expect(summary.bounced).toEqual({ count: 1, total: 500 });
    expect(summary.next30).toEqual({ receivable: 300, payable: 200 });
    expect(summary.nextDue.id).toBe('c');
  });

  it('reads Persian and Arabic digits', () => {
    expect(toAsciiDigits('۱۲۳٤٥')).toBe('12345');
  });
});
