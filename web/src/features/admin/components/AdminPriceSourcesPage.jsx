/**
 * AdminPriceSourcesPage.jsx — The price sources section of the admin panel (/admin/sources)
 *
 * Every source defined in code (api config/sources.config.js), in two groups:
 *  - «سورس‌های نرخ پایه (طلا، ارز، سکه)»: single-price sources (one rate each)
 *  - «هاب سورس‌های چند خروجی و فیدها»: multi-output feeds and catalogs (a market's whole list)
 * For each one: its status and last error, how often it is fetched, when it was and will next be
 * fetched, when its prices count as stale, its quote, kind, adapter, category, jump guard and
 * endpoint, and what it gave (its price, or its size and a preview). Actions: switch on/off,
 * make primary, a dry-run test, sync now, and the full list of a feed's items.
 *
 * Sources are defined in code; the admin only switches them and picks a primary one. The facts
 * come from the server (priceSourcesAdmin.service.js); the wording from priceSourceFormat.js.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Radio, Sliders, Layers, RefreshCw, Zap, FlaskConical, ListTree, Star, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import { Button, AlertBanner, EmptyState, Modal, SearchBar } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import {
  getPriceSources, getPriceSourceItems, setPriceSourceActive, setPrimarySource,
  testPriceSource, syncPriceSource, fetchAllSourcesNow,
} from '../api/adminApi.js';
import {
  SOURCE_STATUS, SOURCE_STATUS_ORDER, durationText, intervalText, relativeTime, nextFetchText,
  quotePrice, sharedPriceTypes, sourceMatches,
} from '../utils/priceSourceFormat.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

/** The two groups of the page, by a source's kind */
const GROUPS = [
  {
    key: 'base',
    title: 'سورس‌های نرخ پایه (طلا، ارز، سکه)',
    hint: 'هر سورس یک نرخ می‌دهد؛ اگر چند سورس یک نرخ را بدهند، سورس «مرجع» شناسه‌ی اصلی را می‌گیرد.',
    icon: Sliders,
    kinds: ['single'],
  },
  {
    key: 'feeds',
    title: 'هاب سورس‌های چند خروجی و فیدها',
    hint: 'هر فید چند قیمت با شناسه‌ی خودشان می‌دهد؛ کاتالوگ فهرست کامل یک بازار است و نمادی که در دریافتی نباشد، آخرین قیمتش را نگه می‌دارد.',
    icon: Layers,
    kinds: ['multi', 'catalog'],
  },
];

function StatusBadge({ status }) {
  const s = SOURCE_STATUS[status] || SOURCE_STATUS.pending;
  return <span className={`ps-status ${s.tone}`}>{s.label}</span>;
}

/** A label and its value in a source's facts */
function Fact({ label, children, ltr = false }) {
  return (
    <div className="ps-fact">
      <dt>{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined}>{children}</dd>
    </div>
  );
}

