/**
 * expenseCategories.js — Icons and colors of the everyday expense categories
 * The keys and labels are DAILY_EXPENSE_CATEGORIES in utils/expenseDocument.js.
 */

import {
  ShoppingBasket, UtensilsCrossed, Car, Receipt, House, ShoppingBag,
  HeartPulse, GraduationCap, Plane, Wifi, Gift, Landmark, TrendingUp, CircleEllipsis,
} from 'lucide-react';
import { DAILY_EXPENSE_CATEGORIES } from '../../../utils/expenseDocument.js';

const DISPLAY = {
  groceries: { Icon: ShoppingBasket, color: '#10b981' },
  dining: { Icon: UtensilsCrossed, color: '#f59e0b' },
  transport: { Icon: Car, color: '#38bdf8' },
  bills: { Icon: Receipt, color: '#a78bfa' },
  housing: { Icon: House, color: '#fb7185' },
  shopping: { Icon: ShoppingBag, color: '#f472b6' },
  health: { Icon: HeartPulse, color: '#ef4444' },
  education: { Icon: GraduationCap, color: '#22d3ee' },
  entertainment: { Icon: Plane, color: '#facc15' },
  subscriptions: { Icon: Wifi, color: '#60a5fa' },
  gifts: { Icon: Gift, color: '#e879f9' },
  installments: { Icon: Landmark, color: '#fb923c' },
  investment: { Icon: TrendingUp, color: '#34d399' },
  other: { Icon: CircleEllipsis, color: '#94a3b8' },
};

export const EXPENSE_CATEGORIES = DAILY_EXPENSE_CATEGORIES.map((c) => ({ ...c, ...DISPLAY[c.value] }));

const BY_VALUE = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c]));

/** Display data of a category key, "other" for none or an unknown one */
export function getExpenseCategory(value) {
  return BY_VALUE[value] || BY_VALUE.other;
}
