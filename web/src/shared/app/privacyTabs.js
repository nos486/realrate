/**
 * privacyTabs.js — The tabs that show the user's own amounts, where the header offers «پنهان
 * کردن مبالغ» (usePrivacyMode): one list for the site's header and the app's top bar
 */

/** Tabs with the user's own amounts, on the site and in the app */
export const PRIVATE_VALUE_TABS = ['portfolio', 'incomes', 'expenses', 'accounts', 'loans', 'cheques'];

/** In the app, the home tab ('market') is the personal dashboard: it has amounts too */
export const APP_PRIVATE_VALUE_TABS = ['market', ...PRIVATE_VALUE_TABS];
