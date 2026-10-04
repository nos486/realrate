/**
 * ProjectsPage.jsx — Projects: sections with their own expenses (a renovation, a trip…), in
 * tomans or dollars, with a budget each — its own part of the app, next to «هزینه‌ها»
 * (everyday spending). Routes: /projects (the list) and /projects/:groupId (one project).
 * The `expenses` feature opens it; everything is end-to-end encrypted, so nothing shows while
 * the vault is locked.
 */

import React from 'react';
import { FolderKanban } from 'lucide-react';
import { FeaturePageHeader } from '../../../shared/ui/index.js';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../../shared/vault/useVault.js';
import { usePricing } from '../../market/index.js';
import ProjectExpensesView from './ProjectExpensesView.jsx';

const HEADER = {
  icon: <FolderKanban size={24} />,
  title: 'پروژه‌ها',
  subtitle: 'هزینه‌های هر پروژه به تومان یا دلار، با بودجه‌ی خودش',
};

/**
 * @param {{ groupId?: string|null, onSelectGroup?: (id: string|null) => void }} props
 */
export default function ProjectsPage({ groupId = null, onSelectGroup }) {
  const { status: vaultStatus } = useVault();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || Number(pricing?.summary?.usdToman) || 0;

  if (vaultStatus === 'locked') {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="پروژه‌های شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  return (
    <div className="incomes-page-container expenses-page">
      <FeaturePageHeader {...HEADER} />
      <ProjectExpensesView groupId={groupId} onSelectGroup={onSelectGroup} usdToman={usdToman} />
    </div>
  );
}
