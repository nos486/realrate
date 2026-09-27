/**
 * AdminPanel.jsx — Admin panel, laid out like every other feature page
 *
 * - Header with a refresh action (FeaturePageHeader)
 * - Main column: the users list (search, quick filters, sortable dates, pagination); each user
 *   opens a detail view with the account actions (block, sign out everywhere, resend
 *   verification)
 * - Sidebar: headline numbers, the 30-day growth chart, maintenance mode and site settings
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Ban } from 'lucide-react';
import { useAuth } from '../../auth/index.js';
import { Button, EmptyState, FeaturePageHeader, SplitPageLayout } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getAdminStats, saveAdminSettings } from '../api/adminApi.js';
import { getPriceBook } from '../../market/api/marketApi.js';
import { useAdminUsers } from '../hooks/useAdminUsers.js';
import AdminStatsCards from './AdminStatsCards.jsx';
import AdminGrowthChart from './AdminGrowthChart.jsx';
import AdminUsersCard from './AdminUsersCard.jsx';
import AdminUserDetailModal from './AdminUserDetailModal.jsx';
import MaintenanceCard from './MaintenanceCard.jsx';
import SiteSettingsCard from './SiteSettingsCard.jsx';

const HEADER = {
  icon: <ShieldCheck size={24} />,
  title: 'پنل مدیریت',
  subtitle: 'کاربران، آمار و تنظیمات سایت',
};

export default function AdminPanel() {
  const { user, loading, setMaintenance } = useAuth();
  const { toast } = useFeedback();
  const isAdmin = user?.role === 'admin';

  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [growthToken, setGrowthToken] = useState(0);
  const [detailUser, setDetailUser] = useState(null);

  const list = useAdminUsers({
    enabled: isAdmin,
    onError: (err) => toast.error(`دریافت لیست کاربران ناموفق بود: ${err.message}`),
  });
  const reloadList = list.reload;

  const loadStats = useCallback(() => {
    getAdminStats()
      .then((data) => setStats(data))
      .catch((err) => toast.error(`دریافت آمار ناموفق بود: ${err.message}`));
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    loadStats();
    getPriceBook()
      .then((data) => setSettings(data?.globalSettings || {}))
      .catch(() => setSettings({}));
  }, [isAdmin, loadStats]);

  const refreshAll = () => {
    reloadList();
    loadStats();
    setGrowthToken((n) => n + 1);
  };

  // Each settings card saves only its own fields
  const saveSettings = async (patch) => {
    try {
      const res = await saveAdminSettings(patch);
      setSettings(res.settings || { ...settings, ...patch });
      if (patch.maintenance_mode !== undefined || patch.maintenance_message !== undefined) {
        const saved = res.settings || patch;
        setMaintenance({ enabled: Number(saved.maintenance_mode) === 1 || saved.maintenance_mode === true, message: saved.maintenance_message || '' });
      }
      toast.success(
        patch.maintenance_mode === true
          ? 'حالت توسعه فعال شد؛ فقط مدیران به سایت دسترسی دارند.'
          : patch.maintenance_mode === false
            ? 'حالت توسعه غیرفعال شد و سایت برای همه باز است.'
            : res.message || 'تنظیمات ذخیره شد.',
      );
    } catch (err) {
      toast.error(err.message || 'ذخیره تنظیمات ناموفق بود.');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="require-auth-loading" role="status" aria-label="در حال بررسی دسترسی">
        <div className="spinner-glow" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <EmptyState
          icon={<Ban size={44} strokeWidth={1.5} />}
          title="دسترسی مدیریت ندارید"
          description={`حساب ${user?.email || ''} به عنوان مدیر سیستم ثبت نشده است.`}
        />
      </div>
    );
  }

  return (
    <div className="incomes-page-container admin-page">
      <FeaturePageHeader
        {...HEADER}
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refreshAll} loading={list.loading}>
            به‌روزرسانی
          </Button>
        }
      />

      <SplitPageLayout
        sidebar={
          <div className="incomes-report-grid">
            <AdminStatsCards stats={stats} />
            <AdminGrowthChart reloadToken={growthToken} />
            <MaintenanceCard settings={settings} onSave={saveSettings} />
            <SiteSettingsCard settings={settings} onSave={saveSettings} />
          </div>
        }
      >
        <AdminUsersCard list={list} filterCounts={stats?.filters} onOpenUser={setDetailUser} />
      </SplitPageLayout>

      {detailUser && (
        <AdminUserDetailModal
          key={detailUser.id}
          userId={detailUser.id}
          fallback={detailUser}
          onClose={() => setDetailUser(null)}
          onChanged={() => {
            reloadList();
            loadStats();
          }}
        />
      )}
    </div>
  );
}
