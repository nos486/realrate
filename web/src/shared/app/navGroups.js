/**
 * navGroups.js — The app's sections gathered into a few groups
 *
 *   خانه · بازار · پول روزانه · سرمایه و اهداف · تعهدات · گزارش‌ها      (+ حساب کاربری: a menu)
 *
 * One table for every navigation surface: the website's group tabs with their dropdowns (GroupTabs), the
 * account menu under the avatar (Header), and the app frame's bottom bar and grouped «بیشتر» sheet
 * (AppShell). A section keeps its own URL (/expenses, /loans, ...); its group is looked up from
 * its tab. The sections a user has come from the page's `navItems`, so a group with none of them
 * is not shown, and a group with one section opens it right away (a group with several asks which:
 * a dropdown on the website, a sheet in the app frame).
 */

import { Home, TrendingUp, Wallet, Briefcase, CalendarClock, ChartColumn, UserRound } from 'lucide-react';
import { msg } from '../../utils/i18n.js';

/**
 * The groups, in order; `tabs` are MainPage's tab values ('market' is the home dashboard)
 * `short` is the label on the bottom bar; `menu` groups (the account) are not a tab of their own:
 * the avatar's menu on the website, a part of «بیشتر» in the app frame.
 */
export const NAV_GROUPS = [
  { key: 'home', label: msg('خانه'), Icon: Home, tabs: ['market'] },
  { key: 'market', label: msg('بازار'), Icon: TrendingUp, tabs: ['rates', 'explore', 'news'] },
  { key: 'money', label: msg('پول روزانه'), short: msg('پول'), Icon: Wallet, tabs: ['expenses', 'incomes', 'accounts', 'projects', 'sms'] },
  { key: 'wealth', label: msg('سرمایه و اهداف'), short: msg('سرمایه'), Icon: Briefcase, tabs: ['portfolio', 'goals'] },
  { key: 'plans', label: msg('تعهدات'), Icon: CalendarClock, tabs: ['loans', 'cheques', 'subscriptions'] },
  { key: 'reports', label: msg('گزارش‌ها'), Icon: ChartColumn, tabs: ['reports'] },
  { key: 'account', label: msg('حساب کاربری'), Icon: UserRound, tabs: ['settings', 'app-settings', 'pro', 'admin'], menu: true },
];

/**
 * How a section shows in a bottom-bar group's list (the app frame, the same cards as «ثبت سریع»):
 * a short hint under its name and the color of its icon
 */
export const NAV_SECTION_CARDS = {
  expenses: { hint: msg('خرید، قبض، بودجه…'), tone: 'rose' },
  incomes: { hint: msg('حقوق، فروش، سود…'), tone: 'green' },
  accounts: { hint: msg('بانک، نقد، انتقال‌ها'), tone: 'blue' },
  projects: { hint: msg('هزینه‌های هر پروژه'), tone: 'amber' },
  sms: { hint: msg('پیامک‌های منتظر ثبت'), tone: 'blue' },
  portfolio: { hint: msg('طلا، سکه، ارز…'), tone: 'amber' },
  goals: { hint: msg('پس‌انداز برای هدف'), tone: 'green' },
  rates: { hint: msg('قیمت‌ها و حباب امروز'), tone: 'blue' },
  explore: { hint: msg('جست‌وجوی هر دارایی'), tone: 'amber' },
  news: { hint: msg('خبرها و تحلیل روز'), tone: 'green' },
  loans: { hint: msg('اقساط و سررسیدها'), tone: 'rose' },
  cheques: { hint: msg('چک‌های دریافتی و صادره'), tone: 'amber' },
  subscriptions: { hint: msg('تمدیدهای ماهانه'), tone: 'blue' },
};

/** The groups the app frame's bottom bar prefers, before falling back to the next ones */
export const BOTTOM_NAV_GROUPS = ['home', 'money', 'wealth'];

/**
 * The groups that have at least one of the user's sections, each with its `items` (the
 * `navItems` entries, in the group's order); a section in no group is left out
 * @param {Array<{ value: string, label: string, icon?: any }>} navItems
 * @returns {Array<typeof NAV_GROUPS[number] & { items: typeof navItems }>}
 */
export function buildNavGroups(navItems = []) {
  const byValue = new Map(navItems.map((item) => [item.value, item]));
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.tabs.map((tab) => byValue.get(tab)).filter(Boolean) }))
    .filter((group) => group.items.length > 0);
}

/**
 * The group a tab belongs to
 * @param {ReturnType<typeof buildNavGroups>} groups
 * @param {string} tab
 */
export function groupOfTab(groups, tab) {
  return groups.find((group) => group.tabs.includes(tab)) || null;
}
