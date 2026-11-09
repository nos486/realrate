/**
 * AiModelsCard.jsx — Which AI model does what: the engine that hears every voice feature (the SMS
 * microphone, the «+» assistant, dictation) and the model of the news section (screening, summarizing
 * and the daily analysis)
 *
 * Both lists come from the server (config/voiceEngines.js, config/aiModels.js). The choice is stored
 * on the server and applies to everyone at once.
 */

import React, { useEffect, useState } from 'react';
import { Save, Cpu } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getAiSettings, saveAiSettings } from '../api/adminApi.js';
import { AdminCard } from './AdminPage.jsx';

export default function AiModelsCard() {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ voiceEngine: '', newsModel: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAiSettings()
      .then((res) => { setData(res); setForm({ voiceEngine: res.voiceEngine, newsModel: res.newsModel }); })
      .catch((err) => toast.error(err.message || 'خواندن تنظیمات مدل‌ها ناموفق بود.'));
  }, [toast]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const dirty = data && (form.voiceEngine !== data.voiceEngine || form.newsModel !== data.newsModel);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveAiSettings(form);
      setData(res);
      toast.success(res.message || 'ذخیره شد.');
    } catch (err) {
      toast.error(err.message || 'ذخیره نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard as="form" icon={<Cpu size={18} />} title="مدل‌های هوش مصنوعی" subtitle="موتور تشخیص صدا و مدل اخبار؛ برای همه‌ی کاربران اعمال می‌شود" onSubmit={handleSubmit}>
      <div className="ui-input-group">
        <label htmlFor="aiVoiceEngine" className="ui-input-label">موتور تشخیص صدا (پیامک، دکمه‌ی «+»، نوشتن با صدا)</label>
        <select id="aiVoiceEngine" className="ui-input-control" value={form.voiceEngine} onChange={set('voiceEngine')} disabled={!data}>
          {(data?.voiceEngines || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="ui-input-group">
        <label htmlFor="aiNewsModel" className="ui-input-label">مدل اخبار (فیلتر و خلاصه‌ی خبرها و تحلیل روزانه)</label>
        <select id="aiNewsModel" className="ui-input-control" value={form.newsModel} onChange={set('newsModel')} disabled={!data}>
          {(data?.newsModels || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <Button type="submit" size="sm" icon={<Save size={14} />} loading={saving} disabled={!dirty}>
        ذخیره مدل‌ها
      </Button>
    </AdminCard>
  );
}
