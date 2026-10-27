// @vitest-environment happy-dom
/**
 * chartLegendSelection.test.jsx — Tapping a chart's legend item hides / shows its series, the
 * totals follow the series shown, and the last shown series can't be hidden
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import DonutChart from '../../../web/src/shared/ui/DonutChart.jsx';
import YearFlowChart from '../../../web/src/shared/flow/YearFlowChart.jsx';
import { visibleSeries } from '../../../web/src/shared/flow/flowYear.js';
import MonthBarChart from '../../../web/src/features/reports/MonthBarChart.jsx';
import RiskMixPie from '../../../web/src/features/portfolio/components/RiskMixPie.jsx';

afterEach(cleanup);

const legendRow = (name) => screen.getByText(name).closest('[data-legend]');

describe('DonutChart legend', () => {
  const items = [
    { key: 'a', label: 'طلا', value: 300 },
    { key: 'b', label: 'دلار', value: 100 },
  ];

  it('hides a slice and shares the rest', () => {
    const { container } = render(<DonutChart title="ترکیب" items={items} />);
    expect(container.querySelectorAll('path.donut-chart-slice')).toHaveLength(2);
    fireEvent.click(legendRow('دلار'));
    expect(legendRow('دلار').getAttribute('data-legend')).toBe('off');
    expect(legendRow('دلار').getAttribute('aria-pressed')).toBe('false');
    // One slice left: drawn as a full ring, at 100%
    expect(container.querySelectorAll('path.donut-chart-slice')).toHaveLength(0);
    expect(container.querySelector('circle')).not.toBeNull();
    expect(legendRow('طلا').querySelector('.donut-chart-pct').textContent).toContain('۱۰۰');
    expect(legendRow('دلار').querySelector('.donut-chart-pct').textContent).toBe('—');
  });

  it('keeps the last shown slice, and shows a hidden one again', () => {
    render(<DonutChart title="ترکیب" items={items} />);
    fireEvent.click(legendRow('دلار'));
    fireEvent.click(legendRow('طلا'));
    expect(legendRow('طلا').getAttribute('data-legend')).toBe('on');
    fireEvent.keyDown(legendRow('دلار'), { key: 'Enter' });
    expect(legendRow('دلار').getAttribute('data-legend')).toBe('on');
  });
});

describe('YearFlowChart legend', () => {
  const series = [
    { key: '1405/1', jy: 1405, jm: 1, label: 'فروردین ۱۴۰۵', monthLabel: 'فروردین', total: 300, count: 3, byCategory: { food: 100, rent: 200 }, change: null },
    { key: '1405/2', jy: 1405, jm: 2, label: 'اردیبهشت ۱۴۰۵', monthLabel: 'اردیبهشت', total: 400, count: 2, byCategory: { food: 200, rent: 200 }, change: 33 },
  ];

  it('recomputes the totals and the change of the shown categories', () => {
    const view = visibleSeries(series, ['food']);
    expect(view.map((m) => m.total)).toEqual([100, 200]);
    expect(view[0].change).toBeNull();
    expect(view[1].change).toBe(100);
    expect(visibleSeries(series, null)).toBe(series);
  });

  it('leaves a hidden category out of the bars', () => {
    const labelOf = (c) => ({ food: 'خوراک', rent: 'اجاره' })[c];
    const { container } = render(<YearFlowChart series={series} kind="expense" labelOf={labelOf} />);
    expect(container.querySelectorAll('.monthly-income-seg')).toHaveLength(4);
    fireEvent.click(legendRow('اجاره'));
    expect(container.querySelectorAll('.monthly-income-seg')).toHaveLength(2);
  });
});

describe('MonthBarChart legend', () => {
  it('hides one of two series', () => {
    const months = [{ key: 'm1', label: 'مهر', monthLabel: 'مهر', a: 5, b: 3 }];
    const series = [
      { key: 'a', label: 'درآمد', color: '#3987e5', value: (m) => m.a },
      { key: 'b', label: 'هزینه', color: '#d95926', value: (m) => m.b },
    ];
    const { container } = render(
      <MonthBarChart title="ماه" months={months} series={series} format={String} readout={() => null} ariaValue={() => ''} />,
    );
    expect(container.querySelectorAll('.report-bar')).toHaveLength(2);
    fireEvent.click(legendRow('هزینه'));
    expect(container.querySelectorAll('.report-bar')).toHaveLength(1);
  });
});

describe('RiskMixPie legend', () => {
  it('hides a slice', () => {
    const items = [
      { key: 'gold', label: 'طلا', value: 60 },
      { key: 'cash', label: 'نقد', value: 40 },
    ];
    const { container } = render(<RiskMixPie items={items} />);
    expect(container.querySelectorAll('svg path')).toHaveLength(2);
    fireEvent.click(legendRow('نقد'));
    expect(container.querySelectorAll('svg path')).toHaveLength(1);
  });
});
