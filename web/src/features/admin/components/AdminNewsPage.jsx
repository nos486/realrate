/**
 * AdminNewsPage.jsx — The news section in the admin panel (/admin/news), in three tabs; «خواندن الان»
 * (read every channel and feed now) and «تحلیل الان» (write «تحلیل روز» now) are in the header:
 *  - «گزارش»: the AI's state (on, today's calls, the models, the last «تحلیل روز»), today's totals
 *    (posts checked, not market news, repeats, sent to the model, rejected by it, published), the
 *    last runs one per row, and the last published news
 *  - «کانال‌های تلگرام»: add, pause or remove a channel, see how each one did on the last run
 *  - «خبرگزاری‌های بین‌المللی»: the news feeds (RSS/Atom, English): add, pause or remove a feed,
 *    see how each one did on the last run
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { Newspaper, Plus, Trash2, RefreshCw, Save, CheckCircle2, AlertTriangle, Sparkles, BarChart3, Globe, Bot } from 'lucide-react';
import { Button, Input, EmptyState } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getNewsChannels, saveNewsChannels, saveNewsFeeds, runNewsNow, runNewsAnalysisNow } from '../../news/newsApi.js';
import { newsTimeAgo, newsClock, NEWS_CATEGORIES } from '../../news/newsFormat.js';
import AdminPage, { AdminCard, AdminSwitch, AdminTabs } from './AdminPage.jsx';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());
const MODEL_ERRORS = {
  'bad-answer': 'جواب قالب درستی نداشت (JSON)',
  'foreign-text': 'متن جواب کلمه‌ی غیرفارسی داشت',
};
const modelError = (error) => MODEL_ERRORS[error] || error || 'خطای نامعلوم';
/** Today's totals, in the order a post goes through */
const TOTALS = [
  { key: 'checked', label: 'پست بررسی‌شده' },
  { key: 'notMarket', label: 'غیربازاری یا نامناسب' },
  { key: 'duplicates', label: 'تکراری' },
  { key: 'sent', label: 'فرستاده به مدل' },
  { key: 'rejected', label: 'رد مدل' },
  { key: 'published', label: 'منتشرشده', tone: 'is-ok' },
];

