/**
 * accountDisplay.js — How an account is shown: its icon and its one-line label
 */

import { Landmark, Banknote, Smartphone, WalletMinimal } from 'lucide-react';

const TYPE_ICONS = { bank: Landmark, cash: Banknote, wallet: Smartphone, other: WalletMinimal };

export function getAccountTypeIcon(type) {
  return TYPE_ICONS[type] || WalletMinimal;
}

/**
 * «ملت (۱۲۳۴)» style label: the name, and the card's last digits when known (no bullet dots:
 * next to Persian digits they read as zeros)
 */
export function accountLabel(account) {
  if (!account) return 'حساب حذف‌شده';
  const digits = account.cardLast4
    ? Number(account.cardLast4).toLocaleString('fa-IR', { useGrouping: false, minimumIntegerDigits: 4 })
    : '';
  return digits ? `${account.name} (${digits})` : account.name;
}
