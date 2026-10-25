/**
 * AdminNewsPage.jsx — The news section in the admin panel (/admin/news), in three tabs; «خواندن الان»
 * (read every channel and feed now) and «تحلیل الان» (write «تحلیل روز» now) are in the header:
 *  - «گزارش»: the AI's state (on, today's calls, the models, the last «تحلیل روز»), today's totals
 *    (posts checked, not market news, repeats, sent to the model, rejected by it, published), the
 *    last runs one per row, and the last published news
 *  - «کانال‌های تلگرام»: add, pause or remove a channel, mark an English one «ترجمه» (its posts are
 *    translated like the feeds' articles), see how each one did on the last run
 *  - «خبرگزاری‌های بین‌المللی»: the news feeds (RSS/Atom, English): add, pause or remove a feed,
 *    see how each one did on the last run
 * Both lists are the same editor (SourceList): rows from AdminPage.jsx, an add form, a save bar.
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { Newspaper, Plus, RefreshCw, Sparkles, BarChart3, Globe, Bot, Languages, AlertTriangle } from 'lucide-react';
import { Button, Input, EmptyState } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getNewsChannels, saveNewsChannels, saveNewsFeeds, runNewsNow, runNewsAnalysisNow } from '../../news/newsApi.js';
import { newsTimeAgo, newsClock, NEWS_CATEGORIES } from '../../news/newsFormat.js';
import AdminPage, { AdminCard, AdminSwitch, AdminTabs, AdminNotice, AdminStatus, AdminList, AdminListRow, AdminRemoveButton, AdminSaveBar } from './AdminPage.jsx';

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
      actions={status?.at && <AdminStatus>آخرین اجرا {newsTimeAgo(status.at)}</AdminStatus>}
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
        <AdminNotice tone="warn">
          <strong>سهمیه‌ی امروز مدل ({fa(dayBudget)} درخواست) تمام شده است.</strong>
          <small>{fa(status.run?.waiting)} پست در صف منتظر است و با شروع روز بعد (تهران) بررسی می‌شود؛ پست‌های قدیمی‌تر از ۶ ساعت از صف حذف می‌شوند.</small>
        </AdminNotice>
      )}
      {status?.aiError && (
        <AdminNotice tone="error">
          <strong>خطای مدل {status.aiModel || model} در آخرین اجرا:</strong> <bdi dir="ltr">{modelError(status.aiError)}</bdi>
          <small>مدل دیگری امتحان نشد و خبری منتشر نشد؛ همان پست‌ها در اجرای بعدی دوباره بررسی می‌شوند.</small>
        </AdminNotice>
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
          <AdminStatus tone="ok"><strong>هوش مصنوعی فعال است</strong> · {fa(status?.aiCallsToday)} از {fa(data.limits?.aiCallsPerDay)} درخواست امروز</AdminStatus>
        ) : (
          <AdminNotice tone="error">هوش مصنوعی (Workers AI) وصل نیست؛ بدون آن هیچ خبری منتشر نمی‌شود.</AdminNotice>
        )}
        <AdminStatus>مدل بررسی خبرها و «تحلیل روز»: {data.model}{data.analysisModel !== data.model ? ` / ${data.analysisModel}` : ''}</AdminStatus>
        {data.analysisStatus && (data.analysisStatus.ok ? (
          <AdminStatus tone="ok">آخرین تحلیل روز {newsTimeAgo(data.analysisStatus.at)} بدون خطا نوشته شد.</AdminStatus>
        ) : (
          <AdminStatus tone="warn">
            تحلیل روز {newsTimeAgo(data.analysisStatus.at)}: مدل خطا داد ({modelError(data.analysisStatus.error)}) — مدل دیگری امتحان نشد و تحلیل قبلی مانده است.
          </AdminStatus>
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

const cleanName = (s) => String(s || '').trim().replace(/^(https?:\/\/)?(www\.)?t\.me\/(s\/)?/i, '').replace(/^@/, '').split(/[/?#]/)[0].toLowerCase();

/** A source's last read, as its row's status line */
function SourceStatus({ s, okText }) {
  if (!s) return <AdminStatus>هنوز خوانده نشده</AdminStatus>;
  if (!s.ok) return <AdminStatus tone="warn">خوانده نشد: <bdi dir="ltr">{s.error}</bdi></AdminStatus>;
  return <AdminStatus tone="ok">{okText}</AdminStatus>;
}

