// @vitest-environment happy-dom
/**
 * statementImportModal.test.jsx — «ورود اطلاعات از همراه بانک» end to end in the browser: a
 * (generated) Parsian .xlsx is read, the user answers a group, reviews, and the records are saved
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { buildXlsx } from '../helpers/xlsx.js';
import { parsianSheet, OTHER_OWN_CARD } from '../helpers/parsianRows.js';
import { BUILTIN_CATEGORIES } from '../../src/domain/categoryDocument.js';

const data = vi.hoisted(() => ({
  loadExistingRecords: vi.fn(async () => ({ expenses: [], incomes: [], transfers: [] })),
  loadLinkCandidates: vi.fn(async () => ({
    cheques: [{ id: 'chq_1', direction: 'received', status: 'pending', chequeNumber: '700123', counterparty: 'علی' }],
    installments: [],
    subscriptions: [],
  })),
  saveImport: vi.fn(async (records, { onProgress } = {}) => {
    onProgress?.(1, 1);
    const withIds = (list, prefix) => list.map((r, i) => ({ id: `${prefix}_${i}`, ...r }));
    return { saved: { expenses: withIds(records.expenses, 'exp'), incomes: withIds(records.incomes, 'inc'), transfers: withIds(records.transfers, 'trf') }, error: '' };
  }),
  undoImport: vi.fn(async () => {}),
}));
vi.mock('../../../web/src/features/accounts/statement-import/statementImportData.js', () => data);
vi.mock('../../../web/src/shared/categories/useCategories.js', () => ({
  useCategories: (kind) => BUILTIN_CATEGORIES[kind].filter((c) => !c.retired),
}));

import StatementImportModal from '../../../web/src/features/accounts/statement-import/StatementImportModal.jsx';

const ACCOUNT = { id: 'acc_main', name: 'پارسیان', type: 'bank', bankId: 'parsian', cardLast4: '0001', accountNumber: '30100000000001' };
const SECOND = { id: 'acc_second', name: 'سینا', type: 'bank', bankId: 'sina', cardLast4: OTHER_OWN_CARD.slice(-4), accountNumber: '20100000000002', currencies: ['IRT'] };

/** A File whose bytes are a generated Parsian statement */
function statementFile(sheet = parsianSheet()) {
  const bytes = buildXlsx(sheet);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { name: 'parsian.xlsx', arrayBuffer: async () => buffer };
}

