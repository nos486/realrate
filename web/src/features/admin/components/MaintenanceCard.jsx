/**
 * MaintenanceCard.jsx — Maintenance ("under development") mode switch and its message
 *
 * While it is on only admins can sign in and use the site; everyone else sees the message on
 * the maintenance page. The switch saves at once; the message has its own save button.
 */

import React, { useState } from 'react';
import { Wrench, Save } from 'lucide-react';
import { Button, Input } from '../../../shared/ui/index.js';
import { AdminCard, AdminSwitch } from './AdminPage.jsx';

export default function MaintenanceCard({ settings, onSave }) {
  const enabled = Number(settings?.maintenance_mode) === 1;
  const savedMessage = settings?.maintenance_message || '';
  const [message, setMessage] = useState(savedMessage);
  const [busy, setBusy] = useState(null);

  // Follow the saved message when it changes elsewhere (first load, another save)
  const [lastSaved, setLastSaved] = useState(savedMessage);
  if (savedMessage !== lastSaved) {
    setLastSaved(savedMessage);
    setMessage(savedMessage);
  }

  const save = async (kind, patch) => {
    setBusy(kind);
    try {
      await onSave(patch);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminCard
      className={`admin-maintenance-card ${enabled ? 'is-on' : ''}`}
      icon={<Wrench size={18} />}
      title="حالت توسعه (تعمیر و نگهداری)"
      actions={
        <AdminSwitch
          checked={enabled}
          label="حالت توسعه"
          disabled={Boolean(busy) || !settings}
          onChange={(on) => save('toggle', { maintenance_mode: on, maintenance_message: message })}
        />
      }
    >
      <p className="admin-card-hint">
        {enabled
          ? 'فعال است: فقط مدیران وارد سایت می‌شوند و بقیه پیام زیر را می‌بینند.'
          : 'با فعال کردن، فقط مدیران می‌توانند وارد شوند و کار کنند؛ بقیه پیام زیر را می‌بینند.'}
      </p>
      <Input
        as="textarea"
        id="adminMaintenanceMessage"
        rows={2}
        label="پیام به کاربران"
        placeholder="سایت در حال به‌روزرسانی است و به‌زودی دوباره در دسترس خواهد بود."
        value={message}
        maxLength={500}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        icon={<Save size={14} />}
        loading={busy === 'message'}
        disabled={Boolean(busy) || message.trim() === savedMessage.trim()}
        onClick={() => save('message', { maintenance_message: message })}
      >
        ذخیره پیام
      </Button>
    </AdminCard>
  );
}
