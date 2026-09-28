/**
 * ExpensesPage.jsx — Expenses: everyday spending by category, and project sections
 *
 * Two views under one header (admin-only while in beta — the `expenses` feature):
 *  - «روزمره» (/expenses): everyday expenses month by month, by category (DailyExpensesView)
 *  - «پروژه‌ها» (/expenses/projects, /expenses/:groupId): sections with their own expenses
 *    (ProjectExpensesView)
 * Everything is end-to-end encrypted, so nothing shows while the vault is locked.
 */

import React from 'react';
import { HandCoins, CalendarDays, FolderKanban } from 'lucide-react';
import { FeaturePageHeader, FilterPills } from '../../../shared/ui/index.js';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { usePricing } from '../../market/index.js';
import DailyExpensesView from './DailyExpensesView.jsx';
import ProjectExpensesView from './ProjectExpensesView.jsx';

const HEADER = {
  icon: <HandCoins size={24} />,
  title: 'هزینه‌ها',
  subtitle: 'هزینه‌های روزمره با دسته‌بندی، و هزینه‌های هر پروژه به تومان یا دلار',
};

const VIEW_OPTIONS = [
  { value: 'daily', label: 'روزمره', icon: <CalendarDays size={14} /> },
  { value: 'projects', label: 'پروژه‌ها', icon: <FolderKanban size={14} /> },
];

/**
 * @param {{ segment?: string|null, onNavigate?: (segment: string|null) => void }} props
 *   `segment`: what follows /expenses/ in the URL — none (daily), 'projects', or a section id
 */
export default function ExpensesPage({ segment = null, onNavigate }) {
  const { status: vaultStatus } = useVault();
  const hideValues = usePrivacyMode();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || Number(pricing?.summary?.usdToman) || 0;
  const view = segment ? 'projects' : 'daily';

  if (vaultStatus === 'locked') {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="هزینه‌های شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  return (
    <div className="incomes-page-container expenses-page">
      <FeaturePageHeader
        {...HEADER}
        actions={
          <FilterPills
            options={VIEW_OPTIONS}
            activeValue={view}
            onChange={(next) => onNavigate?.(next === 'daily' ? null : 'projects')}
            size="sm"
          />
        }
      />
      {view === 'daily' ? (
        <DailyExpensesView usdToman={usdToman} hideValues={hideValues} />
      ) : (
        <ProjectExpensesView
          groupId={segment === 'projects' ? null : segment}
          onSelectGroup={(id) => onNavigate?.(id || 'projects')}
          usdToman={usdToman}
        />
      )}
    </div>
  );
}
