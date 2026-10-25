/**
 * AdminPage.jsx — The frame every admin section is built from, so all of them look and behave
 * the same:
 *  - AdminPage: the section's header (name, icon and description from adminSections.js, plus the
 *    page's actions), then one of: an error with «تلاش دوباره», a skeleton while loading, or the page
 *  - AdminTabs: a page's parts as tabs; the open tab is kept in the address (?tab=) so a reload or a
 *    shared link opens it again. Every panel stays mounted (only hidden), so a half-edited form in
 *    one tab survives a look at another.
 *  - AdminCard: one card of a page (the shared Card, as a labelled section)
 *  - AdminSwitch: the on/off switch of a card or a row
 */

import React, { useState } from 'react';
import { intlLocale } from '../../../utils/i18n.js';
import { AlertTriangle } from 'lucide-react';
import { Button, Card, EmptyState, FeaturePageHeader, FilterPills } from '../../../shared/ui/index.js';
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
  return (
    <div className="admin-tabs">
      <nav className="admin-tabs-bar" aria-label={label}>
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
