/**
 * CreditSummary.jsx — A bank credit on its account card: its limit and what is owed — nothing
 * assumed about the bank's rules
 *
 * The debt and a bar of the limit used; what is owed outside the installments with «تسویه بدهی»
 * and «تبدیل به قسط»; each installment plan as the user entered it — the amount, what the
 * installments add up to and their fee (amount and percent), each installment with its day and
 * «پرداخت» — overdue installments, and the fees paid (utils/creditAccount.js for the figures).
 */

import React from 'react';
import { AlertTriangle, CalendarClock, Trash2, HandCoins } from 'lucide-react';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../../expenses/utils/format.js';

const fa = (n) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 2 });
const day = (iso) => formatShamsiDisplay(`${iso}T00:00:00`);

const STATUS_LABELS = { paid: 'پرداخت‌شده', overdue: 'معوق', due: 'سررسید امروز', upcoming: '' };

/**
 * @param {{ status: object|null, costsPaid?: number, hideValues?: boolean, readOnly?: boolean,
 *   onSettle?: () => void, onConvert?: () => void, onPayInstallment?: (plan: object, installment: object) => void,
 *   onUndoConversion?: (plan: object) => void }} props
 */
export default function CreditSummary({
  status, costsPaid = 0, hideValues = false, readOnly = false, onSettle, onConvert, onPayInstallment, onUndoConversion,
}) {
  if (!status) return null;
  const money = (v) => (hideValues ? '****' : formatAmount(v));
  const usedPct = status.limit > 0 ? Math.min(100, Math.round((status.debt / status.limit) * 100)) : 0;
  const canAct = !readOnly;

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

      {/* What is owed outside the installments: settle it, or turn it into installments */}
      {status.freeDebt > 0 && (
        <div className="credit-statement">
          <span>
            بدهی خارج از اقساط
            <small>{money(status.freeDebt)} تومان</small>
          </span>
          {canAct && (
            <span className="credit-actions">
              {onSettle && (
                <button type="button" className="credit-link-btn" onClick={onSettle}>
                  <HandCoins size={13} /> تسویه بدهی
                </button>
              )}
              {onConvert && (
                <button type="button" className="credit-link-btn" onClick={onConvert}>
                  <CalendarClock size={13} /> تبدیل به قسط
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {status.prepaid > 0 && <p className="credit-settled">پیش‌پرداخت: {money(status.prepaid)} تومان</p>}
      {status.debt === 0 && status.prepaid === 0 && <p className="credit-settled">بدهی‌ای ندارید</p>}

      {status.plans.map((plan) => (
        <details key={plan.id} className="credit-plan" open={plan.remaining > 0 && plan.installments.some((i) => i.status !== 'paid' && i.status !== 'upcoming')}>
          <summary>
            اقساط {day(plan.date)} · مانده {money(plan.remaining)} تومان
          </summary>
          <p className="credit-plan-meta">
            {money(plan.principal)} ← {fa(plan.installments.length)} قسط، جمع {money(plan.total)} تومان
            {plan.cost > 0 && ` · کارمزد قسط‌بندی ${money(plan.cost)} (${fa(plan.pct)}٪)`}
            {canAct && onUndoConversion && (
              <button type="button" className="credit-link-btn is-danger" onClick={() => onUndoConversion(plan)} title="حذف این قسط‌بندی">
                <Trash2 size={12} /> حذف
              </button>
            )}
          </p>
          <ul>
            {plan.installments.map((i) => (
              <li key={i.n} className={`is-${i.status}`}>
                <span>قسط {fa(i.n)} · {day(i.dueDate)}</span>
                <span>
                  {money(i.amount)}
                  {STATUS_LABELS[i.status] && <em>{STATUS_LABELS[i.status]}{i.paidOn ? ` ${day(i.paidOn)}` : ''}</em>}
                  {canAct && onPayInstallment && i.status !== 'paid' && (
                    <button type="button" className="credit-link-btn" onClick={() => onPayInstallment(plan, i)}>پرداخت</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {status.next && (
        <div className={`credit-next ${status.overdue.count > 0 ? 'is-overdue' : ''}`}>
          <span>قسط بعدی ({fa(status.next.n)} از {fa(status.next.count)}) · {day(status.next.dueDate)}</span>
          <strong>{money(status.next.amount)} تومان</strong>
        </div>
      )}

      {costsPaid > 0 && (
        <div className="account-card-stat">
          <span>کارمزدهای پرداخت‌شده</span>
          <strong>{money(costsPaid)} تومان</strong>
        </div>
      )}

    </div>
  );
}
