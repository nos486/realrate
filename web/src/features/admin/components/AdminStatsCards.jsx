/**
 * AdminStatsCards.jsx — Headline numbers of the admin panel
 */

import React from 'react';
import { Users, Activity, UserPlus, Share2 } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { faNum } from '../utils/adminFormat.js';

export default function AdminStatsCards({ stats }) {
  const value = (n) => (stats ? faNum(n) : '—');
  return (
    <div className="admin-stats-grid">
      <MiniCard icon={<Users size={14} />} title="کاربران" value={value(stats?.registeredUsers)} color="blue" />
      <MiniCard icon={<Activity size={14} />} title="فعال امروز" value={value(stats?.activeToday)} color="green" />
      <MiniCard icon={<UserPlus size={14} />} title="ثبت‌نام این هفته" value={value(stats?.filters?.new)} color="gold" />
      <MiniCard icon={<Share2 size={14} />} title="پورتفوی عمومی" value={value(stats?.publicPortfolios)} />
    </div>
  );
}
