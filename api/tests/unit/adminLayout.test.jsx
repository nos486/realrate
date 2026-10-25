// @vitest-environment happy-dom
/**
 * adminLayout.test.jsx — The admin area's frame: every section is in one group with its own
 * address, and a page's tabs keep the open one in the address and their panels mounted.
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { ADMIN_GROUPS, ADMIN_SECTIONS } from '../../../web/src/features/admin/adminSections.js';
import { AdminTabs } from '../../../web/src/features/admin/components/AdminPage.jsx';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('admin sections', () => {
  it('every section has one group, a unique address and a header', () => {
    const sections = ADMIN_GROUPS.flatMap((g) => g.sections);
    expect(new Set(sections.map((s) => s.path)).size).toBe(sections.length);
    expect(Object.keys(ADMIN_SECTIONS)).toHaveLength(sections.length);
    for (const s of sections) {
      expect(s.path.startsWith('/admin')).toBe(true);
      expect(s.title && s.subtitle && s.icon).toBeTruthy();
    }
  });
});

describe('AdminTabs', () => {
  const TABS = [
    { id: 'a', label: 'یک', content: <input aria-label="فیلد یک" /> },
    { id: 'b', label: 'دو', badge: 3, content: <p>پنل دو</p> },
  ];

  it('opens the tab the address names, writes the chosen one back, and keeps the others mounted', () => {
    window.history.replaceState(null, '', '/admin/x?tab=b');
    render(<AdminTabs label="بخش‌ها" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'دو' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('۳')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'یک' }));
    expect(window.location.search).toBe('');
    fireEvent.change(screen.getByLabelText('فیلد یک'), { target: { value: 'نیمه‌کاره' } });
    fireEvent.click(screen.getByRole('tab', { name: 'دو' }));
    expect(window.location.search).toBe('?tab=b');
    // The first panel is only hidden: what was typed is still there
    expect(screen.getByLabelText('فیلد یک').value).toBe('نیمه‌کاره');
  });

  it('opens the initial tab when the address names none', () => {
    render(<AdminTabs label="بخش‌ها" tabs={TABS} initial="b" />);
    expect(screen.getByRole('tab', { name: 'دو' }).getAttribute('aria-selected')).toBe('true');
  });
});
