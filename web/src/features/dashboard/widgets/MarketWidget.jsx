/**
 * MarketWidget.jsx — «نرخ و حباب»: the customizable market sections of the rates page (the
 * cards of any asset, with their formulas and bubbles) as one widget
 */

import React from 'react';
import HomeDashboard from '../../home/HomeDashboard.jsx';
import { useDashboardData } from '../DashboardContext.js';
import DashScroll from '../DashScroll.jsx';

export default function MarketWidget() {
  const { analysis, currencies, recommendation, marketLoading } = useDashboardData();
  return (
    <DashScroll>
      <HomeDashboard analysis={analysis} currencies={currencies} recommendation={recommendation} loading={marketLoading} />
    </DashScroll>
  );
}
