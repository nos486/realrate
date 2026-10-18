/**
 * tabScopes.js — What each tab of the app shows, so its refresh (the header's button, the window
 * getting focus again) reads that and nothing else (pageRefresh.js)
 *
 * A scope only reads where a loader of it is mounted, so a tab never reads what it doesn't show.
 * Loans, cheques and subscriptions are also loaded for the whole app (the due-date alerts), so
 * only their own tabs name them.
 */

/** Tab → the scopes its refresh reads */
export const TAB_REFRESH_SCOPES = {
  // The home page (the widget dashboard): the dollar, the latest news and the user's month
  market: ['prices', 'news', 'incomes', 'expenses'],
  rates: ['prices'],
  news: ['news'],
  portfolio: ['prices', 'portfolio'],
  loans: ['loans'],
  cheques: ['cheques'],
  // Their dollar costs are shown in tomans at the live rate
  subscriptions: ['subscriptions', 'prices'],
  // Their linked portfolio's value is worked out at today's prices
  goals: ['goals', 'portfolio', 'prices'],
  incomes: ['incomes'],
  expenses: ['expenses', 'accounts'],
  projects: ['expenses'],
  accounts: ['accounts', 'expenses'],
  // The net worth reads the portfolios, loans and cheques under the one «portfolio» scope
  reports: ['incomes', 'expenses', 'portfolio'],
  explore: ['prices'],
  pro: [],
  sms: ['expenses'],
  settings: [],
  'app-settings': [],
};

/**
 * The scopes of the open tab
 * @param {string} tab - MainPage's active tab
 * @param {{ hasMarket?: boolean }} [context] - whether the user has the market page (without it,
 *   no prices are shown, except on the home and the portfolio)
 * @returns {string[]}
 */
export function refreshScopesOf(tab, { hasMarket = true } = {}) {
  const scopes = TAB_REFRESH_SCOPES[tab] || [];
  // The home shows the dollar to every user (its widgets pick what they show)
  const showsPrices = tab === 'market' || tab === 'portfolio' || hasMarket;
  return showsPrices ? scopes : scopes.filter((s) => s !== 'prices');
}
