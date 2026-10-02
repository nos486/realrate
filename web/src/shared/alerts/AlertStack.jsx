/**
 * AlertStack.jsx — The live alerts of some sources, as banners on the page they concern
 *
 * One look for every alert (alertStore.js): an alert made of items (installments, cheques)
 * is one line with its total that opens to the list (DueReminderAlert); one without is a plain
 * banner. Critical shows red, warning amber, info blue; «×» dismisses it (alertStore.js).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import AlertBanner from '../ui/AlertBanner.jsx';
import DueReminderAlert from '../ui/DueReminderAlert.jsx';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { useAlerts, dismissAlert } from './alertStore.js';
import { runAlertAction } from './alertActions.js';

const BANNER_TYPE = { critical: 'error', warning: 'warning', info: 'info' };

export default function AlertStack({ sources = null, scope = null, className = '' }) {
  const alerts = useAlerts({ sources, scope });
  const hideValues = usePrivacyMode();
  const navigate = useNavigate();
  if (!alerts.length) return null;

  return (
    <div className={`due-alerts-stack alert-stack ${className}`}>
      {alerts.map((alert) => {
        const type = BANNER_TYPE[alert.severity];
        const onAction = () => runAlertAction(alert, navigate);
        if (alert.items?.length && alert.amount !== undefined) {
          return (
            <DueReminderAlert
              key={alert.id}
              type={type}
              title={alert.title}
              items={alert.items}
              actionLabel={alert.action?.label || 'مشاهده'}
              onAction={onAction}
              onClose={() => dismissAlert(alert)}
              hideValues={hideValues}
            />
          );
        }
        return (
          <AlertBanner
            key={alert.id}
            type={type}
            className="due-alert"
            title={alert.title}
            message={alert.message || (alert.items || []).map((i) => [i.title, i.detail].filter(Boolean).join(': ')).join('، ')}
            onClose={() => dismissAlert(alert)}
            action={alert.action ? (
              <button type="button" className={`due-alert-action is-${type}`} onClick={onAction}>
                <span>{alert.action.label}</span>
                <ChevronLeft size={14} />
              </button>
            ) : null}
          />
        );
      })}
    </div>
  );
}