/** «گزارش اخبار»: today's totals, the last runs, the last published news */
function NewsReport({ status, latest, model, dayBudget }) {
  const today = status?.today;
  const runs = status?.runs || [];
  return (
    <AdminCard
      className="admin-news-report"
      icon={<BarChart3 size={18} />}
      title="گزارش اخبار"
      actions={status?.at && <small className="admin-news-muted">آخرین اجرا {newsTimeAgo(status.at)}</small>}
    >

      <div className="admin-news-totals" aria-label="امروز">
        {TOTALS.map((t) => (
          <div key={t.key} className={t.tone || ''}>
            <strong>{fa(today?.[t.key])}</strong>
            <small>{t.label}</small>
          </div>
        ))}
        <div className={today?.errors ? 'is-warn' : ''}>
          <strong>{fa(today?.errors)}</strong>
          <small>خطای مدل</small>
        </div>
        <div>
          <strong>{fa(today?.aiCalls)}</strong>
          <small>درخواست به {model}</small>
        </div>
      </div>
      {status?.budgetUsedUp && (
        <p className="admin-news-error">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            <strong>سهمیه‌ی امروز مدل ({fa(dayBudget)} درخواست) تمام شده است.</strong>
            <small>{fa(status.run?.waiting)} پست در صف منتظر است و با شروع روز بعد (تهران) بررسی می‌شود؛ پست‌های قدیمی‌تر از ۶ ساعت از صف حذف می‌شوند.</small>
          </span>
        </p>
      )}
      {status?.aiError && (
        <p className="admin-news-error">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            <strong>خطای مدل {status.aiModel || model} در آخرین اجرا:</strong> <bdi dir="ltr">{modelError(status.aiError)}</bdi>
            <small>مدل دیگری امتحان نشد و خبری منتشر نشد؛ همان پست‌ها در اجرای بعدی دوباره بررسی می‌شوند.</small>
          </span>
        </p>
      )}
      <p className="admin-card-hint">آمار امروز (از ساعت ۰۰:۰۰ تهران). هر پست یک بار شمرده می‌شود؛ پستی که منتظر اجرای بعد مانده، وقتی تکلیفش روشن شود.</p>

      {runs.length > 0 && (
        <div className="admin-news-table-wrap">
          <table className="admin-news-table">
            <caption>آخرین اجراها</caption>
            <thead>
              <tr>
                <th scope="col">زمان</th>
                <th scope="col">بررسی</th>
                <th scope="col">غیربازاری</th>
                <th scope="col">تکراری</th>
                <th scope="col">به مدل</th>
                <th scope="col">رد</th>
                <th scope="col">منتشر</th>
                <th scope="col">منتظر</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.at} className={r.error ? 'is-warn' : ''} title={r.error ? `خطای مدل: ${modelError(r.error)}` : undefined}>
                  <td>{newsClock(r.at)}</td>
                  <td>{fa(r.checked)}</td>
                  <td>{fa(r.notMarket)}</td>
                  <td>{fa(r.duplicates)}</td>
                  <td>{fa(r.sent)}</td>
                  <td>{fa(r.rejected)}</td>
                  <td className="is-ok">{fa(r.published)}</td>
                  <td>{r.waiting ? fa(r.waiting) : '—'}{r.error && <AlertTriangle size={12} className="is-warn" aria-label="خطای مدل" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {latest?.length > 0 && (
        <div className="admin-news-latest">
          <h3>آخرین خبرهای منتشرشده</h3>
          <ul>
            {latest.map((n) => (
              <li key={n.id}>
                <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
                <small>
                  {n.importance >= 3 && <span className="admin-news-hot">مهم</span>}
                  {NEWS_CATEGORIES[n.category] || 'اقتصاد'} · <bdi>{n.channelTitle || `@${n.channel}`}</bdi> · {newsTimeAgo(n.publishedAt)}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminCard>
  );
}

/** The AI the news goes through: on or not, today's calls, the models, the last «تحلیل روز» */
function NewsAiCard({ data, status }) {
  return (
    <AdminCard icon={<Bot size={18} />} title="هوش مصنوعی">
      <div className="admin-news-ai">
        {data.aiConfigured ? (
          <span className="is-ok"><Sparkles size={14} /> هوش مصنوعی فعال است · {fa(status?.aiCallsToday)} از {fa(data.limits?.aiCallsPerDay)} درخواست امروز</span>
        ) : (
          <span className="is-warn"><AlertTriangle size={14} /> هوش مصنوعی (Workers AI) وصل نیست؛ بدون آن هیچ خبری منتشر نمی‌شود.</span>
        )}
        <small>مدل بررسی خبرها و «تحلیل روز»: {data.model}{data.analysisModel !== data.model ? ` / ${data.analysisModel}` : ''}</small>
        {data.analysisStatus && (data.analysisStatus.ok ? (
          <small><CheckCircle2 size={12} className="is-ok" /> آخرین تحلیل روز {newsTimeAgo(data.analysisStatus.at)} بدون خطا نوشته شد.</small>
        ) : (
          <small className="is-warn">
            <AlertTriangle size={12} /> تحلیل روز {newsTimeAgo(data.analysisStatus.at)}: مدل خطا داد ({modelError(data.analysisStatus.error)}) — مدل دیگری امتحان نشد و تحلیل قبلی مانده است.
          </small>
        ))}
      </div>
      <p className="admin-card-hint">
        هر دقیقه پست‌های تازه‌ی کانال‌ها و خبرگزاری‌ها خوانده می‌شود؛ کلیدواژه‌ها پست‌های بی‌ربط را کنار می‌گذارند و
        هوش مصنوعی کلادفلر از بقیه فقط خبرهای مؤثر بر دلار، طلا، فلزات و اقتصاد را انتخاب و خلاصه می‌کند.
        «تحلیل روز» با رسیدن خبر تازه، حداکثر هر ۳۰ دقیقه، دوباره نوشته می‌شود.
      </p>
    </AdminCard>
  );
}

const isFeedUrl = (url) => {
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
};

/**
 * «خبرگزاری‌های بین‌المللی»: the RSS/Atom feeds read with the channels (English articles the model
 * translates); saved apart from the channels
 */
function NewsFeeds({ saved, status, maxFeeds, onSaved }) {
  const { toast } = useFeedback();
  const [feeds, setFeeds] = useState(saved);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(feeds) !== JSON.stringify(saved);

  const add = () => {
    const address = url.trim();
    if (!isFeedUrl(address)) {
      toast.error('آدرس فید معتبر نیست (مثل https://example.com/rss).');
      return;
    }
    if (feeds.some((f) => f.url === address)) {
      toast.warning('این فید در فهرست هست.');
      return;
    }
    // The server gives a new feed its id
    setFeeds([...feeds, { title: title.trim(), url: address, enabled: true }]);
    setTitle('');
    setUrl('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveNewsFeeds(feeds);
      onSaved(res.feeds);
      toast.success('فهرست خبرگزاری‌ها ذخیره شد.');
    } catch (err) {
      toast.error(err?.message || 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };

  const keyOf = (f) => f.id || f.url;
  return (
    <AdminCard className="admin-news-feeds" icon={<Globe size={18} />} title="خبرگزاری‌های بین‌المللی (RSS)">
      <p className="admin-card-hint">
        هر دقیقه با کانال‌ها خوانده می‌شوند. خبرهای انگلیسی از همان کلیدواژه‌ها و مدل می‌گذرند؛ مدل تیتر و خلاصه را به فارسی
        ترجمه می‌کند و متن اصلی و لینک خبر کنارش می‌ماند (فیلتر «بین‌الملل» صفحه‌ی اخبار). خبرهای قدیمی‌تر از ۱۲ ساعت بررسی نمی‌شوند.
      </p>

      {feeds.length === 0 ? (
        <EmptyState title="فیدی نیست" description="یک فید RSS اضافه کنید." />
      ) : (
        <ul className="admin-news-channels">
          {feeds.map((f) => {
            const s = f.id ? status?.feeds?.[f.id] : null;
            return (
              <li key={keyOf(f)} className={f.enabled ? '' : 'is-off'}>
                <AdminSwitch
                  checked={f.enabled}
                  label={`فعال بودن ${f.title || f.url}`}
                  onChange={(on) => setFeeds(feeds.map((x) => (keyOf(x) === keyOf(f) ? { ...x, enabled: on } : x)))}
                />
                <span className="admin-news-channel">
                  <a href={f.url} target="_blank" rel="noopener noreferrer"><bdi>{f.title || f.url}</bdi></a>
                  <small>
                    {!s ? 'هنوز خوانده نشده'
                      : s.ok ? <><CheckCircle2 size={12} className="is-ok" /> {fa(s.items)} خبر در فید · {fa(s.published)} خبر منتشرشده</>
                        : <><AlertTriangle size={12} className="is-warn" /> خوانده نشد: <bdi dir="ltr">{s.error}</bdi></>}
                  </small>
                </span>
                <button
                  type="button"
                  className="admin-news-remove"
                  aria-label={`حذف ${f.title || f.url}`}
                  onClick={() => setFeeds(feeds.filter((x) => keyOf(x) !== keyOf(f)))}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form className="admin-news-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input id="adminNewsFeedTitle" placeholder="نام (مثل Reuters)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input id="adminNewsFeedUrl" placeholder="https://example.com/rss" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" />
        <Button type="submit" size="sm" variant="secondary" icon={<Plus size={14} />} disabled={feeds.length >= (maxFeeds || 20)}>
          افزودن
        </Button>
      </form>

      <div className="admin-news-save">
        <Button size="sm" icon={<Save size={14} />} loading={busy} disabled={!dirty || busy} onClick={save}>
          ذخیره فهرست
        </Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setFeeds(saved)}>انصراف</Button>}
      </div>
    </AdminCard>
  );
}

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
      // The report's last news too (the channels being edited stay as they are)
      getNewsChannels().then((fresh) => setData((d) => ({ ...d, latest: fresh.latest }))).catch(() => {});
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
      if (res.analysisStatus) setData((d) => ({ ...d, analysisStatus: res.analysisStatus }));
      if (res.result?.updated) toast.success('تحلیل روز نوشته شد.');
      else if (res.result?.reason === 'model-error') toast.error(`مدل خطا داد: ${modelError(res.result.error)}`, { duration: 8000 });
      else toast.warning(res.result?.reason === 'no-news' ? 'امروز هنوز خبری نیست.' : `تحلیل نوشته نشد (${res.result?.reason || 'خطا'}).`);
    } catch (err) {
      toast.error(err?.message || 'اجرا نشد.');
    } finally {
      setBusy(null);
    }
  };

  const actions = data && (
    <>
      <Button variant="secondary" icon={<Sparkles size={16} />} loading={busy === 'analysis'} disabled={Boolean(busy) || !data.aiConfigured} onClick={analyze}>
        تحلیل الان
      </Button>
      <Button variant="secondary" icon={<RefreshCw size={16} />} loading={busy === 'run'} disabled={Boolean(busy)} onClick={run}>
        خواندن الان
      </Button>
    </>
  );

  return (
    <AdminPage section="news" loading={!data} error={data ? '' : error} onRetry={load} actions={actions}>
      {data && (
        <AdminTabs
          label="بخش‌های اخبار"
          tabs={[
            {
              id: 'report',
              label: 'گزارش',
              icon: <BarChart3 size={14} />,
              content: (
                <div className="admin-stack">
                  <NewsAiCard data={data} status={status} />
                  <NewsReport status={status} latest={data.latest} model={data.model} dayBudget={data.limits?.aiCallsPerDay} />
                </div>
              ),
            },
            {
              id: 'channels',
              label: 'کانال‌های تلگرام',
              icon: <Newspaper size={14} />,
              badge: channels.length,
              content: (
                <AdminCard icon={<Newspaper size={18} />} title="کانال‌های خبری تلگرام">
                  <p className="admin-card-hint">
                    هر دقیقه پست‌های تازه‌ی این کانال‌ها خوانده می‌شود. کانالی که تازه اضافه شود، ۱۰ پست آخرش بررسی می‌شود.
                  </p>
                  {channels.length === 0 ? (
                    <EmptyState title="کانالی نیست" description="یک کانال اضافه کنید." />
                  ) : (
                    <ul className="admin-news-channels">
                      {channels.map((c) => {
                        const s = status?.channels?.[c.username];
                        return (
                          <li key={c.username} className={c.enabled ? '' : 'is-off'}>
                            <AdminSwitch
                              checked={c.enabled}
                              label={`فعال بودن @${c.username}`}
                              onChange={(on) => setChannels(channels.map((x) => (x.username === c.username ? { ...x, enabled: on } : x)))}
                            />
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
                </AdminCard>
              ),
            },
            {
              id: 'feeds',
              label: 'خبرگزاری‌های بین‌المللی',
              icon: <Globe size={14} />,
              badge: (data.feeds || []).length,
              // A new saved list starts the editor over
              content: (
                <NewsFeeds
                  key={JSON.stringify(data.feeds || [])}
                  saved={data.feeds || []}
                  status={status}
                  maxFeeds={data.limits?.maxFeeds}
                  onSaved={(feeds) => setData((d) => ({ ...d, feeds }))}
                />
              ),
            },
          ]}
        />
      )}
    </AdminPage>
  );
}
