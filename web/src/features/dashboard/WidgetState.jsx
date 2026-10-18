/**
 * WidgetState.jsx — The three states of a widget's content, drawn the same way in every widget:
 * loading (placeholder rows), empty (a message, and a button when the user can do something about
 * it) and error (a message with «تلاش دوباره»)
 *
 * A widget whose emptiness is not worth a card (no loans, no goals) returns null instead and the
 * page hides it; one that needs a choice or has a next step (an asset to pick, a first expense)
 * shows `empty`.
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { Plus } from 'lucide-react';
import Skeleton from '../../shared/ui/Skeleton.jsx';

/**
 * @param {{ state: 'loading'|'empty'|'error', rows?: number, message?: string,
 *   onAction?: () => void, disabled?: boolean }} props
 *   message: the empty text (what to do) or the error text; onAction: the empty button's tap, or
 *   the error's retry
 */
export default function WidgetState({ state, rows = 3, message = '', onAction = null, disabled = false }) {
  if (state === 'loading') {
    return (
      <div className="app-home-list" role="status" aria-busy="true">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={44} radius={12} />)}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="dash-state-error" role="alert">
        <p>{message || t('بارگذاری نشد.')}</p>
        {onAction && <button type="button" className="app-home-link" onClick={onAction}>{t('تلاش دوباره')}</button>}
      </div>
    );
  }
  if (onAction) {
    return (
      <button type="button" className="app-home-empty" onClick={onAction} disabled={disabled}>
        <Plus size={18} aria-hidden="true" />
        {message}
      </button>
    );
  }
  return <p className="dash-state-empty">{message}</p>;
}
