/**
 * SubscriptionCard.jsx — One subscription as a row card (shared/ui/RowCard.jsx, the design loans
 * share): the subscription, its cycle and account, and its state; what it costs (and its monthly
 * share); a bar of how much of its current period is left; the days until its next renewal (or
 * its end) — or where it stands; and its actions (record a payment, edit, delete; open its site,
 * pause / resume, cancel / reactivate in the menu). A tap on the row edits it.
 */

import React from 'react';
import { Receipt, Pencil, Pause, Play, Ban, Trash2, ExternalLink, BellOff, Clock } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
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
  const when = view.state === 'ended' ? t('پایان {date}', { date: shamsiDay(sub.endDate) })
    : view.state === 'cancelled' ? (sub.cancelledOn ? t('لغو {date}', { date: shamsiDay(sub.cancelledOn) }) : t('لغو'))
      : view.state === 'paused' ? t('متوقف — تمدیدی حساب نمی‌شود')
        : t('تمدید دیگری تا پایان نیست');
  const left = period ? Math.round((1 - period.progress) * 100) : 0;
  const ends = period?.until === 'end';
  const lastPaid = sub.lastPaidOn ? t('آخرین پرداخت {date}', { date: shamsiDay(sub.lastPaidOn) }) : '';
  // What runs out soon, besides the renewal: its end, or that it is renewed by hand
  const note = view.endsSoon && view.state !== 'ended' && !ends ? t('پایان {date}', { date: shamsiDay(sub.endDate) })
    : sub.autoRenew === false && live ? t('تمدید دستی') : lastPaid;

  return (
    <RowCard
      as="li"
      tone={badge.row}
      icon={React.createElement(subscriptionIcon(sub.category), { size: 18 })}
      iconTone={badge.period}
      title={sub.name}
      subtitle={[cycleLabel(sub.cycleMonths), account && t('از {account}', { account: accountLabel(account) })].filter(Boolean).join(' · ')}
      badge={(
        <>
          <RowCardBadge tone={badge.badge}>
            {badge.label}
          </RowCardBadge>
          {sub.remindersMuted && live && <BellOff size={13} className="row-card-flag" aria-label={t('بدون یادآوری')} />}
        </>
      )}
      hint={sub.notes || ''}
      onClick={readOnly ? undefined : () => onEdit(sub)}
      actions={(
        <>
          {/* One that renews by itself records its payments as they come (useSubscriptions) */}
          {live && sub.status === 'active' && !sub.autoRenew && (
            <RowCardAction onClick={() => onPay(sub, view)} disabled={readOnly} title={t('ثبت پرداخت')} aria-label={t('ثبت پرداخت')}>
              <Receipt size={14} />
            </RowCardAction>
          )}
          <RowCardAction onClick={() => onEdit(sub)} disabled={readOnly} title={t('ویرایش اشتراک')} aria-label={t('ویرایش اشتراک')}>
            <Pencil size={14} />
          </RowCardAction>
          <RowCardAction danger onClick={() => onDelete(sub)} disabled={readOnly} title={t('حذف اشتراک')} aria-label={t('حذف اشتراک')}>
            <Trash2 size={14} />
          </RowCardAction>
          <ActionMenu
            disabled={readOnly}
            items={[
              sub.url && { key: 'open', label: t('باز کردن سایت'), icon: <ExternalLink size={14} />, onClick: () => window.open(sub.url, '_blank', 'noopener') },
              live && sub.status === 'active' && { key: 'pause', label: t('توقف موقت'), icon: <Pause size={14} />, onClick: () => onStatus(sub, 'paused') },
              sub.status === 'paused' && { key: 'resume', label: t('ادامه'), icon: <Play size={14} />, onClick: () => onStatus(sub, 'active') },
              sub.status !== 'cancelled' && { key: 'cancel', label: t('لغو اشتراک'), icon: <Ban size={14} />, onClick: () => onStatus(sub, 'cancelled') },
              sub.status === 'cancelled' && { key: 'reactivate', label: t('فعال‌سازی دوباره'), icon: <Play size={14} />, onClick: () => onStatus(sub, 'active') },
            ]}
          />
        </>
      )}
    >
      <RowCardBlock
        label={t('مبلغ')}
        value={money(sub.amount, sub.currency)}
        sub={sub.cycleMonths > 1 ? t('ماهی {amount}', { amount: money(view.monthly, sub.currency) }) : cycleLabel(sub.cycleMonths)}
      />
      {period ? (
        <RowCardProgress
          label={ends ? t('پایان {date}', { date: shamsiDay(period.to) }) : view.state === 'expired' ? t('اعتبار تا {date}', { date: shamsiDay(period.to) }) : t('تمدید بعدی {date}', { date: shamsiDay(period.to) })}
          figure={periodLeftLabel(period)}
          pct={left}
          tone={badge.period}
          ariaLabel={periodLeftLabel(period)}
        />
      ) : (
        <RowCardBlock className="row-card-progress" label={t('وضعیت')} value={when} valueTone="muted" />
      )}
      {period ? (
        <RowCardBlock
          label={<><Clock size={12} /> {ends ? t('تا پایان') : t('تا تمدید')}</>}
          value={periodDaysLabel(period)}
          valueTone={badge.period}
          sub={note}
        />
      ) : (
        <RowCardBlock label={t('آخرین پرداخت')} value={sub.lastPaidOn ? shamsiDay(sub.lastPaidOn) : '—'} valueTone="muted" />
      )}
    </RowCard>
  );
}
