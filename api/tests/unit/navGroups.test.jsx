// @vitest-environment happy-dom
/**
 * navGroups.test.jsx — The app's sections gathered into groups: a group shows only when the user
 * has one of its sections; on the website a group with several sections is a dropdown of them, and
 * the app frame's bottom bar takes
 * the preferred groups (a group with several sections lists them like «ثبت سریع») with the rest
 * grouped under «بیشتر»
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { name: 'Sina', email: 's@example.com' } }) }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'locked' }) }));
vi.mock('../../../web/src/shared/native/smsInbox.js', () => ({ getPendingSms: () => [], SMS_INBOX_EVENT: 'sms-inbox' }));
vi.mock('../../../web/src/shared/alerts/AlertCenter.jsx', () => ({ default: () => null }));
vi.mock('../../../web/src/shared/refresh/PageRefreshButton.jsx', () => ({ default: () => null }));

import { buildNavGroups, groupOfTab } from '../../../web/src/shared/app/navGroups.js';
import GroupTabs from '../../../web/src/shared/app/GroupTabs.jsx';
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
});

describe('the app frame', () => {
  const renderNav = (activeTab, navItems = ALL, onSelect = () => {}) =>
    render(<MemoryRouter><AppBottomNav activeTab={activeTab} navItems={navItems} onSelect={onSelect} /></MemoryRouter>);

  it('puts home, money and wealth on the bottom bar; a group lists its sections like quick add', () => {
    const onSelect = vi.fn();
    const { container } = renderNav('goals', ALL, onSelect);
    const labels = [...container.querySelectorAll('.app-bottom-nav-label')].map((n) => n.textContent);
    expect(labels).toEqual(['خانه', 'پول', 'سرمایه', 'بیشتر']);
    fireEvent.click(screen.getByText('پول'));
    expect(onSelect).not.toHaveBeenCalled();
    const cards = [...container.ownerDocument.querySelectorAll('.app-group-sheet .app-quick-add-item strong')].map((n) => n.textContent);
    expect(cards).toEqual(['expenses', 'incomes', 'accounts']);
    fireEvent.click(screen.getByText('incomes'));
    expect(onSelect).toHaveBeenCalledWith('incomes');
  });

  it('opens a one-section group right away', () => {
    const onSelect = vi.fn();
    renderNav('goals', ALL, onSelect);
    fireEvent.click(screen.getByText('خانه'));
    expect(onSelect).toHaveBeenCalledWith('market');
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

  it('names the open section in the top bar', () => {
    const { container } = render(<MemoryRouter><AppTopBar activeTab="cheques" navItems={ALL} /></MemoryRouter>);
    expect(container.querySelector('.app-topbar-title').textContent).toBe('cheques');
  });
});

describe('the website\'s group tabs', () => {
  const tabGroups = () => buildNavGroups(ALL).filter((g) => !g.menu);

  it('shows one tab per group and marks the open section\'s group', () => {
    const { container } = render(<GroupTabs groups={tabGroups()} activeTab="cheques" onSelect={() => {}} />);
    const labels = [...container.querySelectorAll('.pill-label')].map((n) => n.textContent);
    expect(labels).toEqual(['خانه', 'بازار', 'پول روزانه', 'سرمایه و اهداف', 'تعهدات', 'گزارش‌ها']);
    expect(container.querySelector('.filter-pill-btn.active').textContent).toBe('تعهدات');
  });

  it('opens a one-section group right away', () => {
    const onSelect = vi.fn();
    render(<GroupTabs groups={tabGroups()} activeTab="cheques" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('گزارش‌ها'));
    expect(onSelect).toHaveBeenCalledWith('reports');
  });

  it('lists a group\'s sections in a dropdown, the open one marked', () => {
    const onSelect = vi.fn();
    render(<GroupTabs groups={tabGroups()} activeTab="loans" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('تعهدات'));
    expect(onSelect).not.toHaveBeenCalled();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((n) => n.textContent)).toEqual(['loans', 'cheques', 'subscriptions']);
    expect(items[0].getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByText('cheques'));
    expect(onSelect).toHaveBeenCalledWith('cheques');
  });

  it('opens a group\'s dropdown when the mouse rests on it and closes it after leaving', () => {
    vi.useFakeTimers();
    try {
      render(<GroupTabs groups={tabGroups()} activeTab="loans" onSelect={() => {}} />);
      const menu = screen.getByText('تعهدات').closest('.ui-action-menu');
      fireEvent.pointerEnter(menu, { pointerType: 'mouse' });
      expect(screen.getAllByRole('menuitem')).toHaveLength(3);
      fireEvent.pointerLeave(menu, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
