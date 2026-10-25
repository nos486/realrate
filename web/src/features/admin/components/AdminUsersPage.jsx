/**
 * AdminUsersPage.jsx — The users of the site (/admin/users): the list (search, quick filters with
 * their counts, sortable dates, pagination, ticking users to change their groups at once); each
 * user opens a detail view with the account actions (block, sign out everywhere, resend
 * verification, groups)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getAdminStats } from '../api/adminApi.js';
import { useAdminUsers } from '../hooks/useAdminUsers.js';
import AdminPage from './AdminPage.jsx';
import AdminUsersCard from './AdminUsersCard.jsx';
import AdminUserDetailModal from './AdminUserDetailModal.jsx';

export default function AdminUsersPage() {
  const { toast } = useFeedback();
  const [stats, setStats] = useState(null);
  const [detailUser, setDetailUser] = useState(null);

  const list = useAdminUsers({
    enabled: true,
    onError: (err) => toast.error(`دریافت لیست کاربران ناموفق بود: ${err.message}`),
  });
  const reloadList = list.reload;

  // The quick filters' counts
  const loadStats = useCallback(() => {
    getAdminStats()
      .then(setStats)
      .catch((err) => toast.error(`دریافت آمار ناموفق بود: ${err.message}`));
  }, [toast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = () => {
    reloadList();
    loadStats();
  };

  return (
    <AdminPage
      section="users"
      actions={<Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refresh} loading={list.loading}>به‌روزرسانی</Button>}
    >
      <AdminUsersCard list={list} filterCounts={stats?.filters} onOpenUser={setDetailUser} />

      {detailUser && (
        <AdminUserDetailModal
          key={detailUser.id}
          userId={detailUser.id}
          fallback={detailUser}
          onClose={() => setDetailUser(null)}
          onChanged={refresh}
        />
      )}
    </AdminPage>
  );
}
