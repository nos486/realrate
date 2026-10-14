/**
 * DueReminderAlert.jsx — One-line reminder of things coming due (loan installments, cheques, ...)
 *
 * Shows the count and total on one line and expands to the list on demand, so a reminder never
 * pushes the page content down. Items: `{ key, title, detail, amount }`.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useState } from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import AlertBanner from './AlertBanner.jsx';

const formatNum = (v) => Number(v || 0).toLocaleString(intlLocale());

export default function DueReminderAlert({ type = 'warning', title, items, actionLabel, onAction, onClose, hideValues = false }) {
  const [expanded, setExpanded] = useState(false);
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const money = (v) => (hideValues ? '****' : formatNum(v));

  return (
    <AlertBanner
      type={type}
      className="due-alert"
      onClose={onClose}
      message={
        <div className="due-alert-body">
          <div className="due-alert-summary">
            <strong>{title}</strong>
            <span className="due-alert-total">{t('مجموع {amount} تومان', { amount: money(total) })}</span>
            <button
              type="button"
              className="due-alert-toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? t('بستن') : t('جزئیات')}
              <ChevronDown size={14} className={expanded ? 'is-open' : ''} />
            </button>
          </div>
          {expanded && (
            <ul className="due-alert-list">
              {items.map((item) => (
                <li key={item.key}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <strong className="due-alert-amount">{t('{amount} تومان', { amount: money(item.amount) })}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
      action={
        <button type="button" className={`due-alert-action is-${type}`} onClick={onAction} aria-label={actionLabel}>
          <span>{actionLabel}</span>
          <ChevronLeft size={14} />
        </button>
      }
    />
  );
}
