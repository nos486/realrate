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
  // The website's home: the market and the latest news above it
  market: ['prices', 'news'],
  // The app frame's home: the user's month, the latest news and the dollar
  'app-home': ['prices', 'news', 'incomes', 'expenses'],
  rates: ['prices'],
  news: ['news'],
  portfolio: ['prices', 'portfolio'],
  loans: ['loans'],
  cheques: ['cheques'],
  // Their dollar costs are shown in tomans at the live rate
  subscriptions: ['subscriptions', 'prices'],
  incomes: ['incomes'],
  expenses: ['expenses', 'accounts'],
  projects: ['expenses'],
  accounts: ['accounts', 'expenses'],
  reports: ['incomes', 'expenses'],
  sms: ['expenses'],
  settings: [],
  'app-settings': [],
};

/**
 * The scopes of the open tab
 * @param {string} tab - MainPage's active tab
 * @param {{ appLayout?: boolean, hasMarket?: boolean }} [context] - the app frame (its home is the
 *   user's dashboard); whether the user has the market page (without it, no prices are shown)
 * @returns {string[]}
 */
export function refreshScopesOf(tab, { appLayout = false, hasMarket = true } = {}) {
  const key = tab === 'market' && appLayout ? 'app-home' : tab;
  const scopes = TAB_REFRESH_SCOPES[key] || [];
  const showsPrices = key === 'app-home' || key === 'portfolio' || hasMarket;
  return showsPrices ? scopes : scopes.filter((s) => s !== 'prices');
}
