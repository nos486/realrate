// @vitest-environment happy-dom
/**
 * navGroups.test.jsx — The app's sections gathered into groups: a group shows only when the user
 * has one of its sections, reopens the section opened last, and the app frame's bottom bar takes
 * the preferred groups with the rest grouped under «بیشتر»
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { name: 'Sina', email: 's@example.com' } }) }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'locked' }) }));
vi.mock('../../../web/src/shared/native/smsInbox.js', () => ({ getPendingSms: () => [], SMS_INBOX_EVENT: 'sms-inbox' }));
vi.mock('../../../web/src/shared/alerts/AlertCenter.jsx', () => ({ default: () => null }));
vi.mock('../../../web/src/shared/refresh/PageRefreshButton.jsx', () => ({ default: () => null }));

import { buildNavGroups, groupOfTab, groupTarget, rememberGroupTab } from '../../../web/src/shared/app/navGroups.js';
import { AppBottomNav, AppTopBar } from '../../../web/src/shared/app/AppShell.jsx';

const item = (value, label = value) => ({ value, label });
const ALL = ['market', 'rates', 'news', 'expenses', 'incomes', 'accounts', 'portfolio', 'goals', 'loans', 'cheques', 'subscriptions', 'reports', 'settings', 'admin'].map((v) => item(v));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('nav groups', () => {
  it('keeps only the groups with one of the user\'s sections, in the table\'s order', () => {
    const groups = buildNavGroups([item('loans'), item('market'), item('incomes'), item('settings')]);
    expect(groups.map((g) => g.key)).toEqual(['home', 'money', 'plans', 'account']);
    expect(groups.find((g) => g.key === 'money').items.map((i) => i.value)).toEqual(['incomes']);
  });

  it('finds the group of a tab', () => {
    const groups = buildNavGroups(ALL);
    expect(groupOfTab(groups, 'cheques').key).toBe('plans');
    expect(groupOfTab(groups, 'goals').key).toBe('wealth');
    expect(groupOfTab(groups, 'nothing')).toBeNull();
  });

  it('opens the section opened last, or the first one', () => {
    const money = buildNavGroups(ALL).find((g) => g.key === 'money');
    expect(groupTarget(money)).toBe('expenses');
    rememberGroupTab('money', 'accounts');
    expect(groupTarget(money)).toBe('accounts');
    // A section the user no longer has: back to the first
    rememberGroupTab('money', 'projects');
    expect(groupTarget(money)).toBe('expenses');
  });

  it('never reopens the admin area', () => {
    const account = buildNavGroups([item('admin'), item('settings')]).find((g) => g.key === 'account');
    rememberGroupTab('account', 'admin');
    expect(groupTarget(account)).toBe('settings');
  });
});

describe('the app frame', () => {
  const renderNav = (activeTab, navItems = ALL, onSelect = () => {}) =>
    render(<MemoryRouter><AppBottomNav activeTab={activeTab} navItems={navItems} onSelect={onSelect} /></MemoryRouter>);

  it('puts home, money and wealth on the bottom bar and opens a group\'s section', () => {
    const onSelect = vi.fn();
    const { container } = renderNav('market', ALL, onSelect);
    const labels = [...container.querySelectorAll('.app-bottom-nav-label')].map((n) => n.textContent);
    expect(labels).toEqual(['خانه', 'پول', 'سرمایه', 'بیشتر']);
    rememberGroupTab('money', 'incomes');
    fireEvent.click(screen.getByText('پول'));
    expect(onSelect).toHaveBeenCalledWith('incomes');
  });

  it('marks the group of the open section as active', () => {
    const { container } = renderNav('goals');
    expect(container.querySelector('.app-bottom-nav-item.is-active').textContent).toBe('سرمایه');
  });

  it('fills the bar with the next groups when a preferred one is missing', () => {
    const { container } = renderNav('market', [item('market'), item('rates'), item('loans'), item('settings')]);
    const labels = [...container.querySelectorAll('.app-bottom-nav-label')].map((n) => n.textContent);
    expect(labels).toEqual(['خانه', 'بازار', 'تعهدات', 'بیشتر']);
  });

  it('groups the other sections under «بیشتر»', () => {
    const { container } = renderNav('market');
    fireEvent.click([...container.querySelectorAll('.app-bottom-nav-item')].at(-1));
    const titles = [...container.ownerDocument.querySelectorAll('.app-more-group-title')].map((n) => n.textContent);
    expect(titles).toEqual(['بازار', 'تعهدات', 'گزارش‌ها', 'حساب کاربری']);
  });

  it('names a page with sub-tabs by its group in the top bar', () => {
    const { container } = render(<MemoryRouter><AppTopBar activeTab="cheques" navItems={ALL} /></MemoryRouter>);
    expect(container.querySelector('.app-topbar-title').textContent).toBe('تعهدات');
  });
});
