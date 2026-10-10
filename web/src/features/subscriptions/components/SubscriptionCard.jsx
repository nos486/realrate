/**
 * SubscriptionCard.jsx — One subscription as a row card (shared/ui/RowCard.jsx, the design loans
 * share): the subscription, its cycle and account, and its state; what it costs (and its monthly
 * share); a bar of how much of its current period is left; the days until its next renewal (or
 * its end) — or where it stands; and its actions (record a payment, edit, delete; open its site,
 * pause / resume, cancel / reactivate in the menu). A tap on the row edits it.
 */

import React from 'react';
import { Receipt, Pencil, Pause, Play, Ban, Trash2, ExternalLink, BellOff, Clock } from 'lucide-react';
import { ActionMenu, RowCard, RowCardAction, RowCardBadge, RowCardBlock, RowCardProgress } from '../../../shared/ui/index.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import {
  STATE_BADGES, cycleLabel, formatSubscriptionAmount, periodDaysLabel, periodLeftLabel, shamsiDay,
  subscriptionIcon,
} from '../constants/subscriptionDisplay.js';

/**
 * @param {{ sub: object, view: object, period?: object|null, account?: object, hideValues?: boolean, readOnly?: boolean,
 *   onPay: Function, onEdit: Function, onStatus: Function, onDelete: Function }} props
 *   view: subscriptionView(sub, today); period: subscriptionPeriod(sub, today)
 */
export default function SubscriptionCard({ sub, view, period, account, hideValues, readOnly, onPay, onEdit, onStatus, onDelete }) {
  const badge = STATE_BADGES[view.state];
  const money = (v, c) => (hideValues ? '****' : formatSubscriptionAmount(v, c));
  const live = sub.status !== 'cancelled' && view.state !== 'ended';
  // Where it stands when it has no period running
  const when = view.state === 'ended' ? `پایان ${shamsiDay(sub.endDate)}`
    : view.state === 'cancelled' ? `لغو ${sub.cancelledOn ? shamsiDay(sub.cancelledOn) : ''}`.trim()
      : view.state === 'paused' ? 'متوقف — تمدیدی حساب نمی‌شود'
        : 'تمدید دیگری تا پایان نیست';
  const left = period ? Math.round((1 - period.progress) * 100) : 0;
  const ends = period?.until === 'end';
  const lastPaid = sub.lastPaidOn ? `آخرین پرداخت ${shamsiDay(sub.lastPaidOn)}` : '';
  // What runs out soon, besides the renewal: its end, or that it is renewed by hand
  const note = view.endsSoon && view.state !== 'ended' && !ends ? `پایان ${shamsiDay(sub.endDate)}`
    : sub.autoRenew === false && live ? 'تمدید دستی' : lastPaid;

  return (
    <RowCard
      as="li"
      tone={badge.row}
      icon={React.createElement(subscriptionIcon(sub.category), { size: 18 })}
      iconTone={badge.period}
      title={sub.name}
      subtitle={[cycleLabel(sub.cycleMonths), account && `از ${accountLabel(account)}`].filter(Boolean).join(' · ')}
      badge={(
        <>
          <RowCardBadge tone={badge.badge}>
            {badge.label}
          </RowCardBadge>
          {sub.remindersMuted && live && <BellOff size={13} className="row-card-flag" aria-label="بدون یادآوری" />}
        </>
      )}
      hint={sub.notes || ''}
      onClick={readOnly ? undefined : () => onEdit(sub)}
      actions={(
        <>
          {/* One that renews by itself records its payments as they come (useSubscriptions) */}
          {live && sub.status === 'active' && !sub.autoRenew && (
            <RowCardAction onClick={() => onPay(sub, view)} disabled={readOnly} title="ثبت پرداخت" aria-label="ثبت پرداخت">
              <Receipt size={14} />
            </RowCardAction>
          )}
          <RowCardAction onClick={() => onEdit(sub)} disabled={readOnly} title="ویرایش اشتراک" aria-label="ویرایش اشتراک">
            <Pencil size={14} />
          </RowCardAction>
          <RowCardAction danger onClick={() => onDelete(sub)} disabled={readOnly} title="حذف اشتراک" aria-label="حذف اشتراک">
            <Trash2 size={14} />
          </RowCardAction>
          <ActionMenu
            disabled={readOnly}
            items={[
              sub.url && { key: 'open', label: 'باز کردن سایت', icon: <ExternalLink size={14} />, onClick: () => window.open(sub.url, '_blank', 'noopener') },
              live && sub.status === 'active' && { key: 'pause', label: 'توقف موقت', icon: <Pause size={14} />, onClick: () => onStatus(sub, 'paused') },
              sub.status === 'paused' && { key: 'resume', label: 'ادامه', icon: <Play size={14} />, onClick: () => onStatus(sub, 'active') },
              sub.status !== 'cancelled' && { key: 'cancel', label: 'لغو اشتراک', icon: <Ban size={14} />, onClick: () => onStatus(sub, 'cancelled') },
              sub.status === 'cancelled' && { key: 'reactivate', label: 'فعال‌سازی دوباره', icon: <Play size={14} />, onClick: () => onStatus(sub, 'active') },
            ]}
          />
        </>
      )}
    >
      <RowCardBlock
        label="مبلغ"
        value={money(sub.amount, sub.currency)}
        sub={sub.cycleMonths > 1 ? `ماهی ${money(view.monthly, sub.currency)}` : cycleLabel(sub.cycleMonths)}
      />
      {period ? (
        <RowCardProgress
          label={`${ends ? 'پایان' : view.state === 'expired' ? 'اعتبار تا' : 'تمدید بعدی'} ${shamsiDay(period.to)}`}
          figure={periodLeftLabel(period)}
          pct={left}
          tone={badge.period}
          ariaLabel={periodLeftLabel(period)}
        />
      ) : (
        <RowCardBlock className="row-card-progress" label="وضعیت" value={when} valueTone="muted" />
      )}
      {period ? (
        <RowCardBlock
          label={<><Clock size={12} /> {ends ? 'تا پایان' : 'تا تمدید'}</>}
          value={periodDaysLabel(period)}
          valueTone={badge.period}
          sub={note}
        />
      ) : (
        <RowCardBlock label="آخرین پرداخت" value={sub.lastPaidOn ? shamsiDay(sub.lastPaidOn) : '—'} valueTone="muted" />
      )}
    </RowCard>
  );
}
