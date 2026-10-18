// @vitest-environment happy-dom
/**
 * dashboardWidgets.test.jsx — The home page's edit mode: a widget in view mode is just its
 * content, in edit mode it gets the bar (move, set up, remove), and the picker offers
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
      <WidgetFrame widget={news} editing={false} available first last onMove={() => {}} onSettings={() => {}} onRemove={() => {}} {...props} />
    </SortableContext>
  </DndContext>,
);

describe('a widget on the page', () => {
  it('shows only its content when the page is not being arranged', () => {
    frame();
    expect(screen.getByText('content news')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing for a widget the user cannot see', () => {
    frame({ available: false });
    expect(screen.queryByText('content news')).toBeNull();
  });

  it('gets a bar to move, set up and remove it while arranging', () => {
    const onSettings = vi.fn();
    const onRemove = vi.fn();
    const onMove = vi.fn();
    frame({ editing: true, onSettings, onRemove, onMove });
    fireEvent.click(screen.getByRole('button', { name: /^تنظیم/ }));
    expect(onSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^حذف/ }));
    expect(onRemove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'پایین‌تر' }));
    expect(onMove).not.toHaveBeenCalled(); // last widget: cannot go down
  });

  it('has no size choice: every widget is the same size', () => {
    frame({ editing: true });
    expect(screen.queryByRole('group', { name: 'عرض' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'ارتفاع' })).toBeNull();
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
