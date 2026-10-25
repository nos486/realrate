/**
 * AdminAppVersionsCard.jsx — The Android app's versions in use: users seen on each version in the
 * last 30 days, newest version first (who still has to update)
 */

import React from 'react';
import { Smartphone } from 'lucide-react';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { faNum, faVersion } from '../utils/adminFormat.js';
import { AdminCard } from './AdminPage.jsx';

/** @param {{ versions?: Array<{ version: string|null, users: number }>, loading?: boolean }} props */
export default function AdminAppVersionsCard({ versions = [], loading = false }) {
  const total = versions.reduce((sum, v) => sum + v.users, 0);
  return (
    <AdminCard className="admin-app-versions" icon={<Smartphone size={18} />} title="نسخه‌های اپ" subtitle="کاربران هر نسخه در ۳۰ روز اخیر">
      {loading ? (
        <SkeletonRows rows={3} columns={2} label="در حال دریافت نسخه‌ها" />
      ) : total === 0 ? (
        <p className="admin-detail-note">هنوز کسی با اپ اندروید وارد نشده است.</p>
      ) : (
        <ul className="admin-app-version-list">
          {versions.map((v, i) => {
            const pct = Math.round((v.users / total) * 100);
            return (
              <li key={v.version || 'unknown'}>
                <span className="admin-app-version-name">
                  <bdi>{faVersion(v.version)}</bdi>
                  {i === 0 && v.version && <small className="admin-chip is-green">آخرین</small>}
                </span>
                <span className="admin-app-version-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="admin-app-version-count">
                  {faNum(v.users)} <small>({faNum(pct)}٪)</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}
