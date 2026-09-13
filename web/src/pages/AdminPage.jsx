import React from 'react';
import AppLayout from '../shared/ui/AppLayout.jsx';
import { AdminPanel } from '../features/admin/index.js';

/**
 * AdminPage — Thin page wrapper around features/admin/AdminPanel
 */
export default function AdminPage({ embedded = false }) {
  if (embedded) {
    return <AdminPanel />;
  }
  return (
    <AppLayout activeTab="admin">
      <AdminPanel />
    </AppLayout>
  );
}