async function openFile(onClose = vi.fn(), onImported = vi.fn()) {
  render(<StatementImportModal account={ACCOUNT} accounts={[ACCOUNT, SECOND]} onClose={onClose} onImported={onImported} />);
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [statementFile()], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByText('ادامه').closest('button').disabled).toBe(false));
  return { onClose, onImported };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StatementImportModal', () => {
  it('reads the file and shows what it found before anything is asked', async () => {
    await openFile();
    expect(screen.getByText('parsian.xlsx')).toBeTruthy();
    // 26 rows, read on the device
    expect(document.body.textContent).toContain('۲۷');
    expect(data.loadExistingRecords).toHaveBeenCalledWith({ from: '2026-07-23', to: '2026-08-13' });
    expect(data.saveImport).not.toHaveBeenCalled();
  });

  it('warns when the file belongs to another account', async () => {
    render(<StatementImportModal account={{ ...ACCOUNT, cardLast4: '9999' }} accounts={[ACCOUNT]} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [statementFile()], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(document.body.textContent).toMatch(/با این حساب نمی‌خواند/));
  });

  it('says so when the file is not a statement', async () => {
    render(<StatementImportModal account={ACCOUNT} accounts={[ACCOUNT]} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [statementFile([['a', 'b'], ['1', '2']])], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(document.body.textContent).toMatch(/ستون‌های فایل/));
    expect(screen.getByText('ادامه').closest('button').disabled).toBe(true);
  });

  it('asks about a group, applies the answer to all its rows, and saves only after the review', async () => {
    const { onImported } = await openFile();
    fireEvent.click(screen.getByText('ادامه'));

    // The two deposits from one account are one question
    const question = [...document.querySelectorAll('.statement-question')].find((q) => q.textContent.includes('واریز گروهی'));
    expect(question.textContent).toContain('۲ تراکنش');
    fireEvent.change(question.querySelector('select'), { target: { value: 'salary' } });
    fireEvent.change(question.querySelector('input.statement-input'), { target: { value: 'حقوق شرکت' } });
    expect(question.textContent).toContain('پاسخ داده شد');

    fireEvent.click(screen.getByText('بازبینی همه‌ی ردیف‌ها'));
    expect(data.saveImport).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('حقوق شرکت');

    fireEvent.click(screen.getByText(/^ثبت .* مورد$/));
    await waitFor(() => expect(data.saveImport).toHaveBeenCalledTimes(1));
    const records = data.saveImport.mock.calls[0][0];
    const salary = records.incomes.filter((i) => i.category === 'salary');
    expect(salary).toHaveLength(2);
    expect(salary.every((i) => i.title === 'حقوق شرکت' && i.accountId === 'acc_main' && i.source === 'import')).toBe(true);
    // The other account's card is recognised: a transfer, not an expense
    expect(records.transfers.some((t) => t.fromAccountId === 'acc_main' && t.toAccountId === 'acc_second')).toBe(true);
    // The cheque the statement names is linked to the cheque in the app
    expect(records.incomes.find((i) => i.chequeId === 'chq_1')).toBeTruthy();
    // Reversed purchases are not saved
    expect(records.expenses.length + records.incomes.length + records.transfers.length).toBe(25);

    await waitFor(() => expect(document.body.textContent).toMatch(/مورد ثبت شد/));
    fireEvent.click(screen.getByText('بستن'));
    expect(onImported).toHaveBeenCalled();
  });

  it('lets one row be left out and one be changed in the review', async () => {
    await openFile();
    fireEvent.click(screen.getByText('ادامه'));
    fireEvent.click(screen.getByText('بازبینی همه‌ی ردیف‌ها'));
    const rowFor = (text) => [...document.querySelectorAll('.statement-row')].find((r) => r.textContent.includes(text));
    const dividend = rowFor('سود سهام');
    fireEvent.click(within(dividend).getByRole('checkbox'));
    const fee = rowFor('کارمزد بانکی');
    fireEvent.click(fee.querySelector('.statement-row-body'));
    fireEvent.change(fee.querySelector('select'), { target: { value: 'bills' } });
    fireEvent.click(screen.getByText(/^ثبت .* مورد$/));
    await waitFor(() => expect(data.saveImport).toHaveBeenCalled());
    const records = data.saveImport.mock.calls[0][0];
    expect(records.incomes.some((i) => i.title === 'سود سهام')).toBe(false);
    expect(records.expenses.some((e) => e.title === 'کارمزد بانکی' && e.category === 'bills')).toBe(true);
  });

  it('can take everything back after saving, and reports a partial save', async () => {
    await openFile();
    fireEvent.click(screen.getByText('ادامه'));
    fireEvent.click(screen.getByText('بازبینی همه‌ی ردیف‌ها'));
    fireEvent.click(screen.getByText(/^ثبت .* مورد$/));
    await waitFor(() => expect(screen.getByText(/بازگرداندن همه/)).toBeTruthy());
    fireEvent.click(screen.getByText(/بازگرداندن همه/));
    await waitFor(() => expect(data.undoImport).toHaveBeenCalledTimes(1));
    expect(data.undoImport.mock.calls[0][0].expenses.length).toBeGreaterThan(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/برگردانده شد/));
  });

  it('tells what was not saved when the store stops midway', async () => {
    data.saveImport.mockImplementationOnce(async () => ({ saved: { expenses: [{ id: 'e1' }], incomes: [], transfers: [] }, error: 'پلن رایگان فقط ۳۰ ثبت در ماه را اجازه می‌دهد.' }));
    await openFile();
    fireEvent.click(screen.getByText('ادامه'));
    fireEvent.click(screen.getByText('بازبینی همه‌ی ردیف‌ها'));
    fireEvent.click(screen.getByText(/^ثبت .* مورد$/));
    await waitFor(() => expect(document.body.textContent).toMatch(/پلن رایگان/));
    expect(document.body.textContent).toMatch(/دوباره بدهید/);
  });
});
