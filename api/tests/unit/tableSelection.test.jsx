// @vitest-environment happy-dom
/**
 * tableSelection.test.jsx — ResponsiveDataTable's row picking (everyday expenses moved to a
 * project): a checkbox per row, the header picks every row shown, picked rows are marked
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import ResponsiveDataTable from '../../../web/src/shared/ui/ResponsiveDataTable.jsx';

const rows = [{ id: 'a', title: 'نان' }, { id: 'b', title: 'شیر' }];
const columns = [{ key: 'title', header: 'عنوان', mobile: 'title', render: (r) => r.title }];

describe('ResponsiveDataTable selection', () => {
  afterEach(cleanup);

  it('a checkbox per row and one for the page; picked rows are marked', () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    const { container, rerender } = render(
      <ResponsiveDataTable columns={columns} rows={rows} selection={{ selected: new Set(), onToggle, onToggleAll, label: (r) => `انتخاب «${r.title}»` }} />,
    );
    fireEvent.click(screen.getByLabelText('انتخاب «شیر»'));
    expect(onToggle).toHaveBeenCalledWith(rows[1]);
    const all = screen.getByLabelText('انتخاب همه‌ی ردیف‌های این صفحه');
    fireEvent.click(all);
    expect(onToggleAll).toHaveBeenCalledWith(true);

    rerender(<ResponsiveDataTable columns={columns} rows={rows} selection={{ selected: new Set(['a']), onToggle, onToggleAll }} />);
    expect(container.querySelectorAll('tr.is-selected')).toHaveLength(1);
    expect(screen.getByLabelText('انتخاب همه‌ی ردیف‌های این صفحه').indeterminate).toBe(true);

    rerender(<ResponsiveDataTable columns={columns} rows={rows} selection={{ selected: new Set(['a', 'b']), onToggle, onToggleAll }} />);
    expect(screen.getByLabelText('انتخاب همه‌ی ردیف‌های این صفحه').checked).toBe(true);
  });

  it('without `selection` there are no checkboxes', () => {
    const { container } = render(<ResponsiveDataTable columns={columns} rows={rows} />);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });
});