/**
 * One editable list of sources (the channels, or the feeds): a row each (on/off, name, last read,
 * its own controls, delete), the add form and the save bar; the list is saved as a whole
 * @param {{ icon: import('react').ReactNode, title: string, hint: import('react').ReactNode,
 *   saved: object[], keyOf: (item: object) => string, max: number, empty: string,
 *   row: (item: object, update: (patch: object) => void) => { title: import('react').ReactNode, name: string, meta: import('react').ReactNode, actions?: import('react').ReactNode },
 *   addForm: (add: (item: object) => boolean, items: object[]) => import('react').ReactNode,
 *   save: (items: object[]) => Promise<object[]>, savedText: string }} props
 *   row: a row's parts (name: its name in the labels); addForm: the fields and the add button
 *   (add returns false when the item is already listed)
 */
function SourceList({ icon, title, hint, saved, keyOf, max, empty, row, addForm, save, savedText }) {
  const { toast } = useFeedback();
  const [items, setItems] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  const add = (item) => {
    if (items.some((x) => keyOf(x) === keyOf(item))) {
      toast.warning('این مورد در فهرست هست.');
      return false;
    }
    setItems([...items, item]);
    return true;
  };

  const onSave = async () => {
    setBusy(true);
    try {
      setItems(await save(items));
      toast.success(savedText);
    } catch (err) {
      toast.error(err?.message || 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard icon={icon} title={title} subtitle={`${fa(items.length)} از ${fa(max)}`}>
      <p className="admin-card-hint">{hint}</p>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <AdminList label={title}>
          {items.map((item) => {
            const update = (patch) => setItems(items.map((x) => (keyOf(x) === keyOf(item) ? { ...x, ...patch } : x)));
            const parts = row(item, update);
            return (
              <AdminListRow
                key={keyOf(item)}
                off={!item.enabled}
                leading={<AdminSwitch checked={item.enabled} label={`فعال بودن ${parts.name}`} onChange={(on) => update({ enabled: on })} />}
                title={parts.title}
                meta={parts.meta}
                actions={(
                  <>
                    {parts.actions}
                    <AdminRemoveButton label={`حذف ${parts.name}`} onClick={() => setItems(items.filter((x) => keyOf(x) !== keyOf(item)))} />
                  </>
                )}
              />
            );
          })}
        </AdminList>
      )}
      {items.length < max ? addForm(add, items) : <AdminStatus tone="warn">فهرست پر است ({fa(max)} مورد).</AdminStatus>}
      <AdminSaveBar label="ذخیره فهرست" dirty={dirty} busy={busy} onSave={onSave} onCancel={() => setItems(saved)} />
    </AdminCard>
  );
}

/** «افزودن کانال»: a channel's name or link, and whether it posts in English */
function ChannelAddForm({ add }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [translate, setTranslate] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const username = cleanName(name);
    if (!/^[a-z][a-z0-9_]{3,31}$/.test(username)) {
      toast.error('نام کانال معتبر نیست (مثل @khabari).');
      return;
    }
    if (add({ username, enabled: true, translate })) {
      setName('');
      setTranslate(false);
    }
  };
  return (
    <form className="admin-add-form" onSubmit={submit}>
      <Input id="adminNewsChannel" placeholder="@channel یا t.me/channel" value={name} onChange={(e) => setName(e.target.value)} dir="ltr" />
      <label className={`admin-chip-toggle ${translate ? 'is-on' : ''}`}>
        <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
        <Languages size={12} aria-hidden="true" /> انگلیسی (ترجمه)
      </label>
      <Button type="submit" size="sm" variant="secondary" icon={<Plus size={14} />}>افزودن</Button>
    </form>
  );
}

/** «افزودن فید»: a feed's name and address (the server gives it its id) */
function FeedAddForm({ add }) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const address = url.trim();
    if (!isFeedUrl(address)) {
      toast.error('آدرس فید معتبر نیست (مثل https://example.com/rss).');
      return;
    }
    if (add({ title: title.trim(), url: address, enabled: true })) {
      setTitle('');
      setUrl('');
    }
  };
  return (
    <form className="admin-add-form" onSubmit={submit}>
      <Input id="adminNewsFeedTitle" placeholder="نام (مثل Reuters)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input id="adminNewsFeedUrl" placeholder="https://example.com/rss" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" />
      <Button type="submit" size="sm" variant="secondary" icon={<Plus size={14} />}>افزودن</Button>
    </form>
  );
}

