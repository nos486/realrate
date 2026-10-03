/**
 * PriceHistoryAdmin.jsx — Admin page for the daily price history and its tgju backfill
 *
 * - Mappings: which tgju series fills which price book item, in which unit (rial ÷ 10, toman, or
 *   dollar × that day's dollar). Added from the catalog (searchable, or all the suggested ones at
 *   once) or by any tgju page address; saved as they change. Each can be previewed (its latest
 *   days and the unit that matches the item's live price) and run; "run all" goes through the
 *   ones with a target, the dollar first (dollar series are converted with its history).
 * - The history: every id with its days; an id the price book doesn't know is read by no card and
 *   can be moved to the right item or deleted, one by one or all at once.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Play, Eye, Trash2, Plus, ArrowLeftRight, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import { Button, FeaturePageHeader, SearchBar } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getHistoryAdmin, saveHistoryMappings, previewHistorySeries, runHistoryBackfill, editHistoryKeys } from '../api/adminApi.js';

const HEADER = {
  icon: <History size={24} />,
  title: 'تاریخچه‌ی قیمت',
  subtitle: 'بارگذاری سابقه‌ی روزانه از tgju و مدیریت تاریخچه‌ی ذخیره‌شده',
};

const UNITS = [
  { value: 'rial', label: 'ریال' },
  { value: 'toman', label: 'تومان' },
  { value: 'usd', label: 'دلار × دلار روز' },
];
const RANGES = [
  { value: 365, label: '۱ سال' },
  { value: 730, label: '۲ سال' },
  { value: 1825, label: '۵ سال' },
  { value: 3650, label: '۱۰ سال' },
];

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const faPrice = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('fa-IR') : '-');
const faDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fa-IR') : '-');
const faDateTime = (d) => (d ? new Date(d).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const unitLabel = (u) => UNITS.find((x) => x.value === u)?.label || u;
const toSaved = (list) => list.map(({ slug, label, unit, target }) => ({ slug, label, unit, target }));

/** A tgju page address or a bare slug → the slug ('' when it can't be one) */
function slugFrom(input) {
  const s = String(input || '').trim().toLowerCase();
  const m = s.match(/tgju\.org\/profile\/([a-z0-9_-]+)/);
  const slug = m ? m[1] : s;
  return /^[a-z0-9_-]{1,64}$/.test(slug) ? slug : '';
}

