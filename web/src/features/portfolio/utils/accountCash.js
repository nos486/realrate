/**
 * accountCash.js — The money in the user's accounts, as part of the portfolio
 *
 * An account that keeps its balance (utils/accountBalance.js) is cash the user owns: a cash
 * account of dollars at home is the same thing as dollars recorded in the portfolio. So the
 * default portfolio counts the accounts too: what each account holds today, in each currency,
 * joins that currency's ledger (the toman's, the dollar's, ...) as a read-only entry. It is never
 * stored in the portfolio: the account stays the one record of it, moved by the expenses, incomes
 * and transfers, and edited only from the accounts page.
 *
 * The entry has no buy price (cash has no cost to judge a profit against), so it adds to the
 * value and the allocation and never to the profit or loss. It is dated today: in the first in
 * first out replay it comes after every lot recorded in the portfolio itself, so a sale there
 * takes from those first. Archived accounts and what is below zero are left out (a debt is not
 * an asset). Only one portfolio — the default one (`isDefault`, else the first) — counts the
 * accounts, so they are never counted twice.
 *
 * Pure: no React, no storage.
 */

import { currencyOf, CURRENCY_CODES } from '../../../utils/currencies.js';
import { tracksBalance } from '../../../utils/accountBalance.js';
import { resolveAssetUnit } from '../../../config/sourceRegistry.js';

/** The book id of the toman held as cash */
export const TOMAN_CASH_ID = 'toman';

/** The prefix of an account entry's id: `account:<accountId>:<currency>` */
export const ACCOUNT_ENTRY_PREFIX = 'account:';

/** Whether a holding record is an account's balance (not stored in the portfolio) */
export const isAccountEntry = (record) => Boolean(record?.fromAccount);

/**
 * The id of the portfolio that counts the accounts: the default one, else the first
 * @param {Array<{ id: string, isDefault?: boolean|number }>} portfolios
 * @returns {string|null}
 */
export function cashPortfolioId(portfolios = []) {
  const list = Array.isArray(portfolios) ? portfolios : [];
  return (list.find((p) => p?.isDefault) || list[0])?.id || null;
}

/**
 * Each account's balance as holding records: one per account and currency it holds above zero
 * @param {object[]} accounts - the user's accounts
 * @param {Map<string, { byCurrency: Record<string, number> }>} byId - the balances (accountBalances().byId)
 * @param {string} today - YYYY-MM-DD
 * @param {(account: object) => string} [labelOf] - an account's name as shown
 * @returns {Array<{ id: string, assetId: string, unit: string, amount: number, buyPrice: 0, buyDate: string,
 *   fromAccount: true, accountId: string, accountName: string, currency: string }>}
 */
export function accountCashHoldings(accounts = [], byId = new Map(), today = '', labelOf = (a) => a.name) {
  const out = [];
  for (const account of accounts) {
    if (!tracksBalance(account) || account.archived) continue;
    const byCurrency = byId?.get?.(account.id)?.byCurrency || {};
    for (const code of CURRENCY_CODES) {
      const amount = Number(byCurrency[code]) || 0;
      if (!(amount > 0)) continue;
      const assetId = currencyOf(code).priceId || TOMAN_CASH_ID;
      out.push({
        id: `${ACCOUNT_ENTRY_PREFIX}${account.id}:${code}`,
        assetId,
        // The catalog's unit, as the portfolio's own records of it have: one ledger with them
        unit: resolveAssetUnit(assetId, {}),
        amount,
        buyPrice: 0,
        buyDate: today,
        fromAccount: true,
        accountId: account.id,
        accountName: String(labelOf(account) || ''),
        currency: code,
      });
    }
  }
  return out;
}
