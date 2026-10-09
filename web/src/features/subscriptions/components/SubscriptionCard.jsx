/**
 * SubscriptionCard.jsx — One subscription in the list: what it costs (and its monthly share), when
 * it renews or ran out, its state, and its actions (record a payment; edit, open its site, pause /
 * resume, cancel / reactivate, delete)
 */

import React from 'react';
import { Receipt, Pencil, Pause, Play, Ban, Trash2, ExternalLink, BellOff } from 'lucide-react';
import { ActionMenu, Button } from '../../../shared/ui/index.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import {
  STATE_BADGES, cycleLabel, daysLabel, formatSubscriptionAmount, shamsiDay, subscriptionIcon,
} from '../constants/subscriptionDisplay.js';

/**
 * @param {{ sub: object, view: object, account?: object, hideValues?: boolean, readOnly?: boolean,
 *   onPay: Function, onEdit: Function, onStatus: Function, onDelete: Function }} props
 *   view: subscriptionView(sub, today)
 */
export default function SubscriptionCard({ sub, view, account, hideValues, readOnly, onPay, onEdit, onStatus, onDelete }) {
  const badge = STATE_BADGES[view.state];
  const money = (v, c) => (hideValues ? '****' : formatSubscriptionAmount(v, c));
  const live = sub.status !== 'cancelled' && view.state !== 'ended';
  const when = view.nextRenewal
    ? `${view.state === 'expired' ? 'اعتبار تا' : 'تمدید'} ${shamsiDay(view.nextRenewal)} — ${daysLabel(view.daysLeft)}`
    : view.state === 'ended' ? `پایان ${shamsiDay(sub.endDate)}`
      : view.state === 'cancelled' ? `لغو ${sub.cancelledOn ? shamsiDay(sub.cancelledOn) : ''}`.trim()
        : view.state === 'paused' ? 'متوقف — تمدیدی حساب نمی‌شود'
          : 'تمدید دیگری تا پایان نیست';

  return (
    <li className={`sub-card ${badge.tone}`}>
      <div className="sub-card-icon">{React.createElement(subscriptionIcon(sub.category), { size: 18 })}</div>
      <div className="sub-card-main">
        <div className="sub-card-head">
          <span className="sub-card-name">{sub.name}</span>
          <span className={`sub-badge ${badge.tone}`}>{badge.label}</span>
          {sub.remindersMuted && live && <BellOff size={13} className="sub-card-muted" aria-label="بدون یادآوری" />}
        </div>
        <div className="sub-card-amount">
          <strong>{money(sub.amount, sub.currency)}</strong>
          <span className="sub-card-cycle">{cycleLabel(sub.cycleMonths)}</span>
          {sub.cycleMonths > 1 && <span className="sub-card-monthly">ماهی {money(view.monthly, sub.currency)}</span>}
        </div>
        <div className="sub-card-meta">
          <span>{when}</span>
          {sub.autoRenew === false && live && <span>تمدید دستی</span>}
          {view.endsSoon && view.state !== 'ended' && <span className="sub-card-warn">پایان {shamsiDay(sub.endDate)}</span>}
          {account && <span>از {accountLabel(account)}</span>}
          {sub.lastPaidOn && <span>آخرین پرداخت {shamsiDay(sub.lastPaidOn)}</span>}
        </div>
        {sub.notes && <p className="sub-card-notes">{sub.notes}</p>}
      </div>
      <div className="sub-card-actions">
        {live && sub.status === 'active' && (
          <Button size="sm" variant="secondary" icon={<Receipt size={14} />} onClick={() => onPay(sub, view)} disabled={readOnly}>
            ثبت پرداخت
          </Button>
        )}
        <ActionMenu
          disabled={readOnly}
          items={[
            { key: 'edit', label: 'ویرایش', icon: <Pencil size={14} />, onClick: () => onEdit(sub) },
            sub.url && { key: 'open', label: 'باز کردن سایت', icon: <ExternalLink size={14} />, onClick: () => window.open(sub.url, '_blank', 'noopener') },
            live && sub.status === 'active' && { key: 'pause', label: 'توقف موقت', icon: <Pause size={14} />, onClick: () => onStatus(sub, 'paused') },
            sub.status === 'paused' && { key: 'resume', label: 'ادامه', icon: <Play size={14} />, onClick: () => onStatus(sub, 'active') },
            sub.status !== 'cancelled' && { key: 'cancel', label: 'لغو اشتراک', icon: <Ban size={14} />, onClick: () => onStatus(sub, 'cancelled') },
            sub.status === 'cancelled' && { key: 'reactivate', label: 'فعال‌سازی دوباره', icon: <Play size={14} />, onClick: () => onStatus(sub, 'active') },
            { key: 'delete', label: 'حذف', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(sub) },
          ]}
        />
      </div>
    </li>
  );
}