/** «کانال‌های خبری تلگرام» */
function NewsChannels({ saved, status, max, onSaved }) {
  return (
    <SourceList
      icon={<Newspaper size={18} />}
      title="کانال‌های خبری تلگرام"
      hint={(
        <>
          هر دقیقه پست‌های تازه‌ی این کانال‌ها خوانده می‌شود؛ کانالی که تازه اضافه شود، ۱۰ پست آخرش بررسی می‌شود.
          کانال انگلیسی را «ترجمه» بزنید: پست‌هایش مثل خبرگزاری‌های بین‌المللی به فارسی ترجمه و با برچسب «بین‌الملل» منتشر می‌شوند.
        </>
      )}
      saved={saved}
      keyOf={(c) => c.username}
      max={max}
      empty="کانالی نیست"
      row={(c, update) => {
        const s = status?.channels?.[c.username];
        return {
          name: `@${c.username}`,
          title: (
            <>
              <a href={`https://t.me/s/${c.username}`} target="_blank" rel="noopener noreferrer" dir="ltr">@{c.username}</a>
              {s?.title && s.title !== c.username && <small className="admin-status"><bdi>{s.title}</bdi></small>}
            </>
          ),
          meta: <SourceStatus s={s} okText={`${fa(s?.published)} خبر منتشرشده`} />,
          actions: (
            <label className={`admin-chip-toggle ${c.translate ? 'is-on' : ''}`} title="پست‌های انگلیسی این کانال به فارسی ترجمه شوند">
              <input type="checkbox" checked={Boolean(c.translate)} onChange={(e) => update({ translate: e.target.checked })} />
              <Languages size={12} aria-hidden="true" /> ترجمه
            </label>
          ),
        };
      }}
      addForm={(add) => <ChannelAddForm add={add} />}
      save={async (items) => {
        const res = await saveNewsChannels(items);
        onSaved(res.channels);
        return res.channels;
      }}
      savedText="فهرست کانال‌ها ذخیره شد."
    />
  );
}

/**
 * «خبرگزاری‌های بین‌المللی»: the RSS/Atom feeds read with the channels (English articles the model
 * translates); saved apart from the channels
 */
function NewsFeeds({ saved, status, max, onSaved }) {
  return (
    <SourceList
      icon={<Globe size={18} />}
      title="خبرگزاری‌های بین‌المللی (RSS)"
      hint={(
        <>
          هر دقیقه با کانال‌ها خوانده می‌شوند. خبرهای انگلیسی از همان کلیدواژه‌ها و مدل می‌گذرند؛ مدل تیتر و خلاصه را به فارسی
          ترجمه می‌کند و متن اصلی و لینک خبر کنارش می‌ماند (فیلتر «بین‌الملل» صفحه‌ی اخبار). خبرهای قدیمی‌تر از ۱۲ ساعت بررسی نمی‌شوند.
        </>
      )}
      saved={saved}
      keyOf={(f) => f.id || f.url}
      max={max}
      empty="فیدی نیست"
      row={(f) => {
        const s = f.id ? status?.feeds?.[f.id] : null;
        return {
          name: f.title || f.url,
          title: <a href={f.url} target="_blank" rel="noopener noreferrer"><bdi>{f.title || f.url}</bdi></a>,
          meta: <SourceStatus s={s} okText={`${fa(s?.items)} خبر در فید · ${fa(s?.published)} خبر منتشرشده`} />,
        };
      }}
      addForm={(add) => <FeedAddForm add={add} />}
      save={async (items) => {
        const res = await saveNewsFeeds(items);
        onSaved(res.feeds);
        return res.feeds;
      }}
      savedText="فهرست خبرگزاری‌ها ذخیره شد."
    />
  );
}

export default function AdminNewsPage() {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await getNewsChannels();
      setData(res);
      setError('');
    } catch (err) {
      setError(err?.message || 'خوانده نشد.');
    }
  };
  useEffect(() => {
    load();
  }, []);

  const status = data?.status;

  const run = async () => {
    setBusy('run');
    try {
      const res = await runNewsNow();
      setData((d) => ({ ...d, status: res.status }));
      // The report's last news too (the lists being edited stay as they are)
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
              badge: (data.channels || []).length,
              // A new saved list starts the editor over
              content: (
                <NewsChannels
                  key={JSON.stringify(data.channels || [])}
                  saved={data.channels || []}
                  status={status}
                  max={data.limits?.maxChannels || 30}
                  onSaved={(channels) => setData((d) => ({ ...d, channels }))}
                />
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
                  max={data.limits?.maxFeeds || 30}
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
