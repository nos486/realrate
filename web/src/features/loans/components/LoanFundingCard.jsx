/**
 * LoanFundingCard.jsx — «مصرف وام»: how much of a loan's principal was spent, what is left, and on
 * what — the expenses and portfolio holdings recorded with «تأمین از» this loan
 * (utils/loanFunding.js). Only the expenses dated from the loan's start are downloaded (the vault
 * filters on the plaintext date); holdings are read from every portfolio under the account vault.
 * For the holdings it bought: their value today at the price book's prices, and the gain as a
 * yearly rate next to the loan's own interest rate — is the loan paying for itself?
 */

import React, { useEffect, useState } from 'react';
import { useRefreshToken } from '../../../shared/refresh/pageRefresh.js';
import { useUsdAt } from '../../market/dailyHistory.js';
import { useFxRates } from '../../market/useFxRates.js';
import { Wallet } from 'lucide-react';
import { useFeature } from '../../../shared/features/useFeature.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { getExpenses } from '../../../shared/vault/vaultExpenses.js';
import { listAccountHoldings } from '../../../shared/vault/vaultPortfolioItems.js';
import { getPortfolios } from '../../portfolio/api/portfolioApi.js';
import { summarizeLoanFunding, loanInvestmentReturn } from '../../../utils/loanFunding.js';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';
import { normalizeHolding, resolveHoldingUnitRealPrice } from '../../portfolio/utils/holdingHelpers.js';
import { getExpenseCategory } from '../../expenses/constants/expenseCategories.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { usePricing } from '../../market/index.js';

const LIST_LIMIT = 5;
const formatNum = (v) => Math.round(Number(v) || 0).toLocaleString('fa-IR');
const formatPct = (v) => `${v > 0 ? '+' : ''}${(Math.round(v * 10) / 10).toLocaleString('fa-IR')}٪`;

/** The holdings' gain against the loan's yearly rate (loanInvestmentReturn) */
function InvestmentReturn({ result, loanRate, money }) {
  const beats = result.annualPct !== null && loanRate > 0 ? result.annualPct >= loanRate : null;
  return (
    <div className="loan-funding-return">
      <div className="loan-funding-return-row">
        <span>ارزش امروز خریدهای پورتفو</span>
        <strong>{money(result.value)} تومان</strong>
      </div>
      <div className="loan-funding-return-row">
        <span>سود / زیان</span>
        <strong className={result.gain >= 0 ? 'is-gain' : 'is-loss'}>
          {money(Math.abs(result.gain))} تومان {result.gainPct !== null && `(${formatPct(result.gainPct)})`}
        </strong>
      </div>
      {result.annualPct !== null && (
        <div className="loan-funding-return-row">
          <span>بازده سالانه در برابر سود وام</span>
          <strong>
            {formatPct(result.annualPct)} <small>در برابر {(Math.round(loanRate * 10) / 10).toLocaleString('fa-IR')}٪</small>
          </strong>
        </div>
      )}
      {beats !== null && (
        <p className={`loan-funding-verdict ${beats ? 'is-gain' : 'is-loss'}`}>
          {beats
            ? 'تا امروز بازده این خریدها از سود وام بیشتر بوده است.'
            : 'تا امروز بازده این خریدها از سود وام کمتر بوده؛ وام بیش از سودش هزینه داشته است.'}
        </p>
      )}
    </div>
  );
}

/** Loaded one by one: a part that fails leaves the rest */
async function orNone(load, what) {
  try {
    return await load();
  } catch (err) {
    console.warn(`Loan usage: ${what} could not be loaded:`, err);
    return [];
  }
}

function ItemTitle({ item }) {
  if (item.kind === 'holding') {
    return (
      <span className="loan-funding-item-title">
        {item.source.assetName}
        <small>خرید پورتفو، {formatNum(item.source.amount)} {item.source.unit || 'واحد'}</small>
      </span>
    );
  }
  const expense = item.source;
  const category = expense.category ? getExpenseCategory(expense.category) : null;
  return (
    <span className="loan-funding-item-title">
      {expense.title}
      {category && expense.title !== category.label && <small>{category.label}</small>}
    </span>
  );
}

