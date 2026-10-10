/**
 * accountDisplay.js — How an account is shown: its icon and its one-line label
 */

import { Landmark, Banknote, Smartphone, WalletMinimal, CreditCard } from 'lucide-react';
import { accountCurrencies } from '../../../utils/accountDocument.js';
import { currencyAdjective } from '../../../utils/currencies.js';

const TYPE_ICONS = { bank: Landmark, credit: CreditCard, cash: Banknote, wallet: Smartphone, other: WalletMinimal };

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

/**
 * What an account holds besides plain tomans, for its card: «دلاری», «تومانی و یورویی»; '' for
 * a toman-only account (the default needs no word)
 */
export function accountCurrencyLabel(account) {
  const held = accountCurrencies(account);
  if (held.length === 1 && held[0] === 'IRT') return '';
  return held.map(currencyAdjective).join(' و ');
}