function ItemSelect({ items, value, onChange, disabled, label }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const g = it.category || 'سایر';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(it);
    }
    return [...map.entries()];
  }, [items]);
  return (
    <select className="history-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
      <option value="">— مقصد را انتخاب کنید —</option>
      {groups.map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((it) => (
            <option key={it.id} value={it.id}>{it.name} · {it.id}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function RunStatus({ run, lastRun }) {
  if (run?.running) return <span className="history-status is-running">در حال بارگذاری…</span>;
  const r = run || lastRun;
  if (!r) return <span className="history-status">اجرا نشده</span>;
  if (r.error || r.ok === false) return <span className="history-status is-error" title={r.error}>{r.error || 'ناموفق'}</span>;
  return (
    <span className="history-status is-ok" title={r.at ? faDateTime(r.at) : ''}>
      {fa(r.written)} روز · {faDate(r.from)} تا {faDate(r.to)}
    </span>
  );
}

function Preview({ preview, onApplyUnit, unit }) {
  if (preview.loading) return <div className="history-preview">در حال خواندن از tgju…</div>;
  if (preview.error) return <div className="history-preview is-error">{preview.error}</div>;
  const { latest = [], live, guess } = preview.data || {};
  return (
    <div className="history-preview">
      <div className="history-preview-head">
        {live ? <span>قیمت فعلی مقصد: <strong>{faPrice(live)}</strong> تومان</span> : <span>برای سنجش واحد، مقصد را انتخاب کنید</span>}
        {guess ? (
          <span>
            واحد مناسب: <strong>{unitLabel(guess.unit)}</strong>
            {guess.unit !== unit && (
              <Button size="sm" variant="secondary" onClick={() => onApplyUnit(guess.unit)}>اعمال</Button>
            )}
          </span>
        ) : live ? (
          <span className="is-error">هیچ واحدی با قیمت فعلی نمی‌خواند — سری یا مقصد را بررسی کنید</span>
        ) : null}
      </div>
      <div className="history-preview-scroll">
      <table className="history-preview-table">
        <thead>
          <tr><th>روز</th><th>باز</th><th>بیشترین</th><th>کمترین</th><th>پایانی</th></tr>
        </thead>
        <tbody>
          {latest.map((c) => (
            <tr key={c.day}>
              <td>{faDate(c.day)}</td><td>{faPrice(c.open)}</td><td>{faPrice(c.high)}</td><td>{faPrice(c.low)}</td><td>{faPrice(c.close)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <small>اعداد همان‌طور که tgju می‌دهد (بدون تبدیل واحد).</small>
    </div>
  );
}

export default function PriceHistoryAdmin() {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState({ catalog: [], items: [], history: [] });
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('saved');
  const [days, setDays] = useState(730);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState({});
  const [previews, setPreviews] = useState({});
  const [catalogQuery, setCatalogQuery] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [onlyOrphans, setOnlyOrphans] = useState(false);
  const [moveTo, setMoveTo] = useState({});
  const saveTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHistoryAdmin();
      setData({ catalog: res.catalog || [], items: res.items || [], history: res.history || [] });
      setMappings(res.mappings || []);
    } catch (err) {
      toast.error(err?.message || 'خواندن اطلاعات انجام نشد');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const itemIds = useMemo(() => new Set(data.items.map((it) => it.id)), [data.items]);
  const itemName = useMemo(() => new Map(data.items.map((it) => [it.id, it.name])), [data.items]);
  const mapped = useMemo(() => new Set(mappings.map((m) => m.slug)), [mappings]);

  // Mappings save themselves shortly after each change
  const persist = useCallback((next) => {
    setSaveState('pending');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await saveHistoryMappings(toSaved(next));
        setMappings((cur) => cur.map((m) => ({ ...m, ...((res.mappings || []).find((x) => x.slug === m.slug) || {}) })));
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        toast.error(err?.message || 'ذخیره‌ی نگاشت‌ها انجام نشد');
      }
    }, 600);
  }, [toast]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const updateMappings = (fn) => {
    setMappings((cur) => {
      const next = fn(cur);
      persist(next);
      return next;
    });
  };

  const addFromCatalog = (entry) => {
    if (mapped.has(entry.slug)) return;
    updateMappings((cur) => [...cur, { slug: entry.slug, label: entry.label, unit: entry.unit, target: itemIds.has(entry.suggest) ? entry.suggest : '' }]);
  };

  const addSuggested = () => {
    const fresh = data.catalog.filter((c) => !mapped.has(c.slug) && itemIds.has(c.suggest));
    if (!fresh.length) {
      toast.success('همه‌ی موارد پیشنهادی اضافه شده‌اند');
      return;
    }
    updateMappings((cur) => [...cur, ...fresh.map((c) => ({ slug: c.slug, label: c.label, unit: c.unit, target: c.suggest }))]);
    toast.success(`${fa(fresh.length)} نگاشت اضافه شد`);
  };

  const addCustom = () => {
    const slug = slugFrom(customSlug);
    if (!slug) {
      toast.error('آدرس صفحه‌ی tgju یا شناسه‌ی سری را درست وارد کنید');
      return;
    }
    if (mapped.has(slug)) {
      toast.error('این سری قبلاً اضافه شده است');
      return;
    }
    const known = data.catalog.find((c) => c.slug === slug);
    updateMappings((cur) => [...cur, { slug, label: known?.label || slug, unit: known?.unit || 'rial', target: '' }]);
    setCustomSlug('');
    preview({ slug, target: '' });
  };

  const setField = (slug, patch) => updateMappings((cur) => cur.map((m) => (m.slug === slug ? { ...m, ...patch } : m)));
  const removeMapping = (slug) => updateMappings((cur) => cur.filter((m) => m.slug !== slug));

  const preview = async (m) => {
    if (previews[m.slug] && !previews[m.slug].loading && previews[m.slug].target === m.target) {
      setPreviews((p) => {
        const { [m.slug]: _, ...rest } = p;
        return rest;
      });
      return;
    }
    setPreviews((p) => ({ ...p, [m.slug]: { loading: true, target: m.target } }));
    try {
      const res = await previewHistorySeries(m.slug, m.target);
      setPreviews((p) => ({ ...p, [m.slug]: { data: res, target: m.target } }));
    } catch (err) {
      setPreviews((p) => ({ ...p, [m.slug]: { error: err?.message || 'خواندن انجام نشد', target: m.target } }));
    }
  };

  const usdTarget = mappings.find((m) => m.slug === 'price_dollar_rl')?.target || 'usd';

  const runOne = async (m) => {
    setRuns((r) => ({ ...r, [m.slug]: { running: true } }));
    try {
      const res = await runHistoryBackfill({ slug: m.slug, target: m.target, unit: m.unit, days, overwrite, usdTarget });
      setRuns((r) => ({ ...r, [m.slug]: { ok: true, ...res } }));
      return true;
    } catch (err) {
      setRuns((r) => ({ ...r, [m.slug]: { ok: false, error: err?.message || 'انجام نشد' } }));
      return false;
    }
  };

  const refreshHistory = async () => {
    try {
      const res = await getHistoryAdmin();
      setData((d) => ({ ...d, history: res.history || d.history, items: res.items || d.items }));
    } catch {
      // The list is refreshed on the next load
    }
  };

  const run = async (list) => {
    const ready = list.filter((m) => m.target);
    if (!ready.length) return;
    // The dollar first, then rial / toman series, dollar series last (they need its history)
    const rank = (m) => (m.target === usdTarget ? 0 : m.unit === 'usd' ? 2 : 1);
    const ordered = [...ready].sort((a, b) => rank(a) - rank(b));
    setBusy(true);
    let failed = 0;
    for (const m of ordered) if (!(await runOne(m))) failed += 1;
    setBusy(false);
    refreshHistory();
    if (failed) toast.error(`${fa(failed)} از ${fa(ordered.length)} مورد انجام نشد`);
    else toast.success(`تاریخچه‌ی ${fa(ordered.length)} مورد بارگذاری شد`);
  };

  const keyAction = async (body, done) => {
    try {
      const res = await editHistoryKeys(body);
      setData((d) => ({ ...d, history: res.history || d.history }));
      toast.success(done(res));
    } catch (err) {
      toast.error(err?.message || 'انجام نشد');
    }
  };

  const orphans = data.history.filter((h) => !h.inBook);
  const deleteOrphans = async () => {
    if (!orphans.length) return;
    const ok = await confirm({
      title: 'حذف شناسه‌های بی‌استفاده',
      message: `تاریخچه‌ی ${fa(orphans.length)} شناسه که در دفتر قیمت نیستند (${orphans.slice(0, 6).map((h) => h.key).join('، ')}${orphans.length > 6 ? '، …' : ''}) کامل حذف شود؟`,
      danger: true,
      confirmLabel: 'حذف',
    });
    if (ok) keyAction({ action: 'delete-orphans' }, (res) => `${fa(res.deleted)} روز از ${fa(res.keys?.length)} شناسه حذف شد`);
  };
  const deleteKey = async (h) => {
    const ok = await confirm({ title: 'حذف تاریخچه', message: `همه‌ی ${fa(h.days)} روزِ «${h.name || h.key}» حذف شود؟`, danger: true, confirmLabel: 'حذف' });
    if (ok) keyAction({ action: 'delete', key: h.key }, (res) => `${fa(res.deleted)} روز حذف شد`);
  };
  const moveKey = (h) => {
    const to = moveTo[h.key];
    if (to) keyAction({ action: 'move', key: h.key, to }, (res) => `${fa(res.moved)} روز به «${itemName.get(to) || to}» منتقل شد`);
  };

  const catalogResults = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return data.catalog
      .filter((c) => !mapped.has(c.slug))
      .filter((c) => !q || c.label.toLowerCase().includes(q) || c.slug.includes(q) || c.group.includes(q));
  }, [data.catalog, catalogQuery, mapped]);

  const historyRows = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return data.history
      .filter((h) => !onlyOrphans || !h.inBook)
      .filter((h) => !q || h.key.includes(q) || (h.name || '').toLowerCase().includes(q));
  }, [data.history, historyQuery, onlyOrphans]);

  const ready = mappings.filter((m) => m.target);

  return (
    <div className="incomes-page-container admin-page history-page">
      <FeaturePageHeader
        {...HEADER}
        actions={<Button variant="secondary" icon={<RefreshCw size={16} />} onClick={load} loading={loading}>به‌روزرسانی</Button>}
      />

      <section className="fintech-card history-section">
        <div className="history-section-head">
          <h3>نگاشت سری‌های tgju</h3>
          <span className={`history-save is-${saveState}`}>
            {saveState === 'pending' ? 'در حال ذخیره…' : saveState === 'error' ? 'ذخیره نشد' : 'ذخیره شده'}
          </span>
        </div>
        <p className="history-hint">
          هر سری tgju را به موردی از دفتر قیمت وصل کنید. قبل از نوشتن، آخرین قیمت tgju با قیمت فعلی مقصد سنجیده می‌شود
          (بیش از دو برابر اختلاف = چیزی نوشته نمی‌شود). امروز هیچ‌وقت نوشته نمی‌شود.
        </p>

        <div className="history-add">
          <div className="history-add-catalog">
            <SearchBar value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="جستجو در سری‌های tgju (دلار، سکه، انس…)" />
            {catalogQuery && (
              <div className="history-catalog-results">
                {catalogResults.length === 0 && <div className="history-hint">موردی پیدا نشد؛ آدرس صفحه‌اش را پایین وارد کنید.</div>}
                {catalogResults.slice(0, 30).map((c) => (
                  <button key={c.slug} type="button" className="history-catalog-item" onClick={() => addFromCatalog(c)}>
                    <Plus size={14} />
                    <span>{c.label}</span>
                    <small>{c.group} · {unitLabel(c.unit)} · <span dir="ltr">{c.slug}</span></small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="history-add-custom">
            <input
              className="history-input"
              dir="ltr"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder="https://www.tgju.org/profile/geram18"
              aria-label="آدرس صفحه‌ی tgju"
            />
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addCustom}>افزودن</Button>
            <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={addSuggested} disabled={loading}>
              افزودن موارد پیشنهادی
            </Button>
          </div>
        </div>

        <div className="history-toolbar">
          <label>
            بازه
            <select className="history-select" value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={busy}>
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="history-check">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} disabled={busy} />
            روزهایی که قبلاً ثبت شده‌اند هم جایگزین شوند
          </label>
          <Button icon={<Play size={16} />} loading={busy} disabled={busy || !ready.length} onClick={() => run(mappings)}>
            بارگذاری همه ({fa(ready.length)})
          </Button>
        </div>

        {mappings.length === 0 && !loading && (
          <div className="history-empty">هنوز نگاشتی نیست. از جستجو یا «افزودن موارد پیشنهادی» شروع کنید.</div>
        )}

        <div className="history-mappings">
          {mappings.map((m) => (
            <div key={m.slug} className="history-mapping">
              <div className="history-mapping-row">
                <div className="history-mapping-name">
                  <strong>{m.label}</strong>
                  <a href={`https://www.tgju.org/profile/${m.slug}`} target="_blank" rel="noreferrer" dir="ltr">
                    {m.slug} <ExternalLink size={11} />
                  </a>
                </div>
                <select className="history-select is-unit" value={m.unit} onChange={(e) => setField(m.slug, { unit: e.target.value })} disabled={busy} aria-label="واحد">
                  {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                <ItemSelect items={data.items} value={m.target} onChange={(v) => setField(m.slug, { target: v })} disabled={busy} label={`مقصد ${m.label}`} />
                <RunStatus run={runs[m.slug]} lastRun={m.lastRun} />
                <div className="history-mapping-actions">
                  <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => preview(m)}>پیش‌نمایش</Button>
                  <Button size="sm" variant="secondary" icon={<Play size={14} />} disabled={busy || !m.target} onClick={() => run([m])}>بارگذاری</Button>
                  <button type="button" className="history-icon-btn" title="حذف نگاشت" onClick={() => removeMapping(m.slug)} disabled={busy}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {previews[m.slug] && (
                <Preview preview={previews[m.slug]} unit={m.unit} onApplyUnit={(u) => setField(m.slug, { unit: u })} />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="fintech-card history-section">
        <div className="history-section-head">
          <h3>تاریخچه‌ی ذخیره‌شده</h3>
          <span className="history-hint">{fa(data.history.length)} شناسه · {fa(orphans.length)} بی‌استفاده</span>
        </div>
        <p className="history-hint">شناسه‌ای که در دفتر قیمت نیست را هیچ کارت و نموداری نمی‌خواند: به مورد درست منتقلش کنید یا حذفش کنید.</p>
        <div className="history-toolbar">
          <SearchBar value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="جستجوی شناسه یا نام" />
          <label className="history-check">
            <input type="checkbox" checked={onlyOrphans} onChange={(e) => setOnlyOrphans(e.target.checked)} />
            فقط بی‌استفاده‌ها
          </label>
          <Button variant="secondary" icon={<Trash2 size={16} />} disabled={!orphans.length} onClick={deleteOrphans}>
            حذف همه‌ی بی‌استفاده‌ها ({fa(orphans.length)})
          </Button>
        </div>
        <div className="history-keys">
          {historyRows.map((h) => (
            <div key={h.key} className={`history-key ${h.inBook ? '' : 'is-orphan'}`}>
              <div className="history-mapping-name">
                <strong>{h.name || h.key}</strong>
                <small dir="ltr">{h.key}</small>
              </div>
              <span className="history-status">{fa(h.days)} روز · {faDate(h.first)} تا {faDate(h.last)}</span>
              {!h.inBook && <span className="history-status is-error">در دفتر قیمت نیست</span>}
              <div className="history-mapping-actions">
                {!h.inBook && (
                  <>
                    <ItemSelect items={data.items} value={moveTo[h.key] || ''} onChange={(v) => setMoveTo((p) => ({ ...p, [h.key]: v }))} label={`انتقال ${h.key}`} />
                    <Button size="sm" variant="secondary" icon={<ArrowLeftRight size={14} />} disabled={!moveTo[h.key]} onClick={() => moveKey(h)}>انتقال</Button>
                  </>
                )}
                <button type="button" className="history-icon-btn" title="حذف تاریخچه" onClick={() => deleteKey(h)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {!historyRows.length && !loading && <div className="history-empty">موردی نیست.</div>}
        </div>
      </section>
    </div>
  );
}
