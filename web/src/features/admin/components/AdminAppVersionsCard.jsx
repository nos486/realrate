/**
 * AdminAppVersionsCard.jsx — The Android app's versions in use: users seen on each version in the
 * last 30 days, newest version first (who still has to update)
 */

import React from 'react';
import { Smartphone } from 'lucide-react';
import { faNum, faVersion } from '../utils/adminFormat.js';

export default function AdminAppVersionsCard({ versions = [] }) {
  const total = versions.reduce((sum, v) => sum + v.users, 0);
  return (
    <div className="portfolio-stat-card admin-app-versions">
      <div className="stat-header">
        <span className="stat-label">
          <Smartphone size={14} /> نسخه‌های اپ (۳۰ روز اخیر)
        </span>
      </div>
      {total === 0 ? (
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
    </div>
  );
}