/** What a dry run gave */
function TestResult({ result, quote, onClose }) {
  return (
    <div className={`ps-test ${result.success ? 'is-ok' : 'is-error'}`} role="status">
      {result.success ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
      <span>
        {result.success ? (
          <>
            تست موفق: {result.price ? <strong>{quotePrice(result.price, quote)}</strong> : <strong>{fa(result.count)} قیمت</strong>}
            {result.sample?.length > 1 && (
              <small> — {result.sample.slice(0, 4).map((i) => `${i.name || i.id}: ${quotePrice(i.price, quote)}`).join('، ')}</small>
            )}
          </>
        ) : (
          <>تست ناموفق: <bdi>{result.error}</bdi></>
        )}
        <small className="ps-test-ms"> ({fa(result.ms)} میلی‌ثانیه، چیزی ذخیره نشد)</small>
      </span>
      <button type="button" className="ps-test-close" aria-label="بستن نتیجه" onClick={onClose}><X size={14} /></button>
    </div>
  );
}

/** One source: its facts, what it gave and its actions */
function SourceCard({ src, nowMs, busy, canSetPrimary, testResult, onToggle, onTest, onSync, onPrimary, onItems, onCloseTest }) {
  const { schedule } = src;
  const isBusy = (action) => busy === `${action}:${src.id}`;
  return (
    <li className={`ps-source ${src.isActive ? '' : 'is-off'}`}>
      <div className="ps-source-head">
        <button
          type="button"
          role="switch"
          aria-checked={src.isActive}
          aria-label={`فعال بودن ${src.name}`}
          className={`admin-switch ${src.isActive ? 'is-on' : ''}`}
          disabled={Boolean(busy)}
          onClick={() => onToggle(src)}
        >
          <span className="admin-switch-thumb" />
        </button>
        <div className="ps-source-title">
          <strong>{src.name}</strong>
          <small dir="ltr">{src.id}</small>
        </div>
        <div className="ps-badges">
          <span className="ps-badge">{src.kindLabel}</span>
          {src.isPrimary && src.kind === 'single' && <span className="ps-badge is-primary"><Star size={11} aria-hidden="true" /> مرجع</span>}
          {src.isReferenceRate && <span className="ps-badge">نرخ پایه‌ی محاسبات</span>}
          <StatusBadge status={schedule.status} />
        </div>
      </div>

      {schedule.error && (
        <p className="ps-error">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>خطای آخرین دریافت ({relativeTime(schedule.failedAt, nowMs)}): <bdi>{schedule.error}</bdi></span>
        </p>
      )}

      <div className="ps-source-body">
        <div className="ps-value">
          {src.kind === 'single' ? (
            <>
              <small>آخرین قیمت</small>
              <strong>{quotePrice(src.price, src.quote)}</strong>
            </>
          ) : (
            <>
              <small>{src.kind === 'catalog' ? 'نماد در کاتالوگ' : 'خروجی'}</small>
              <strong>{fa(src.count)}</strong>
              {src.preview.length > 0 && (
                <ul className="ps-preview">
                  {src.preview.map((i) => (
                    <li key={i.id}><span>{i.name || i.id}</span><bdi>{quotePrice(i.price, src.quote)}</bdi></li>
                  ))}
                </ul>
              )}
            </>
          )}
          {src.held > 0 && <small className="ps-held">{fa(src.held)} قیمت با جهش غیرعادی نگه داشته شده</small>}
        </div>

        <dl className="ps-facts">
          <Fact label="دوره‌ی دریافت">{intervalText(schedule.intervalSec)}</Fact>
          <Fact label="آخرین دریافت موفق">{schedule.syncedAt ? relativeTime(schedule.syncedAt, nowMs) : 'هنوز نه'}</Fact>
          <Fact label="دریافت بعدی">{nextFetchText(schedule, nowMs)}</Fact>
          <Fact label="کهنه پس از">{durationText(schedule.staleAfterSec)}</Fact>
          <Fact label="واحد قیمت">{src.quoteLabel}</Fact>
          <Fact label="دسته">{src.categoryName || '—'}{src.unit ? ` · ${src.unit}` : ''}</Fact>
          <Fact label="آداپتر">{src.adapterName}</Fact>
          <Fact label="محافظ جهش">±{fa(src.guard.maxJumpPct)}٪ · تأیید با {fa(src.guard.confirmTicks)} دریافت</Fact>
          {src.series ? (
            <Fact label="سری‌ها" ltr>{src.series.join(', ')}</Fact>
          ) : (
            src.endpoint && <Fact label="آدرس" ltr><span className="ps-endpoint" title={src.endpoint}>{src.endpoint}</span></Fact>
          )}
        </dl>
      </div>

      {testResult && <TestResult result={testResult} quote={src.quote} onClose={onCloseTest} />}

      <div className="ps-actions">
        <Button size="sm" variant="secondary" icon={<FlaskConical size={14} />} loading={isBusy('test')} disabled={Boolean(busy)} onClick={() => onTest(src)}>
          تست
        </Button>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={isBusy('sync')} disabled={Boolean(busy) || !src.isActive} onClick={() => onSync(src)}>
          دریافت الان
        </Button>
        {src.kind !== 'single' && (
          <Button size="sm" variant="ghost" icon={<ListTree size={14} />} disabled={!src.count} onClick={() => onItems(src)}>
            همه‌ی اقلام
          </Button>
        )}
        {canSetPrimary && (
          <Button size="sm" variant="ghost" icon={<Star size={14} />} loading={isBusy('primary')} disabled={Boolean(busy)} onClick={() => onPrimary(src)}>
            مرجع شود
          </Button>
        )}
      </div>
    </li>
  );
}

/** A feed's items as its last sync stored them, searchable (keyed by the source: a new one starts empty) */
function SourceItemsModal({ src, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!src) return undefined;
    let alive = true;
    getPriceSourceItems(src.id)
      .then((res) => alive && setItems(res.items || []))
      .catch((err) => alive && setError(err?.message || 'خوانده نشد.'));
    return () => { alive = false; };
  }, [src]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items || [];
    return q ? list.filter((i) => `${i.id} ${i.name || ''}`.toLowerCase().includes(q)) : list;
  }, [items, query]);

  return (
    <Modal
      isOpen={Boolean(src)}
      onClose={onClose}
      title={src?.name || ''}
      subtitle={items ? `${fa(items.length)} قلم، همان‌طور که آخرین دریافت ذخیره کرد` : undefined}
      icon={<ListTree size={18} />}
      maxWidth="640px"
    >
      {error && <AlertBanner type="error" message={error} />}
      {!items && !error && <div className="require-auth-loading"><div className="spinner-glow" /></div>}
      {items && (
        <>
          <SearchBar value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نماد یا نام…" />
          <div className="ps-items-wrap">
            <table className="ps-items">
              <thead>
                <tr><th scope="col">شناسه</th><th scope="col">نام</th><th scope="col">قیمت ({src?.quoteLabel})</th></tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id}>
                    <td><bdi>{i.id}</bdi></td>
                    <td>{i.name || '—'}</td>
                    <td>{quotePrice(i.price, src?.quote)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <EmptyState title="قلمی پیدا نشد" />}
          </div>
        </>
      )}
    </Modal>
  );
}