export default function LoanFundingCard({ loan, hideValues = false }) {
  const hasExpenses = useFeature('expenses');
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  // Read again with the loans tab's refresh (header button, window focus)
  const refreshToken = useRefreshToken('loans');
  const [data, setData] = useState(null);
  const from = String(loan?.startDate || '').slice(0, 10);

  useEffect(() => {
    if (vaultStatus === 'locked' || !loan?.id) return undefined;
    let cancelled = false;
    Promise.all([
      hasExpenses ? orNone(async () => (await getExpenses(from ? { from } : {})).expenses, 'expenses') : [],
      orNone(async () => listAccountHoldings((await getPortfolios())?.portfolios || []), 'holdings'),
    ]).then(([expenses, holdings]) => {
      if (!cancelled) setData({ expenses, holdings });
    });
    return () => {
      cancelled = true;
    };
  }, [hasExpenses, vaultStatus, vaultEpoch, refreshToken, loan?.id, from]);

  // The dollar's rate on a dollar expense's day (one without its own), from the price history
  const usdAt = useUsdAt((data?.expenses || []).some((e) => e.loanId === loan?.id && e.currency === 'USD' && !e.usdRate));
  const fx = useFxRates((data?.expenses || []).filter((e) => e.loanId === loan?.id));

  if (!data) return null;
  const usage = summarizeLoanFunding(loan, data.expenses, { holdings: data.holdings, usdToman, usdAt, ...fx });
  const valueOf = (h) => {
    const unit = resolveHoldingUnitRealPrice(normalizeHolding(h, pricing?.itemMap), pricing?.priceMap || {});
    return unit > 0 ? (Number(h.amount) || 0) * unit : null;
  };
  const investment = loanInvestmentReturn(usage.items, valueOf);
  const money = (v) => (hideValues ? '****' : formatNum(v));
  const pct = usage.principal > 0 ? Math.min(100, Math.round((usage.spent / usage.principal) * 100)) : 0;

  return (
    <section className="loan-funding-card" aria-label="مصرف وام">
      <header className="loan-funding-head">
        <span className="loan-funding-title">
          <Wallet size={15} />
          مصرف وام
        </span>
        <span className="loan-funding-pct">{formatNum(pct)}٪ خرج شده</span>
      </header>

      <div className="loan-progress-track">
        <div className={`loan-progress-bar ${usage.overspent > 0 ? 'is-over' : ''}`} style={{ width: `${pct}%` }} />
      </div>

      <dl className="loan-funding-stats">
        <div>
          <dt>خرج شده</dt>
          <dd>{money(usage.spent)} تومان</dd>
        </div>
        <div>
          <dt>{usage.overspent > 0 ? 'بیش از اصل وام' : 'مانده‌ی خرج‌نشده'}</dt>
          <dd className={usage.overspent > 0 ? 'is-over' : ''}>{money(usage.overspent || usage.remaining)} تومان</dd>
        </div>
      </dl>

      {investment && <InvestmentReturn result={investment} loanRate={Number(getDisplayRatePct(loan)) || 0} money={money} />}

      {usage.count === 0 ? (
        <p className="loan-funding-empty">
          هنوز خرجی از این وام ثبت نشده. هنگام ثبت هزینه یا خرید دارایی در پورتفو، «تأمین از» را روی این وام بگذارید تا اینجا دیده شود.
        </p>
      ) : (
        <ul className="loan-funding-list">
          {usage.items.slice(0, LIST_LIMIT).map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <ItemTitle item={item} />
              <span className="loan-funding-item-date">{item.date ? formatShamsiDisplay(`${item.date}T00:00:00`) : '—'}</span>
              <strong>{money(item.toman)} تومان</strong>
            </li>
          ))}
          {usage.count > LIST_LIMIT && (
            <li className="loan-funding-more">و {formatNum(usage.count - LIST_LIMIT)} مورد دیگر</li>
          )}
        </ul>
      )}
    </section>
  );
}
