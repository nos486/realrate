/**
 * CreditSummary.jsx — A bank credit on its account card: its limit and what is owed — nothing
 * assumed about the bank's rules
 *
 * The debt and a bar of the limit used; what is owed outside the installments with «تسویه بدهی»
 * and «تبدیل به قسط»; each installment plan as the user entered it — the amount, what the
 * installments add up to and their fee (amount and percent), each installment with its day and
 * «پرداخت» — overdue installments, and the fees paid (utils/creditAccount.js for the figures).
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React from 'react';
import { AlertTriangle, CalendarClock, Trash2, HandCoins } from 'lucide-react';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../../expenses/utils/format.js';

const fa = (n) => Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: 2 });
const day = (iso) => formatShamsiDisplay(`${iso}T00:00:00`);

const STATUS_LABELS = { paid: t('پرداخت‌شده'), overdue: t('معوق'), due: t('سررسید امروز'), upcoming: '' };

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
      <div className="credit-usage" title={t('{pct} از سقف اعتبار استفاده شده', { pct: `${fa(usedPct)}${t('٪')}` })}>
        <div className="credit-usage-head">
          <span>{t('بدهی')}</span>
          <strong>{money(status.debt)} {t('تومان')}</strong>
        </div>
        <div className="credit-usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct} aria-label={t('مصرف سقف اعتبار')}>
          <span style={{ width: `${usedPct}%` }} />
        </div>
        {status.breakdown && (
          <div className="credit-usage-foot">
            <span>{t('بدهی اولیه {opening} + هزینه و برداشت {charged} − پرداخت‌ها {paid}', { opening: money(status.breakdown.opening), charged: money(status.breakdown.charged), paid: money(status.breakdown.paid) })}</span>
          </div>
        )}
        <div className="credit-usage-foot">
          <span>{t('آزاد: {amount}', { amount: money(status.available) })}</span>
          <span>{t('سقف: {amount}', { amount: money(status.limit) })}</span>
        </div>
      </div>

      {status.overdue.count > 0 && (
        <p className="credit-overdue">
          <AlertTriangle size={14} />
          {t('{n} قسط معوق — {amount} تومان', { n: fa(status.overdue.count), amount: money(status.overdue.amount) })}
        </p>
      )}

      {/* What is owed outside the installments: settle it, or turn it into installments */}
      {status.freeDebt > 0 && (
        <div className="credit-statement">
          <span>
            {t('بدهی خارج از اقساط')}
            <small>{money(status.freeDebt)} {t('تومان')}</small>
          </span>
          {canAct && (
            <span className="credit-actions">
              {onSettle && (
                <button type="button" className="credit-link-btn" onClick={onSettle}>
                  <HandCoins size={13} /> {t('تسویه بدهی')}
                </button>
              )}
              {onConvert && (
                <button type="button" className="credit-link-btn" onClick={onConvert}>
                  <CalendarClock size={13} /> {t('تبدیل به قسط')}
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {status.prepaid > 0 && <p className="credit-settled">{t('پیش‌پرداخت: {amount} تومان', { amount: money(status.prepaid) })}</p>}
      {status.debt === 0 && status.prepaid === 0 && <p className="credit-settled">{t('بدهی‌ای ندارید')}</p>}

      {status.plans.map((plan) => (
        <details key={plan.id} className="credit-plan" open={plan.remaining > 0 && plan.installments.some((i) => i.status !== 'paid' && i.status !== 'upcoming')}>
          <summary>
            {t('اقساط {date} · مانده {amount} تومان', { date: day(plan.date), amount: money(plan.remaining) })}
          </summary>
          <p className="credit-plan-meta">
            {money(plan.principal)} {t('←')} {t('{n} قسط، جمع {total} تومان', { n: fa(plan.installments.length), total: money(plan.total) })}
            {plan.cost > 0 && ` · ${t('کارمزد قسط‌بندی {cost} ({pct})', { cost: money(plan.cost), pct: `${fa(plan.pct)}${t('٪')}` })}`}
            {canAct && onUndoConversion && (
              <button type="button" className="credit-link-btn is-danger" onClick={() => onUndoConversion(plan)} title={t('حذف این قسط‌بندی')}>
                <Trash2 size={12} /> {t('حذف')}
              </button>
            )}
          </p>
          <ul>
            {plan.installments.map((i) => (
              <li key={i.n} className={`is-${i.status}`}>
                <span>{t('قسط {n} · {date}', { n: fa(i.n), date: day(i.dueDate) })}</span>
                <span>
                  {money(i.amount)}
                  {STATUS_LABELS[i.status] && <em>{STATUS_LABELS[i.status]}{i.paidOn ? ` ${day(i.paidOn)}` : ''}</em>}
                  {canAct && onPayInstallment && i.status !== 'paid' && (
                    <button type="button" className="credit-link-btn" onClick={() => onPayInstallment(plan, i)}>{t('پرداخت')}</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {status.next && (
        <div className={`credit-next ${status.overdue.count > 0 ? 'is-overdue' : ''}`}>
          <span>{t('قسط بعدی ({n} از {count}) · {date}', { n: fa(status.next.n), count: fa(status.next.count), date: day(status.next.dueDate) })}</span>
          <strong>{money(status.next.amount)} {t('تومان')}</strong>
        </div>
      )}

      {status.period && (
        <>
          <div className="account-card-stat">
            <span>{t('هزینه‌های این دوره')} <small>{t('از {date}', { date: day(status.period.from) })}</small></span>
            <strong>{money(status.period.spent)} {t('تومان')}</strong>
          </div>
          {(status.period.paidIn > 0 || status.period.takenOut > 0) && (
            <div className="account-card-stat">
              <span>{t('انتقال این دوره')}</span>
              <strong className="account-card-moved">
                {status.period.paidIn > 0 && <span className="is-in">+{money(status.period.paidIn)}</span>}
                {status.period.takenOut > 0 && <span className="is-out">−{money(status.period.takenOut)}</span>}
              </strong>
            </div>
          )}
        </>
      )}

      {costsPaid > 0 && (
        <div className="account-card-stat">
          <span>{t('کارمزدهای پرداخت‌شده')}</span>
          <strong>{money(costsPaid)} {t('تومان')}</strong>
        </div>
      )}

    </div>
  );
}
