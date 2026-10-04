/**
 * ExpensesPage.jsx — Everyday expenses, month by month, by category (DailyExpensesView). Projects
 * have their own part of the app (ProjectsPage, /projects). Admin-only while in beta (the
 * `expenses` feature); everything is end-to-end encrypted, so nothing shows while the vault is
 * locked.
 */

import React from 'react';
import { HandCoins } from 'lucide-react';
import { FeaturePageHeader } from '../../../shared/ui/index.js';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { usePricing } from '../../market/index.js';
import DailyExpensesView from './DailyExpensesView.jsx';

const HEADER = {
  icon: <HandCoins size={24} />,
  title: 'هزینه‌ها',
  subtitle: 'هزینه‌های روزمره با دسته‌بندی، بودجه و مقایسه با ماه قبل',
};

export default function ExpensesPage() {
  const { status: vaultStatus } = useVault();
  const hideValues = usePrivacyMode();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || Number(pricing?.summary?.usdToman) || 0;

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
      <FeaturePageHeader {...HEADER} />
      <DailyExpensesView usdToman={usdToman} hideValues={hideValues} />
    </div>
  );
}
