/**
 * SiteSettingsCard.jsx — Coin bubble targets and the announcement shown at the top of the site
 */

import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Input } from '../../../shared/ui/index.js';

const fromSettings = (s) => ({
  bubble_pct_full: s?.bubble_pct_full ?? 15,
  bubble_pct_half: s?.bubble_pct_half ?? 20,
  bubble_pct_quarter: s?.bubble_pct_quarter ?? 25,
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
      await onSave({
        bubble_pct_full: parseFloat(form.bubble_pct_full),
        bubble_pct_half: parseFloat(form.bubble_pct_half),
        bubble_pct_quarter: parseFloat(form.bubble_pct_quarter),
        announcement: form.announcement,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="portfolio-stat-card admin-settings-card" onSubmit={handleSubmit}>
      <div className="stat-header">
        <span className="stat-label">تنظیمات سایت</span>
      </div>

      <div className="admin-settings-group">
        <span className="admin-settings-group-title">حباب مصوب سکه‌ها (٪)</span>
        <div className="admin-settings-grid">
          <Input id="adminBubbleFull" type="number" step="0.5" label="تمام" value={form.bubble_pct_full} onChange={set('bubble_pct_full')} />
          <Input id="adminBubbleHalf" type="number" step="0.5" label="نیم" value={form.bubble_pct_half} onChange={set('bubble_pct_half')} />
          <Input id="adminBubbleQuarter" type="number" step="0.5" label="ربع" value={form.bubble_pct_quarter} onChange={set('bubble_pct_quarter')} />
        </div>
      </div>

      <Input
        as="textarea"
        id="adminAnnouncement"
        rows={2}
        label="اطلاعیه بالای سایت (خالی = نمایش داده نمی‌شود)"
        placeholder="متن اطلاعیه..."
        value={form.announcement}
        maxLength={500}
        onChange={set('announcement')}
      />

      <Button type="submit" size="sm" icon={<Save size={14} />} loading={saving} disabled={!settings}>
        ذخیره تنظیمات
      </Button>
    </form>
  );
}
