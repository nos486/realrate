/**
 * PaymentSplitEditor.jsx — «چند منبع» in the expense form: a big purchase paid from several sources
 *
 * One row per source, each its amount and where it came from: an account (a bank credit is one —
 * its part is owed on it), a loan's money (optionally through an account), or an asset sold from a
 * portfolio (PortfolioLinkFields, embedded: which asset and how much of it). The last row added
 * takes what the others leave of the expense's amount by itself until its amount is typed; «بقیه»
 * fills another empty row with it. The rows must add up to the amount (utils/paymentSplit.js).
 * The parent keeps the rows (as typed: `auto` rows are filled in here and when saved).
 */

import React from 'react';
import { Plus, X } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { NumericInput } from '../../../shared/ui/index.js';
import { PickerRow } from '../../../shared/form/index.js';
import PortfolioLinkFields from '../../../shared/vault/PortfolioLinkFields.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { formatNum, parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import {
  LOAN_PREFIX, MAX_SPLIT_ROWS, PORTFOLIO_SOURCE, addSplitRow, resolveSplitRows, splitProblem, splitSum,
} from '../utils/paymentSplit.js';

const EMPTY_LINK = { portfolioId: '', portfolioName: '', assetId: '', quantity: 0 };

/**
 * @param {{
 *   rows: object[], onChange: (rows: object[]) => void, total: number,
 *   accounts: object[], loans: object[], ownLinks?: object[], hideValues?: boolean,
 * }} props
 *   accounts: those holding tomans; loans: those a purchase may be funded from; ownLinks: the
 *   portfolio links this expense was saved with (their quantity is still in the balances shown)
 */
export default function PaymentSplitEditor({ rows: typed, onChange, total, accounts, loans, ownLinks = [], hideValues = false }) {
  // What is shown and checked: the row taking the rest filled in
  const rows = resolveSplitRows(typed, total);
  const update = (id, patch) => onChange(typed.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id) => {
    const next = typed.filter((r) => r.id !== id);
    // The row that took the rest is gone: the last one takes it, when it is still empty
    const last = next[next.length - 1];
    onChange(next.some((r) => r.auto) || !last || last.amount ? next : next.map((r) => (r === last ? { ...r, auto: true } : r)));
  };
  const sum = splitSum(rows);
  const left = (Number(total) || 0) - sum;
  const problem = splitProblem(rows, total);

  const sourceOptions = [
    ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
    ...loans.map((l) => ({ value: `${LOAN_PREFIX}${l.id}`, label: t('وام «{name}»', { name: l.title }) })),
    { value: PORTFOLIO_SOURCE, label: t('فروش از پورتفو') },
  ];
  const accountOptions = [{ value: '', label: t('نامشخص') }, ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))];

  return (
    <div className="payment-split">
      {rows.map((row, i) => {
        const amountNum = parseInputNumber(row.amount) || 0;
        return (
          <div key={row.id} className="payment-split-row">
            <div className="payment-split-head">
              <strong>{t('منبع {n}', { n: i + 1 })}</strong>
              {rows.length > 2 && (
                <button type="button" className="btn-table-action" title={t('حذف این منبع')} aria-label={t('حذف این منبع')} onClick={() => remove(row.id)}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="payment-split-amount">
              <div className="ui-input-wrapper">
                <NumericInput
                  id={`payment-split-amount-${row.id}`}
                  value={row.amount}
                  // Typed: it no longer takes the rest
                  onValueChange={(v) => update(row.id, { amount: v, auto: false })}
                  placeholder={t('مبلغ (تومان)')}
                  className="ui-input-control"
                  aria-label={t('مبلغ منبع {n}', { n: i + 1 })}
                />
              </div>
              {row.auto ? (
                <small className="expense-form-hint">{t('بقیه‌ی مبلغ خودکار این‌جا می‌آید.')}</small>
              ) : !amountNum && left > 0.5 && (
                <button type="button" className="expense-hint-action" onClick={() => update(row.id, { amount: String(Math.round(left)) })}>
                  {t('بقیه: {amount}', { amount: hideValues ? '****' : formatNum(Math.round(left)) })}
                </button>
              )}
            </div>
            <PickerRow
              label={t('از')}
              value={row.source}
              options={sourceOptions}
              onChange={(source) => update(row.id, { source, link: source === PORTFOLIO_SOURCE ? row.link || { ...EMPTY_LINK } : row.link })}
              placeholder={t('حساب، اعتبار، وام یا پورتفو')}
            />
            {row.source.startsWith(LOAN_PREFIX) && (
              <PickerRow label={t('از طریق حساب')} value={row.loanAccountId} options={accountOptions} onChange={(v) => update(row.id, { loanAccountId: v })} placeholder={t('نامشخص')} />
            )}
            {row.source === PORTFOLIO_SOURCE && (
              <PortfolioLinkFields
                mode="sell"
                embedded
                idSuffix={`-${row.id}`}
                value={row.link || EMPTY_LINK}
                onChange={(link) => update(row.id, { link: link || { ...EMPTY_LINK } })}
                toman={amountNum}
                own={ownLinks.find((l) => l.txId && l.txId === row.link?.txId) || null}
                hideValues={hideValues}
              />
            )}
          </div>
        );
      })}
      {rows.length < MAX_SPLIT_ROWS && (
        <button type="button" className="expense-hint-action payment-split-add" onClick={() => onChange(addSplitRow(typed, total))}>
          <Plus size={14} /> {t('منبع دیگر')}
        </button>
      )}
      <p className={`expense-form-hint ${problem ? 'is-warning' : ''}`} role="status">
        {t('جمع منابع: {sum} از {total} تومان', { sum: hideValues ? '****' : formatNum(sum), total: hideValues ? '****' : formatNum(Number(total) || 0) })}
        {problem && ` — ${problem}`}
      </p>
      <p className="expense-form-hint">{t('هزینه یک بار با مبلغ کامل در دسته و بودجه حساب می‌شود؛ هر منبع فقط سهم خودش کم یا بدهکار می‌شود.')}</p>
    </div>
  );
}