export default function AdminPriceSourcesPage() {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [query, setQuery] = useState('');
  const [tests, setTests] = useState({});
  const [itemsOf, setItemsOf] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = async () => {
    try {
      const res = await getPriceSources();
      setData(res);
      setNowMs(Date.now());
      setError('');
    } catch (err) {
      setError(err?.message || 'فهرست سورس‌ها خوانده نشد.');
    }
  };
  useEffect(() => {
    load();
  }, []);

  /** Run an action on a source, then read the list again */
  const act = async (key, fn, { reload = true } = {}) => {
    setBusy(key);
    try {
      await fn();
      if (reload) await load();
    } catch (err) {
      toast.error(err?.message || 'انجام نشد.');
    } finally {
      setBusy(null);
    }
  };

  const toggle = (src) => act(`toggle:${src.id}`, async () => {
    await setPriceSourceActive(src.id, !src.isActive);
    toast.success(`«${src.name}» ${src.isActive ? 'خاموش' : 'روشن'} شد.`);
  });

  const primary = (src) => act(`primary:${src.id}`, async () => {
    await setPrimarySource(src.id);
    toast.success(`«${src.name}» سورس مرجع شد.`);
  });

  const test = (src) => act(`test:${src.id}`, async () => {
    const res = await testPriceSource(src.id);
    setTests((t) => ({ ...t, [src.id]: res }));
  }, { reload: false });

  const sync = (src) => act(`sync:${src.id}`, async () => {
    const res = await syncPriceSource(src.id);
    if (res.success) toast.success(`«${src.name}» دریافت شد: ${fa(res.count)} قیمت.`);
    else toast.error(`«${src.name}» دریافت نشد: ${res.error || 'خطای نامشخص'}`, { duration: 8000 });
  });

  const syncAll = () => act('sync-all', async () => {
    const res = await fetchAllSourcesNow();
    const msg = `${fa(res.syncedCount)} سورس دریافت شد${res.failedCount ? `، ${fa(res.failedCount)} سورس خطا داد` : ''}.`;
    if (res.failedCount) toast.warning(msg);
    else toast.success(msg);
  });

  const sources = useMemo(() => data?.sources || [], [data]);
  const shared = useMemo(() => sharedPriceTypes(sources), [sources]);
  const visible = useMemo(() => sources.filter((s) => sourceMatches(s, query)), [sources, query]);

  if (error && !data) return <AlertBanner type="error" message={error} />;
  if (!data) return <div className="require-auth-loading"><div className="spinner-glow" /></div>;

  return (
    <div className="ps-page">
      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label"><Radio size={14} /> سورس‌های قیمت</span>
          <span className="ps-head-actions">
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} disabled={Boolean(busy)} onClick={() => act('reload', async () => {})}>
              تازه کردن
            </Button>
            <Button size="sm" variant="secondary" icon={<Zap size={14} />} loading={busy === 'sync-all'} disabled={Boolean(busy)} onClick={syncAll}>
              دریافت همه الان
            </Button>
          </span>
        </div>
        <p className="admin-card-hint">
          زمان‌بند هر {durationText(data.tickSec)} اجرا می‌شود و هر سورسی را که دوره‌اش از آخرین تلاش (موفق یا ناموفق) گذشته باشد
          دریافت می‌کند؛ پس سورسی که خطا بدهد هم تا دوره‌ی بعدش دوباره امتحان نمی‌شود. قیمتی که بیش از حد محافظ جهش تغییر کند،
          تا چند دریافت پشت‌سرهم تأیید نشود جایگزین نمی‌شود. سورس‌ها در کد تعریف شده‌اند؛ اینجا فقط روشن/خاموش و سورس مرجع
          انتخاب می‌شود. «تست» سورس را همین حالا می‌خواند و چیزی ذخیره نمی‌کند؛ «دریافت الان» مثل زمان‌بند ذخیره می‌کند.
        </p>
        <div className="ps-summary" aria-label="خلاصه‌ی وضعیت">
          <div><strong>{fa(data.summary.total)}</strong><small>کل سورس‌ها</small></div>
          {SOURCE_STATUS_ORDER.map((k) => (
            <div key={k} className={data.summary[k] ? SOURCE_STATUS[k].tone : ''}>
              <strong>{fa(data.summary[k])}</strong>
              <small>{SOURCE_STATUS[k].label}</small>
            </div>
          ))}
        </div>
        <SearchBar value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نام، شناسه، دسته یا آدرس…" />
      </div>

      {GROUPS.map((g) => {
        const list = visible.filter((s) => g.kinds.includes(s.kind));
        const Icon = g.icon;
        return (
          <section key={g.key} className="portfolio-stat-card ps-group" aria-labelledby={`ps-${g.key}`}>
            <div className="stat-header">
              <h2 id={`ps-${g.key}`} className="stat-label"><Icon size={14} /> {g.title}</h2>
              <span className="ps-count">{fa(list.length)} سورس</span>
            </div>
            <p className="admin-card-hint">{g.hint}</p>
            {list.length === 0 ? (
              <EmptyState title="سورسی نیست" description={query ? 'با این جستجو سورسی پیدا نشد.' : undefined} />
            ) : (
              <ul className="ps-list">
                {list.map((src) => (
                  <SourceCard
                    key={src.id}
                    src={src}
                    nowMs={nowMs}
                    busy={busy}
                    canSetPrimary={src.kind === 'single' && !src.isPrimary && shared.has(src.priceType)}
                    testResult={tests[src.id]}
                    onToggle={toggle}
                    onTest={test}
                    onSync={sync}
                    onPrimary={primary}
                    onItems={setItemsOf}
                    onCloseTest={() => setTests(({ [src.id]: _drop, ...rest }) => rest)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <SourceItemsModal key={itemsOf?.id || 'none'} src={itemsOf} onClose={() => setItemsOf(null)} />
    </div>
  );
}
