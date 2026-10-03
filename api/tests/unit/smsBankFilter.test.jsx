// @vitest-environment happy-dom
/**
 * smsBankFilter.test.jsx — The SMS inbox filters its messages by bank when they come from more
 * than one, and falls back to all once a bank's messages are handled
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ pending: [] }));
vi.mock('../../../web/src/shared/native/useSmsInbox.js', () => ({
  useSmsInbox: () => ({ pending: state.pending, settings: { auto: true } }),
}));
vi.mock('../../../web/src/shared/native/smsInbox.js', async (orig) => ({
  ...(await orig()),
  smsPermission: async () => 'granted',
}));
const { default: SmsInboxList } = await import('../../../web/src/features/sms-inbox/SmsInboxList.jsx');

const msg = (fingerprint, bankId, amount) => ({ fingerprint, tx: { bankId, direction: 'debit', amount, date: '2026-01-05' } });

afterEach(cleanup);

describe('SMS bank filter', () => {
  it('shows pills per bank and filters the list', () => {
    state.pending = [msg('a', 'mellat', 1000), msg('b', 'saman', 2000), msg('c', 'mellat', 3000)];
    const { container, rerender } = render(<SmsInboxList onRecord={() => {}} />);
    const pills = container.querySelectorAll('.sms-bank-filter .tx-filter-pill');
    expect(pills).toHaveLength(3);
    expect(pills[0].textContent).toContain('همه‌ی بانک‌ها');
    expect(container.querySelectorAll('.sms-inbox-item')).toHaveLength(3);
    fireEvent.click(pills[2]);
    expect(container.querySelectorAll('.sms-inbox-item')).toHaveLength(1);
    // That bank's last message handled: back to every bank
    state.pending = [msg('a', 'mellat', 1000), msg('c', 'mellat', 3000)];
    rerender(<SmsInboxList onRecord={() => {}} />);
    expect(container.querySelector('.sms-bank-filter')).toBeNull();
    expect(container.querySelectorAll('.sms-inbox-item')).toHaveLength(2);
  });
});
