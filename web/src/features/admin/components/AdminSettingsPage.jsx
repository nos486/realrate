/**
 * AdminSettingsPage.jsx — The site's own settings (/admin/settings): maintenance mode and its
 * message, the announcement at the top of the site, and the demo account
 *
 * The settings are read from the price book's globalSettings; each card saves only its own fields.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { saveAdminSettings } from '../api/adminApi.js';
import { getPriceBook } from '../../market/api/marketApi.js';
import { AdminDemoCard } from '../../demo/index.js';
import AdminPage from './AdminPage.jsx';
import MaintenanceCard from './MaintenanceCard.jsx';
import SiteSettingsCard from './SiteSettingsCard.jsx';

export default function AdminSettingsPage() {
  const { setMaintenance } = useAuth();
  const { toast } = useFeedback();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getPriceBook()
      .then((data) => setSettings(data?.globalSettings || {}))
      .catch(() => setSettings({}));
  }, []);

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

  return (
    <AdminPage section="settings" loading={!settings}>
      <div className="admin-columns">
        <div className="admin-stack">
          <MaintenanceCard settings={settings} onSave={saveSettings} />
          <SiteSettingsCard settings={settings} onSave={saveSettings} />
        </div>
        <AdminDemoCard />
      </div>
    </AdminPage>
  );
}
