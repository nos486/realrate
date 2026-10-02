/**
 * AlertCenter.jsx — «هشدارها»: the bell in the header and the list of every live alert
 *
 * The bell counts the alerts not dismissed (red with a critical one among them). Its panel lists
 * them all, most severe first — dismissed ones too, dimmed — each with its items, its action and
 * «پنهان کردن». Same store as the banners (alertStore.js), so a dismissal hides both.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, AlertOctagon, AlertTriangle, Info, ChevronLeft, EyeOff } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { ALERT_SOURCES, summarizeAlerts } from '../../utils/alerts.js';
import { useAlerts, dismissAlert } from './alertStore.js';
import { runAlertAction } from './alertActions.js';

const ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const faNum = (v) => Math.round(Number(v) || 0).toLocaleString('fa-IR');

function AlertRow({ alert, hideValues, onAction }) {
  const Icon = ICON[alert.severity];
  const money = (v) => (hideValues ? '****' : faNum(v));
  return (
    <li className={`alert-center-item is-${alert.severity} ${alert.dismissed ? 'is-dismissed' : ''}`}>
      <span className="alert-center-icon"><Icon size={16} /></span>
      <div className="alert-center-body">
        <div className="alert-center-head">
          <strong>{alert.title}</strong>
          <small>{ALERT_SOURCES[alert.source]?.label}{alert.dismissed ? ' · پنهان‌شده' : ''}</small>
        </div>
        {alert.message && <p>{alert.message}</p>}
        {alert.items?.length > 0 && (
          <ul className="alert-center-items">
            {alert.items.map((item) => (
              <li key={item.key}>
                <span><b>{item.title}</b>{item.detail ? ` — ${item.detail}` : ''}</span>
                {item.amount !== undefined && <span className="alert-center-amount">{money(item.amount)} تومان</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="alert-center-actions">
          {alert.action && (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onAction(alert)}>
              {alert.action.label} <ChevronLeft size={14} />
            </button>
          )}
          {!alert.dismissed && (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => dismissAlert(alert)}>
              <EyeOff size={14} /> پنهان کردن
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function AlertCenterPanel({ onClose }) {
  const alerts = useAlerts({ includeDismissed: true });
  const hideValues = usePrivacyMode();
  const navigate = useNavigate();
  const onAction = (alert) => {
    onClose();
    runAlertAction(alert, navigate);
  };
  return (
    <Modal isOpen onClose={onClose} title="هشدارها" subtitle="اقساط، چک‌ها، پورتفو و اطلاعیه‌ها" icon={<Bell size={18} />} maxWidth="520px">
      {alerts.length === 0 ? (
        <div className="alert-center-empty">
          <BellOff size={32} strokeWidth={1.5} />
          <p>هشداری ندارید.</p>
        </div>
      ) : (
        <ul className="alert-center-list">
          {alerts.map((a) => <AlertRow key={a.id} alert={a} hideValues={hideValues} onAction={onAction} />)}
        </ul>
      )}
    </Modal>
  );
}

/** The bell; `className` matches the header it sits in */
export default function AlertCenterButton({ className = 'btn-privacy-toggle icon-only', iconSize = 15 }) {
  const [open, setOpen] = useState(false);
  const counts = summarizeAlerts(useAlerts());
  const count = counts.critical + counts.warning;
  const label = count ? `هشدارها (${faNum(count)})` : 'هشدارها';
  return (
    <>
      <button type="button" className={`${className} alert-center-button`} onClick={() => setOpen(true)} title={label} aria-label={label}>
        <Bell size={iconSize} strokeWidth={2.2} />
        {count > 0 && (
          <span className={`alert-center-badge ${counts.critical ? 'is-critical' : ''}`} aria-hidden="true">
            {count > 9 ? '۹+' : faNum(count)}
          </span>
        )}
      </button>
      {open && <AlertCenterPanel onClose={() => setOpen(false)} />}
    </>
  );
}
