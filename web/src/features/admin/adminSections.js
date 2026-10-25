/**
 * adminSections.js — The admin area's sections, in their groups: the one table the sidebar
 * (pages/AdminApp.jsx) and every page's header (AdminPage.jsx) read, so a section's name, icon,
 * address and description are written once. A new section is a row here and a route in AdminApp.
 */

import {
  LayoutDashboard, Users, UserCog, Radio, History, Newspaper, Send, MessageCircle, Settings,
} from 'lucide-react';

/**
 * @typedef {{ key: string, path: string, label: string, icon: import('react').ComponentType<any>,
 *   title: string, subtitle: string, end?: boolean }} AdminSection
 * @type {Array<{ key: string, label: string, sections: AdminSection[] }>}
 */
export const ADMIN_GROUPS = [
  {
    key: 'overview',
    label: 'نمای کلی',
    sections: [
      { key: 'dashboard', path: '/admin', end: true, label: 'داشبورد', icon: LayoutDashboard, title: 'داشبورد', subtitle: 'آمار کاربران، روند ۳۰ روز و نسخه‌های اپ' },
    ],
  },
  {
    key: 'people',
    label: 'کاربران',
    sections: [
      { key: 'users', path: '/admin/users', label: 'کاربران', icon: Users, title: 'کاربران', subtitle: 'جستجو، فیلتر و مدیریت حساب‌ها؛ تغییر گروهی' },
      { key: 'groups', path: '/admin/groups', label: 'گروه‌ها و دسترسی‌ها', icon: UserCog, title: 'گروه‌ها و دسترسی‌ها', subtitle: 'درخواست‌ها، گروه‌ها و اعضا، دسترسی به ویژگی‌ها و سهمیه‌ها' },
    ],
  },
  {
    key: 'market',
    label: 'بازار و قیمت',
    sections: [
      { key: 'sources', path: '/admin/sources', label: 'سورس‌های قیمت', icon: Radio, title: 'سورس‌های قیمت', subtitle: 'وضعیت، زمان‌بندی و تست هر سورس؛ روشن/خاموش و سورس مرجع' },
      { key: 'history', path: '/admin/history', label: 'تاریخچه‌ی قیمت', icon: History, title: 'تاریخچه‌ی قیمت', subtitle: 'بارگذاری سابقه‌ی روزانه از tgju و مدیریت تاریخچه‌ی ذخیره‌شده' },
    ],
  },
  {
    key: 'content',
    label: 'محتوا و ربات‌ها',
    sections: [
      { key: 'news', path: '/admin/news', label: 'اخبار', icon: Newspaper, title: 'اخبار', subtitle: 'گزارش، کانال‌های تلگرام و خبرگزاری‌های بین‌المللی' },
      { key: 'bot', path: '/admin/bot', label: 'ربات تلگرام', icon: Send, title: 'ربات تلگرام', subtitle: 'اتصال، کانال، حساب ادمین و خبرهایی که فرستاده می‌شود' },
      { key: 'rubika', path: '/admin/rubika', label: 'ربات روبیکا', icon: MessageCircle, title: 'ربات روبیکا', subtitle: 'اتصال، کانال، حساب ادمین و خبرهایی که فرستاده می‌شود' },
    ],
  },
  {
    key: 'system',
    label: 'سیستم',
    sections: [
      { key: 'settings', path: '/admin/settings', label: 'تنظیمات سایت', icon: Settings, title: 'تنظیمات سایت', subtitle: 'حالت توسعه، اطلاعیه‌ی بالای سایت و حساب دمو' },
    ],
  },
];

/** Every section by its key */
export const ADMIN_SECTIONS = Object.fromEntries(ADMIN_GROUPS.flatMap((g) => g.sections.map((s) => [s.key, s])));
