/**
 * AdminDashboardPage.jsx — The admin area's first page (/admin, «داشبورد»): the headline numbers
 * (with the Android app's users), the 30-day growth chart and the app's versions in use
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getAdminStats } from '../api/adminApi.js';
import AdminPage from './AdminPage.jsx';
import AdminStatsCards from './AdminStatsCards.jsx';
import AdminGrowthChart from './AdminGrowthChart.jsx';
import AdminAppVersionsCard from './AdminAppVersionsCard.jsx';

export default function AdminDashboardPage() {
  const { toast } = useFeedback();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [growthToken, setGrowthToken] = useState(0);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await getAdminStats());
    } catch (err) {
      toast.error(`دریافت آمار ناموفق بود: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = () => {
    loadStats();
    setGrowthToken((n) => n + 1);
  };

  return (
    <AdminPage
      section="dashboard"
      actions={<Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refresh} loading={loading}>به‌روزرسانی</Button>}
    >
      <AdminStatsCards stats={stats} />
      <div className="admin-columns is-wide-main">
        <AdminGrowthChart reloadToken={growthToken} />
        <AdminAppVersionsCard versions={stats?.appVersions || []} loading={!stats} />
      </div>
    </AdminPage>
  );
}
