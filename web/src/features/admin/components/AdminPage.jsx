/**
 * AdminPage.jsx — The frame every admin section is built from, so all of them look and behave
 * the same:
 *  - AdminPage: the section's header (name, icon and description from adminSections.js, plus the
 *    page's actions), then one of: an error with «تلاش دوباره», a skeleton while loading, or the page
 *  - AdminTabs: a page's parts as tabs; the open tab is kept in the address (?tab=) so a reload or a
 *    shared link opens it again, and on a phone the bar scrolls sideways to keep it in view. Every panel stays mounted (only hidden), so a half-edited form in
 *    one tab survives a look at another.
 *  - AdminCard: one card of a page (the shared Card, as a labelled section)
 *  - AdminSwitch: the on/off switch of a card or a row
 *  - AdminNotice: a message in a card or over a page (an error, a warning, unsaved edits, a check
 *    that passed): the shared AlertBanner
 *  - AdminStatus: one short status line (ok, warning, or plain) under a field or in a row
 *  - AdminCheck: a checkbox with its text (a choice in a list)
 *  - AdminList / AdminListRow: a list of rows (a switch, the name and a status line, then the
 *    row's controls); a paused row is dimmed
 *  - AdminRemoveButton: a row's delete button
 *  - AdminSaveBar: «ذخیره» and «انصراف» under a list edited in place, with a note while unsaved
 */

import React, { useEffect, useRef, useState } from 'react';
import { intlLocale } from '../../../utils/i18n.js';
import { AlertTriangle, CheckCircle2, Save, Trash2 } from 'lucide-react';
import { AlertBanner, Button, Card, EmptyState, FeaturePageHeader, FilterPills } from '../../../shared/ui/index.js';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { ADMIN_SECTIONS } from '../adminSections.js';

/**
 * @param {{ section: string, actions?: import('react').ReactNode, loading?: boolean, error?: string,
 *   onRetry?: () => void, className?: string, children?: import('react').ReactNode }} props
 *   error: shown in place of the page (only when there is nothing to show yet)
 */
export default function AdminPage({ section, actions = null, loading = false, error = '', onRetry, className = '', children }) {
  const meta = ADMIN_SECTIONS[section];
  const Icon = meta.icon;
  return (
    <div className={`admin-page ${className}`.trim()}>
      <FeaturePageHeader icon={<Icon size={24} />} title={meta.title} subtitle={meta.subtitle} actions={actions} />
      {error ? (
        <EmptyState
          icon={<AlertTriangle size={40} strokeWidth={1.5} />}
          title="دریافت اطلاعات ممکن نشد"
          description={error}
          action={onRetry ? <Button onClick={onRetry}>تلاش دوباره</Button> : null}
        />
      ) : loading ? (
        <SkeletonRows rows={6} columns={2} label={`در حال دریافت ${meta.title}`} />
      ) : (
        children
      )}
    </div>
  );
}

const readTab = (ids, initial) => {
  try {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return ids.includes(tab) ? tab : initial;
  } catch {
    return initial;
  }
};

/** Put the open tab in the address without a navigation (the router's own state is kept) */
const writeTab = (tab, initial) => {
  try {
    const url = new URL(window.location.href);
    if (tab === initial) url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', url);
  } catch {
    /* the address is only a convenience */
  }
};

/**
 * @param {{ tabs: Array<{ id: string, label: string, icon?: import('react').ReactNode,
 *   badge?: number|null, content: import('react').ReactNode }>, label: string, initial?: string }} props
 *   label: the tab bar's name for screen readers; badge: a count beside the tab's name (none when 0);
 *   initial: the tab opened when the address names none (the first by default)
 */
