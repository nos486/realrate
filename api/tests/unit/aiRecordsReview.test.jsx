// @vitest-environment happy-dom
/**
 * aiRecordsReview.test.jsx — The AI assistant's review card: what the voice did not give is asked,
 * and the answer cannot be confirmed until it is complete
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../../web/src/shared/categories/categoryStore.js', () => ({
  listCategories: () => [{ value: 'food', label: 'خوراک' }, { value: 'other', label: 'سایر' }],
  getCategory: () => ({ label: 'خوراک' }),
}));

import RecordsReview from '../../../web/src/features/ai/RecordsReview.jsx';
import { AI_INTENTS } from '../../../web/src/features/ai/aiIntents.js';

const CONTEXT = { accounts: [{ id: 'acc_1', name: 'ملی' }, { id: 'acc_2', name: 'نقد' }] };
const item = (extra = {}) => ({ kind: 'expense', amount: 1000, title: 'نان', category: 'food', date: '2026-11-08', accountId: '', ...extra });

describe('records intent', () => {
  const { ready } = AI_INTENTS.records;
  it('is ready only when every item has a title and an amount', () => {
    expect(ready({ items: [item()] })).toBe(true);
    expect(ready({ items: [item({ amount: 0 })] })).toBe(false);
    expect(ready({ items: [item(), item({ title: ' ' })] })).toBe(false);
    expect(ready({ items: [] })).toBe(false);
  });
});

describe('RecordsReview', () => {
  afterEach(cleanup);
  it('lists the accounts to pick from when none was named, and reports the choice', () => {
    const onChange = vi.fn();
    render(<RecordsReview answer={{ items: [item()] }} onChange={onChange} context={CONTEXT} />);
    const select = screen.getByLabelText('حساب');
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'acc_2' } });
    expect(onChange).toHaveBeenCalledWith({ items: [item({ accountId: 'acc_2' })] });
  });

  it('removes an item', () => {
    const onChange = vi.fn();
    render(<RecordsReview answer={{ items: [item(), item({ title: 'شیر' })] }} onChange={onChange} context={CONTEXT} />);
    fireEvent.click(screen.getAllByLabelText('حذف این مورد')[0]);
    expect(onChange.mock.calls[0][0].items.map((i) => i.title)).toEqual(['شیر']);
  });
});
