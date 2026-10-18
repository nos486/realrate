// @vitest-environment happy-dom
/**
 * dashboardWidgets.test.jsx — The home page's edit mode: a widget in view mode is just its
 * content, in edit mode it gets the bar (move, height, set up, remove), and the picker offers
 * only the widgets the user can see, once for the unique ones
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

vi.mock('../../../web/src/features/dashboard/widgetRegistry.jsx', async () => {
  const { WIDGET_TYPES } = await import('../../src/domain/dashboardLayout.js');
  const View = ({ widget }) => <p>content {widget.type}</p>;
  return { WIDGET_VIEWS: Object.fromEntries(WIDGET_TYPES.map((type) => [type, { Icon: () => <i />, Component: View }])) };
});

import WidgetFrame from '../../../web/src/features/dashboard/WidgetFrame.jsx';
import WidgetPicker from '../../../web/src/features/dashboard/WidgetPicker.jsx';
import { sanitizeWidgets } from '../../src/domain/dashboardLayout.js';

afterEach(cleanup);

const [news] = sanitizeWidgets([{ type: 'news' }]);
const frame = (props) => render(
  <DndContext>
    <SortableContext items={[news.id]}>
      <WidgetFrame widget={news} editing={false} available sizable first last onHeight={() => {}} onMove={() => {}} onSettings={() => {}} onRemove={() => {}} {...props} />
    </SortableContext>
  </DndContext>,
);

describe('a widget on the page', () => {
  it('shows only its content when the page is not being arranged', () => {
    frame();
    expect(screen.getByText('content news')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('marks a widget without title or card background for the stylesheet', () => {
    const [plain] = sanitizeWidgets([{ type: 'news', config: { title: false, card: false } }]);
    const { container } = frame({ widget: plain });
    const root = container.querySelector('.dash-widget');
    expect(root.classList.contains('is-untitled')).toBe(true);
    expect(root.classList.contains('is-plain')).toBe(true);
  });

  it('shows nothing for a widget the user cannot see', () => {
    frame({ available: false });
    expect(screen.queryByText('content news')).toBeNull();
  });

  it('gets a bar to set its height, set up and remove it while arranging', () => {
    const onHeight = vi.fn();
    const onSettings = vi.fn();
    const onRemove = vi.fn();
    const onMove = vi.fn();
    frame({ editing: true, onHeight, onSettings, onRemove, onMove });
    fireEvent.click(screen.getByRole('button', { name: 'کوتاه' }));
    expect(onHeight).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('group', { name: 'عرض' })).toBeNull(); // the width is fixed
    fireEvent.click(screen.getByRole('button', { name: /^تنظیم/ }));
    expect(onSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^حذف/ }));
    expect(onRemove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'پایین‌تر' }));
    expect(onMove).not.toHaveBeenCalled(); // last widget: cannot go down
  });

  it('has no size choice in the app frame', () => {
    frame({ editing: true, sizable: false });
    expect(screen.queryByRole('button', { name: 'کوتاه' })).toBeNull();
  });
});

describe('the widget picker', () => {
  it('lists what the user can see and adds a widget once when it is unique', () => {
    const onAdd = vi.fn();
    render(<WidgetPicker isOpen onClose={() => {}} widgets={[news]} canSee={(type) => type !== 'market'} onAdd={onAdd} />);
    expect(screen.getByText('قیمت یک دارایی')).toBeTruthy();
    expect(screen.queryByText('نرخ و حباب')).toBeNull();
    const newsRow = screen.getByText('آخرین اخبار').closest('button');
    expect(newsRow.disabled).toBe(true);
    const assetRow = screen.getByText('قیمت یک دارایی').closest('button');
    fireEvent.click(assetRow);
    expect(onAdd).toHaveBeenCalledWith('asset');
  });
});
