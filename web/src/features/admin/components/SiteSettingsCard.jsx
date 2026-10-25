/**
 * SiteSettingsCard.jsx — The announcement shown at the top of the site
 *
 * (The coins' target bubbles are no setting: each is its bubble's mean over the last year, from
 * the price history — api/src/domain/priceAverages.js.)
 */

import React, { useState } from 'react';
import { Save, Megaphone } from 'lucide-react';
import { Button, Input } from '../../../shared/ui/index.js';
import { AdminCard } from './AdminPage.jsx';

const fromSettings = (s) => ({
  announcement: s?.announcement || '',
});

export default function SiteSettingsCard({ settings, onSave }) {
  const [form, setForm] = useState(() => fromSettings(settings));
  const [saving, setSaving] = useState(false);

  // Take the saved values when settings arrive or change elsewhere
  const [source, setSource] = useState(settings);
  if (settings !== source) {
    setSource(settings);
    setForm(fromSettings(settings));
  }

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ announcement: form.announcement });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard as="form" className="admin-settings-card" icon={<Megaphone size={18} />} title="اطلاعیه‌ی سایت" subtitle="نواری بالای همه‌ی صفحه‌ها؛ خالی = نمایش داده نمی‌شود" onSubmit={handleSubmit}>

      <Input
        as="textarea"
        id="adminAnnouncement"
        rows={2}
        label="متن اطلاعیه"
        placeholder="متن اطلاعیه..."
        value={form.announcement}
        maxLength={500}
        onChange={set('announcement')}
      />

      <Button type="submit" size="sm" icon={<Save size={14} />} loading={saving} disabled={!settings}>
        ذخیره اطلاعیه
      </Button>
    </AdminCard>
  );
}
