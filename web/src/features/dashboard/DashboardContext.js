/**
 * DashboardContext.js — What the home page gives its widgets: the market data the page already
 * holds (so no widget asks for it again) and how to open a section
 */

import { createContext, useContext } from 'react';

/**
 * @typedef {{ usdToman: number, analysis: object[], currencies: object[], recommendation: object|null,
 *   marketLoading: boolean, open: (target: string) => void }} DashboardData
 */

/** @type {import('react').Context<DashboardData>} */
export const DashboardContext = createContext({
  usdToman: 0,
  analysis: [],
  currencies: [],
  recommendation: null,
  marketLoading: false,
  open: () => {},
});

/** @returns {DashboardData} */
export const useDashboardData = () => useContext(DashboardContext);