export function AdminTabs({ tabs, label, initial }) {
  const ids = tabs.map((t) => t.id);
  const first = ids.includes(initial) ? initial : ids[0];
  const [active, setActive] = useState(() => readTab(ids, first));
  const open = ids.includes(active) ? active : first;
  const choose = (id) => {
    setActive(id);
    writeTab(id, first);
  };
  // The bar scrolls sideways on a phone: keep the open tab in view
  const barRef = useRef(null);
  useEffect(() => {
    const bar = barRef.current;
    if (bar && bar.scrollWidth > bar.clientWidth) bar.querySelector('.filter-pill-btn.active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [open]);
  return (
    <div className="admin-tabs">
      <nav ref={barRef} className="admin-tabs-bar" aria-label={label}>
        <FilterPills
          variant="segmented"
          options={tabs.map(({ id, label: name, icon, badge }) => ({ value: id, label: name, icon, badge: badge ? Number(badge).toLocaleString(intlLocale()) : null }))}
          activeValue={open}
          onChange={choose}
        />
      </nav>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" aria-label={t.label} hidden={t.id !== open} className="admin-tab-panel">
          {t.content}
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{ title: string, subtitle?: string, icon?: import('react').ReactNode,
 *   actions?: import('react').ReactNode, className?: string, as?: string, children?: import('react').ReactNode }} props
 */
export function AdminCard({ className = '', as = 'section', children, ...rest }) {
  return (
    <Card as={as} padding="md" className={`admin-card ${className}`.trim()} {...rest}>
      {children}
    </Card>
  );
}

/**
 * @param {{ checked: boolean, onChange: (on: boolean) => void, label: string, disabled?: boolean }} props
 *   label: what it switches, for screen readers
 */
export function AdminSwitch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`admin-switch ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="admin-switch-thumb" />
    </button>
  );
}

const NOTICE_TYPES = { ok: 'success', warn: 'warning', error: 'error', info: 'info' };

/**
 * The shared AlertBanner in the admin's words
 * @param {{ tone?: 'ok'|'warn'|'error'|'info', onClose?: () => void, children: import('react').ReactNode }} props
 *   children: the message; a <strong> leads it and a <small> under it explains it; onClose: a
 *   close button (a result the admin dismisses)
 */
export function AdminNotice({ tone = 'warn', onClose, children }) {
  return <AlertBanner type={NOTICE_TYPES[tone] || 'warning'} className="admin-notice" onClose={onClose || null}>{children}</AlertBanner>;
}

/**
 * @param {{ tone?: 'ok'|'warn'|null, children: import('react').ReactNode }} props
 *   tone: an icon and its color before the text (none: a plain muted line)
 */
export function AdminStatus({ tone = null, children }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : null;
  return (
    <small className={`admin-status ${tone ? `is-${tone}` : ''}`.trim()}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      <span>{children}</span>
    </small>
  );
}

/** @param {{ checked: boolean, onChange: (on: boolean) => void, disabled?: boolean, children: import('react').ReactNode }} props */
export function AdminCheck({ checked, onChange, disabled = false, children }) {
  return (
    <label className={`admin-check ${disabled ? 'is-disabled' : ''}`.trim()}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** @param {{ label?: string, children: import('react').ReactNode }} props */
export function AdminList({ label, children }) {
  return <ul className="admin-list" aria-label={label}>{children}</ul>;
}

/**
 * @param {{ leading?: import('react').ReactNode, title: import('react').ReactNode,
 *   meta?: import('react').ReactNode, actions?: import('react').ReactNode, off?: boolean }} props
 *   leading: the row's switch; meta: its status line; actions: its controls (at the end)
 */
export function AdminListRow({ leading = null, title, meta = null, actions = null, off = false }) {
  return (
    <li className={`admin-list-row ${off ? 'is-off' : ''}`.trim()}>
      {leading}
      <div className="admin-list-main">
        <div className="admin-list-title">{title}</div>
        {meta}
      </div>
      {actions && <div className="admin-list-actions">{actions}</div>}
    </li>
  );
}

/** @param {{ label: string, onClick: () => void }} props label: what is deleted, for screen readers */
export function AdminRemoveButton({ label, onClick }) {
  return (
    <button type="button" className="admin-remove" aria-label={label} title={label} onClick={onClick}>
      <Trash2 size={16} />
    </button>
  );
}

/**
 * @param {{ dirty: boolean, busy?: boolean, disabled?: boolean, onSave: () => void, onCancel: () => void, label?: string }} props
 */
export function AdminSaveBar({ dirty, busy = false, disabled = false, onSave, onCancel, label = 'ذخیره' }) {
  return (
    <div className="admin-save-bar">
      <Button size="sm" icon={<Save size={14} />} loading={busy} disabled={!dirty || busy || disabled} onClick={onSave}>
        {label}
      </Button>
      {dirty && (
        <>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>انصراف</Button>
          <small className="admin-status is-warn">تغییرات ذخیره نشده‌اند</small>
        </>
      )}
    </div>
  );
}
