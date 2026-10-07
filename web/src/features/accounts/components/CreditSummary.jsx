/**
 * CreditSummary.jsx — A bank credit on its account card: how much of the limit is used, the next
 * payment (a statement to settle, with its fee, or an installment, with its profit), overdue
 * installments, the installment plans of statements not settled in time, and «پرداخت»
 * (utils/creditAccount.js for the figures)
 */

import React from 'react';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../../expenses/utils/format.js';
import { todayIso } from '../../../shared/utils/dates.js';

const fa = (n) => Number(n).toLocaleString('fa-IR');
const day = (iso) => formatShamsiDisplay(`${iso}T00:00:00`);

const STATUS_LABELS = { paid: 'پرداخت‌شده', overdue: 'معوق', due: 'سررسید امروز', upcoming: '' };

/** The terms in one line: «بستن صورت‌حساب: ۱۵ هر ماه · فقط در روز سررسید · کارمزد ۲٪ · ۶ قسط» */
function termsLine(terms) {
  return [
    `بستن صورت‌حساب: ${fa(terms.closingDay)} هر ماه`,
    terms.graceDays > 0 ? `مهلت ${fa(terms.graceDays)} روز` : null,
    terms.payMode === 'due_day' ? 'پرداخت فقط در روز سررسید' : 'پرداخت در هر زمان',
    terms.settleFeePct > 0 ? `کارمزد تسویه ${fa(terms.settleFeePct)}٪` : 'تسویه بدون کارمزد',
    `وگرنه ${fa(terms.installmentCount)} قسط${terms.installmentRatePct > 0 ? ` با سود ${fa(terms.installmentRatePct)}٪` : ''}`,
  ].filter(Boolean).join(' · ');
}

/**
 * @param {{ account: object, status: object|null, costsPaid?: number, hideValues?: boolean,
 *   onPay?: () => void, readOnly?: boolean }} props
 */
export default function CreditSummary({ account, status, costsPaid = 0, hideValues = false, onPay, readOnly = false }) {
  if (!status) return null;
  const money = (v) => (hideValues ? '****' : formatAmount(v));
  const terms = account.credit;
  const usedPct = status.limit > 0 ? Math.min(100, Math.round((status.debt / status.limit) * 100)) : 0;
  const { next } = status;

  return (
    <div className="credit-summary">
      <div className="credit-usage" title={`${fa(usedPct)}٪ از سقف اعتبار استفاده شده`}>
        <div className="credit-usage-head">
          <span>بدهی</span>
          <strong>{money(status.debt)} تومان</strong>
        </div>
        <div className="credit-usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct} aria-label="مصرف سقف اعتبار">
          <span style={{ width: `${usedPct}%` }} />
        </div>
        <div className="credit-usage-foot">
          <span>آزاد: {money(status.available)}</span>
          <span>سقف: {money(status.limit)}</span>
        </div>
      </div>

      {status.overdue.count > 0 && (
        <p className="credit-overdue">
          <AlertTriangle size={14} />
          {fa(status.overdue.count)} قسط معوق — {money(status.overdue.amount)} تومان
        </p>
      )}

      {next ? (
        <div className={`credit-next ${next.dueDate < todayIso() ? 'is-overdue' : ''}`}>
          <span>
            {next.label} · سررسید {next.dueDate === todayIso() ? 'امروز' : day(next.dueDate)}
          </span>
          <strong>{money(next.amount)} تومان</strong>
          {next.cost > 0 && (
            <small>
              شامل {next.kind === 'installment' ? 'سود' : 'کارمزد'} {money(next.cost)} تومان
            </small>
          )}
        </div>
      ) : (
        <p className="credit-settled">بدهی‌ای ندارید{status.prepaid > 0 ? ` · پیش‌پرداخت ${money(status.prepaid)} تومان` : ''}</p>
      )}

      {status.plans.map((plan) => (
        <details key={plan.closeDate} className="credit-plan">
          <summary>
            اقساط صورت‌حساب {day(plan.closeDate)} · مانده {money(plan.remaining)} تومان
          </summary>
          <ul>
            {plan.installments.map((i) => (
              <li key={i.n} className={`is-${i.status}`}>
                <span>قسط {fa(i.n)} · {day(i.dueDate)}</span>
                <span>
                  {money(i.principal + i.interest)}
                  {STATUS_LABELS[i.status] && <em>{STATUS_LABELS[i.status]}</em>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {costsPaid > 0 && (
        <div className="account-card-stat">
          <span>کارمزد و سود پرداخت‌شده</span>
          <strong>{money(costsPaid)} تومان</strong>
        </div>
      )}

      <p className="credit-terms"><CreditCard size={12} /> {termsLine(terms)}</p>

      {!readOnly && onPay && (status.debt > 0) && (
        <Button size="sm" variant="secondary" onClick={onPay}>پرداخت بدهی</Button>
      )}
    </div>
  );
}

