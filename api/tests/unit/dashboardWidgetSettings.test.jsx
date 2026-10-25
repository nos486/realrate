// @vitest-environment happy-dom
/**
 * dashboardWidgetSettings.test.jsx — The settings sheet drawn from a widget's catalog options
 * (style, switches, subsets), and the clock's styles
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => ({ itemMap: {}, searchAssets: () => [] }) }));

import WidgetSettings from '../../../web/src/features/dashboard/WidgetSettings.jsx';
import ClockWidget from '../../../web/src/features/dashboard/widgets/ClockWidget.jsx';
import { sanitizeWidgets } from '../../src/domain/dashboardLayout.js';

afterEach(cleanup);

const widgetOf = (type, config = {}) => sanitizeWidgets([{ type, config }])[0];

describe('the settings sheet', () => {
  it('picks a style', () => {
    const onChange = vi.fn();
    render(<WidgetSettings widget={widgetOf('clock')} onClose={() => {}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'عقربه‌ای' }));
    expect(onChange).toHaveBeenCalledWith({ style: 'analog' });
  });

  it('flips a switch', () => {
    const onChange = vi.fn();
    render(<WidgetSettings widget={widgetOf('clock')} onClose={() => {}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('نمایش ثانیه'));
    expect(onChange).toHaveBeenCalledWith({ seconds: true });
  });

  it('toggles a part of a multi choice but keeps at least one', () => {
    const onChange = vi.fn();
    render(<WidgetSettings widget={widgetOf('alerts', { sources: ['loan'] })} onClose={() => {}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /چک‌ها/ }));
    expect(onChange).toHaveBeenCalledWith({ sources: ['loan', 'cheque'] });
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /اقساط وام/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers no value or switch of a section the user cannot open, and keeps what is saved for it', () => {
    const onChange = vi.fn();
    const can = (need) => need !== 'cheques';
    render(<WidgetSettings widget={widgetOf('alerts', { sources: ['loan', 'cheque'] })} can={can} onClose={() => {}} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /چک‌ها/ })).toBeNull();
    // The only open value left cannot be turned off
    fireEvent.click(screen.getByRole('button', { name: /اقساط وام/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /اشتراک‌ها/ }));
    expect(onChange).toHaveBeenCalledWith({ sources: ['loan', 'cheque', 'subscription'] });
    cleanup();
    render(<WidgetSettings widget={widgetOf('news')} can={(need) => need !== 'analysis'} onClose={() => {}} onChange={onChange} />);
    expect(screen.queryByLabelText('نمایش خلاصه‌ی تحلیل روز')).toBeNull();
  });

  it('offers the title and card switches on every widget', () => {
    const onChange = vi.fn();
    render(<WidgetSettings widget={widgetOf('plan')} onClose={() => {}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('نمایش عنوان'));
    expect(onChange).toHaveBeenCalledWith({ title: false });
    fireEvent.click(screen.getByLabelText('پس‌زمینه‌ی کارت'));
    expect(onChange).toHaveBeenCalledWith({ card: false });
  });

  it('picks one of several choices', () => {
    const onChange = vi.fn();
    render(<WidgetSettings widget={widgetOf('loans')} onClose={() => {}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'مانده‌ی بیشتر' }));
    expect(onChange).toHaveBeenCalledWith({ sort: 'balance' });
  });

  it('shows nothing for a closed sheet', () => {
    const { container } = render(<WidgetSettings widget={null} onClose={() => {}} onChange={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the clock styles', () => {
  it('hides the weekday on request', () => {
    const c = render(<ClockWidget widget={widgetOf('clock', { weekday: false })} />).container;
    expect(c.querySelector('.dash-clock-weekday')).toBeNull();
  });

  const draw = (config) => render(<ClockWidget widget={widgetOf('clock', config)} />).container;

  it('draws the digital time by default', () => {
    const c = draw({});
    expect(c.querySelector('.dash-clock.is-digital .dash-clock-time')).toBeTruthy();
    expect(c.querySelector('.dash-clock-face')).toBeNull();
  });

  it('draws an analog face with two hands, a third with seconds', () => {
    expect(draw({ style: 'analog' }).querySelectorAll('.dash-clock-hand')).toHaveLength(2);
    cleanup();
    expect(draw({ style: 'analog', seconds: true }).querySelectorAll('.dash-clock-hand')).toHaveLength(3);
  });

  it('hides the Gregorian date when asked', () => {
    expect(draw({ gregorian: false }).querySelector('.dash-clock-sub')).toBeNull();
  });
});
