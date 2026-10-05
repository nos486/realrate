/**
 * AdminNewsPage.jsx — The news section's Telegram channels: add, pause or remove a channel, see
 * how each one did on the last run, and read them all now; and the model lab of «تحلیل روز»
 * (AdminNewsAnalysisLab.jsx)
 */

import React, { useEffect, useState } from 'react';
import { Newspaper, Plus, Trash2, RefreshCw, Save, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { Button, Input, AlertBanner, EmptyState } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getNewsChannels, saveNewsChannels, runNewsNow, runNewsAnalysisNow } from '../../news/newsApi.js';
import { newsTimeAgo } from '../../news/newsFormat.js';
import AdminNewsAnalysisLab from './AdminNewsAnalysisLab.jsx';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const cleanName = (s) => String(s || '').trim().replace(/^(https?:\/\/)?(www\.)?t\.me\/(s\/)?/i, '').replace(/^@/, '').split(/[/?#]/)[0].toLowerCase();

export default function AdminNewsPage() {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await getNewsChannels();
      setData(res);
      setChannels(res.channels || []);
      setError('');
    } catch (err) {
      setError(err?.message || 'خوانده نشد.');
    }
  };
  useEffect(() => {
    load();
  }, []);

  const dirty = JSON.stringify(channels) !== JSON.stringify(data?.channels || []);
  const status = data?.status;

  const add = () => {
    const username = cleanName(newName);
    if (!/^[a-z][a-z0-9_]{3,31}$/.test(username)) {
      toast.error('نام کانال معتبر نیست (مثل @khabari).');
      return;
    }
    if (channels.some((c) => c.username === username)) {
      toast.warning('این کانال در فهرست هست.');
      return;
    }
    setChannels([...channels, { username, enabled: true }]);
    setNewName('');
  };

  const save = async () => {
    setBusy('save');
    try {
      const res = await saveNewsChannels(channels);
      setData((d) => ({ ...d, channels: res.channels }));
      setChannels(res.channels);
      toast.success('فهرست کانال‌ها ذخیره شد.');
    } catch (err) {
      toast.error(err?.message || 'ذخیره نشد.');
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy('run');
    try {
      const res = await runNewsNow();
      setData((d) => ({ ...d, status: res.status }));
      const r = res.result || {};
      toast.success(`${fa(r.checked)} پست تازه، ${fa(r.candidates)} نامزد، ${fa(r.published)} خبر منتشر شد.`);
    } catch (err) {
      toast.error(err?.message || 'اجرا نشد.');
    } finally {
      setBusy(null);
    }
  };

  const analyze = async () => {
    setBusy('analysis');
    try {
      const res = await runNewsAnalysisNow();
      if (res.result?.updated) toast.success('تحلیل روز نوشته شد.');
      else toast.warning(res.result?.reason === 'no-news' ? 'امروز هنوز خبری نیست.' : `تحلیل نوشته نشد (${res.result?.reason || 'خطا'}).`);
    } catch (err) {
      toast.error(err?.message || 'اجرا نشد.');
    } finally {
      setBusy(null);
    }
  };

  if (error && !data) return <AlertBanner type="error" message={error} />;
  if (!data) return <div className="require-auth-loading"><div className="spinner-glow" /></div>;

  return (
    <div className="admin-news">
      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label"><Newspaper size={14} /> کانال‌های خبری</span>
          <span className="admin-news-actions">
            <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} loading={busy === 'analysis'} disabled={Boolean(busy) || !data.aiConfigured} onClick={analyze}>
              تحلیل الان
            </Button>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy === 'run'} disabled={Boolean(busy)} onClick={run}>
              خواندن الان
            </Button>
          </span>
        </div>
        <p className="admin-card-hint">
          هر دقیقه پست‌های تازه‌ی این کانال‌ها خوانده می‌شود؛ کلیدواژه‌ها پست‌های بی‌ربط را کنار می‌گذارند و
          هوش مصنوعی کلادفلر از بقیه فقط خبرهای مؤثر بر دلار، طلا، فلزات و اقتصاد را انتخاب و خلاصه می‌کند.
          کانالی که تازه اضافه شود، ۱۰ پست آخرش بررسی می‌شود. «تحلیل روز» با رسیدن خبر تازه، حداکثر هر ۳۰ دقیقه، دوباره نوشته می‌شود.
        </p>

        <div className="admin-news-ai">
          {data.aiConfigured ? (
            <span className="is-ok"><Sparkles size={14} /> هوش مصنوعی فعال است · {fa(status?.aiCallsToday)} از {fa(data.limits?.aiCallsPerDay)} درخواست امروز</span>
          ) : (
            <span className="is-warn"><AlertTriangle size={14} /> هوش مصنوعی (Workers AI) وصل نیست؛ فقط پست‌هایی با کلیدواژه‌های زیاد منتشر می‌شود.</span>
          )}
          {data.analysisModel && <small>مدل «تحلیل روز»: {data.analysisModel.label}</small>}
          {status?.aiError && data.aiConfigured && <small className="is-warn">آخرین خطای مدل: {status.aiError}</small>}
          {status?.at && <small>آخرین اجرا: {newsTimeAgo(status.at)} · {fa(status.published)} خبر</small>}
        </div>

        {channels.length === 0 ? (
          <EmptyState title="کانالی نیست" description="یک کانال اضافه کنید." />
        ) : (
          <ul className="admin-news-channels">
            {channels.map((c) => {
              const s = status?.channels?.[c.username];
              return (
                <li key={c.username} className={c.enabled ? '' : 'is-off'}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.enabled}
                    aria-label={`فعال بودن @${c.username}`}
                    className={`admin-switch ${c.enabled ? 'is-on' : ''}`}
                    onClick={() => setChannels(channels.map((x) => (x.username === c.username ? { ...x, enabled: !x.enabled } : x)))}
                  >
                    <span className="admin-switch-thumb" />
                  </button>
                  <span className="admin-news-channel">
                    <a href={`https://t.me/s/${c.username}`} target="_blank" rel="noopener noreferrer" dir="ltr">@{c.username}</a>
                    <small>
                      {!s ? 'هنوز خوانده نشده'
                        : s.ok ? <><CheckCircle2 size={12} className="is-ok" /> {s.title} · {fa(s.published)} خبر منتشرشده</>
                          : <><AlertTriangle size={12} className="is-warn" /> خوانده نشد: {s.error}</>}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="admin-news-remove"
                    aria-label={`حذف @${c.username}`}
                    onClick={() => setChannels(channels.filter((x) => x.username !== c.username))}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form className="admin-news-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input
            id="adminNewsChannel"
            placeholder="@channel یا t.me/channel"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            dir="ltr"
          />
          <Button type="submit" size="sm" variant="secondary" icon={<Plus size={14} />} disabled={channels.length >= (data.limits?.maxChannels || 20)}>
            افزودن
          </Button>
        </form>

        <div className="admin-news-save">
          <Button size="sm" icon={<Save size={14} />} loading={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={save}>
            ذخیره فهرست
          </Button>
          {dirty && <Button size="sm" variant="ghost" onClick={() => setChannels(data.channels || [])}>انصراف</Button>}
        </div>
      </div>

      <AdminNewsAnalysisLab
        aiConfigured={data.aiConfigured}
        current={data.analysisModel?.id}
        onChosen={(model) => setData((d) => ({ ...d, analysisModel: model }))}
      />
    </div>
  );
}
