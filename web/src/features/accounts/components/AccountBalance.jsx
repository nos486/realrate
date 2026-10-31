/**
 * AccountBalance.jsx — What an account holds («موجودی»), and the total of all the accounts
 *
 * `AccountBalanceStat` is the line on an account's card: its balance in each currency it holds
 * (and about how much in tomans when that is not tomans alone). `BalanceSummary` is the strip above
 * the cards: the total of the accounts that keep a balance, in tomans at today's rates
 * (utils/accountBalance.js). The default portfolio counts the same balances among its assets
 * (features/portfolio/utils/accountCash.js).
 */

import React from 'react';
import { Landmark } from 'lucide-react';
import { CURRENCY_CODES, currencyLabel, formatMoney } from '../../../utils/currencies.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { t } from '../../../utils/i18n.js';

/** The currencies a balance holds, in the app's order — a zero or negative one included */
const heldAmounts = (byCurrency = {}) => CURRENCY_CODES.filter((c) => c in byCurrency).map((code) => ({ code, amount: Number(byCurrency[code]) || 0 }));
const signClass = (n) => (n < 0 ? 'is-negative' : '');

/**
 * @param {{ balance?: { byCurrency: Record<string, number>, toman: number }, hideValues?: boolean }} props
 */
export function AccountBalanceStat({ balance, hideValues = false }) {
  const amounts = heldAmounts(balance?.byCurrency);
  const tomanOnly = amounts.length === 1 && amounts[0].code === 'IRT';
  return (
    <div className="account-card-stat account-card-balance">
      <span>{t('موجودی')}</span>
      <span className="account-card-spent">
        {amounts.map(({ code, amount }) => (
          <strong key={code} className={signClass(amount)}>{hideValues ? `**** ${currencyLabel(code)}` : formatMoney(amount, code)}</strong>
        ))}
        {!tomanOnly && balance && <small>≈ {hideValues ? '****' : formatAmount(balance.toman)} {t('تومان')}</small>}
      </span>
    </div>
  );
}

/**
 * @param {{ balances: { totalToman: number, count: number, unpriced: string[] }, hideValues?: boolean }} props
 */
export function BalanceSummary({ balances, hideValues = false }) {
  if (!balances.count) return null;
  return (
    <section className="balance-summary" aria-label={t('جمع موجودی حساب‌ها')}>
      <Landmark size={20} aria-hidden="true" />
      <div>
        <span>{t('جمع موجودی حساب‌ها')}</span>
        <strong className={signClass(balances.totalToman)}>{hideValues ? '****' : formatAmount(balances.totalToman)} {t('تومان')}</strong>
        <small>{t('{n} حساب', { n: balances.count })}</small>
        <small>{t('این موجودی در پورتفوی پیش‌فرض هم جزو دارایی‌ها حساب می‌شود.')}</small>
        {balances.unpriced.length > 0 && (
          <small>{t('قیمت {currencies} در دسترس نیست و در جمع نیامده است.', { currencies: balances.unpriced.map(currencyLabel).join('، ') })}</small>
        )}
      </div>
    </section>
  );
}
