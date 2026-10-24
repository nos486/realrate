/**
 * ShortcutsWidget.jsx — «میان‌بُرها»: one tap to record an expense or to open a section the
 * user uses often
 */

import { t, msg } from '../../../utils/i18n.js';
import React from 'react';
import { Zap, BarChart3, Briefcase, HandCoins, Landmark, Plus, Wallet } from 'lucide-react';
import { useDashboardData } from '../DashboardContext.js';
import WidgetCard from '../WidgetCard.jsx';

/**
 * The shortcuts: the section they open (a tab of the page). The section each needs is the
 * catalog's (`items.requires`): the page leaves out of `items` those the user cannot open.
 */
const SHORTCUTS = [
  { target: 'add-expense', label: msg('ثبت هزینه'), Icon: Plus },
  { target: 'incomes', label: msg('درآمدها'), Icon: Wallet },
  { target: 'expenses', label: msg('هزینه‌ها'), Icon: HandCoins },
  { target: 'portfolio', label: msg('پورتفو'), Icon: Briefcase },
  { target: 'loans', label: msg('وام و اقساط'), Icon: Landmark },
  { target: 'reports', label: msg('گزارش‌ها'), Icon: BarChart3 },
];

export default function ShortcutsWidget({ widget }) {
  const { open } = useDashboardData();
  const style = widget.config?.style || 'grid';
  const items = widget.config?.items;
  return (
    <WidgetCard title={t('میان‌بُرها')} Icon={Zap}>
      <div className={`dash-shortcuts is-${style}`}>
      {SHORTCUTS.filter((s) => !items || items.includes(s.target)).map(({ target, label, Icon }) => (
        <button key={target} type="button" className="dash-shortcut" onClick={() => open(target)}>
          <Icon size={18} aria-hidden="true" />
          <span>{t(label)}</span>
        </button>
      ))}
      </div>
    </WidgetCard>
  );
}
