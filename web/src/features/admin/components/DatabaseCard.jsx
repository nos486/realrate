/**
 * DatabaseCard.jsx — The app's database (Postgres), and deleting the KV keys the app no longer
 * uses (old price copies, backups, sync stamps and caches)
 */

import React, { useState } from 'react';
import { Database, Trash2 } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { cleanupLegacyKv } from '../api/adminApi.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

export default function DatabaseCard() {
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const cleanupKv = async () => {
    const ok = await confirm({
      title: 'پاک‌سازی KV',
      message: 'کلیدهای قدیمی KV که برنامه دیگر از آن‌ها استفاده نمی‌کند (کپی‌های قدیمی قیمت‌ها و کش‌های منسوخ) حذف می‌شوند.',
      confirmText: 'حذف',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await cleanupLegacyKv();
      toast.success(res.deletedCount ? `${fa(res.deletedCount)} کلید قدیمی حذف شد.` : 'کلید قدیمی‌ای نمانده است.');
    } catch (err) {
      toast.error(err.message || 'پاک‌سازی ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portfolio-stat-card admin-db-card">
      <div className="stat-header">
        <span className="stat-label">
          <Database size={14} /> پایگاه داده
        </span>
        <span className="admin-db-badge is-pg">Postgres</span>
      </div>
      <p className="admin-card-hint">داده‌های برنامه و تاریخچه قیمت‌ها در Postgres است.</p>
      <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} loading={busy} disabled={busy} onClick={cleanupKv}>
        پاک‌سازی کلیدهای قدیمی KV
      </Button>
    </div>
  );
}
