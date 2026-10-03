/**
 * PriceHistoryBackfillCard.jsx — The daily price history: fill past years from tgju, and see /
 * fix what it holds
 *
 * Each tgju series is written to a price book item the admin picks (the list is the live book,
 * so history never lands under an id no card reads); the suggested item is preselected when the
 * book has it. "All" runs the chosen rows in turn, the dollar first (the ounces are converted
 * with its history). Below, every id in the history with its days; an id the book doesn't know
 * can be moved to a book item or deleted.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Trash2, ArrowLeftRight } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { backfillPriceHistory, getPriceHistoryAdmin, deletePriceHistoryKey, movePriceHistoryKey } from '../api/adminApi.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const faDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('fa-IR') : '-');
const rowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

function ItemSelect({ items, value, onChange, disabled, label }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label} style={{ maxWidth: 220 }}>
      <option value="">— انتخاب مورد —</option>
      {items.map((it) => (
        <option key={it.id} value={it.id}>{it.name} ({it.id})</option>
      ))}
    </select>
  );
}

export default function PriceHistoryBackfillCard() {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState({ sources: [], items: [], history: [] });
  const [targets, setTargets] = useState({});
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState({});
  const [moveTo, setMoveTo] = useState({});

  const load = useCallback(() => {
    getPriceHistoryAdmin()
      .then((res) => {
        const next = { sources: res?.sources || [], items: res?.items || [], history: res?.history || [] };
        setData(next);
        const ids = new Set(next.items.map((it) => it.id));
        setTargets((prev) => {
          const t = { ...prev };
          for (const s of next.sources) if (t[s.id] === undefined) t[s.id] = ids.has(s.suggest) ? s.suggest : '';
          return t;
        });
      })
      .catch((err) => toast.error(err?.message || 'خواندن تاریخچه انجام نشد'));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const itemName = useMemo(() => new Map(data.items.map((it) => [it.id, it.name])), [data.items]);
  const usdSource = data.sources.find((s) => s.id === 'price_dollar_rl');

  const runOne = async (source) => {
    const target = targets[source.id];
    if (!target) return true;
    setResults((prev) => ({ ...prev, [source.id]: { running: true } }));
    try {
      const res = await backfillPriceHistory({ source: source.id, target, usdTarget: targets.price_dollar_rl || 'usd', days: 730, overwrite });
      setResults((prev) => ({ ...prev, [source.id]: res }));
      return true;
    } catch (err) {
      setResults((prev) => ({ ...prev, [source.id]: { error: err?.message || 'انجام نشد' } }));
      return false;
    }
  };

  const run = async (sources) => {
    setBusy(true);
    let failed = 0;
    for (const s of sources) if (!(await runOne(s))) failed += 1;
    setBusy(false);
    load();
    if (failed) toast.error(`${fa(failed)} مورد انجام نشد`);
    else toast.success('تاریخچه بارگذاری شد');
  };

  const removeKey = async (key) => {
    if (!(await confirm({ title: 'حذف تاریخچه', message: `همه‌ی روزهای «${key}» حذف شود؟`, danger: true }))) return;
    try {
      const res = await deletePriceHistoryKey(key);
      setData((prev) => ({ ...prev, history: res.history || prev.history }));
      toast.success(`${fa(res.deleted)} روز حذف شد`);
    } catch (err) {
      toast.error(err?.message || 'حذف انجام نشد');
    }
  };

  const moveKey = async (key) => {
    const to = moveTo[key];
    if (!to) return;
    try {
      const res = await movePriceHistoryKey(key, to);
      setData((prev) => ({ ...prev, history: res.history || prev.history }));
      toast.success(`${fa(res.moved)} روز به «${itemName.get(to) || to}» منتقل شد`);
    } catch (err) {
      toast.error(err?.message || 'انتقال انجام نشد');
    }
  };

  // The dollar first: the ounces are converted with its history
  const ordered = usdSource ? [usdSource, ...data.sources.filter((s) => s !== usdSource)] : data.sources;

  return (
    <div className="portfolio-stat-card">
      <div className="stat-header">
        <span className="stat-label">
          <History size={14} /> تاریخچه‌ی قیمت‌ها
        </span>
      </div>
      <p className="admin-card-hint">
        قیمت روزانه‌ی ۲ سال گذشته از tgju. برای هر سری، موردی از دفتر قیمت را که باید پر شود انتخاب کنید (خالی = رد
        می‌شود). دلار اول اجرا می‌شود؛ انس‌ها با تاریخچه‌ی دلار به تومان تبدیل می‌شوند.
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {ordered.map((s) => {
          const r = results[s.id];
          return (
            <div key={s.id} style={rowStyle}>
              <span style={{ minWidth: 140 }}>{s.label}</span>
              <ItemSelect
                items={data.items}
                value={targets[s.id] || ''}
                disabled={busy}
                label={`مقصد ${s.label}`}
                onChange={(v) => setTargets((prev) => ({ ...prev, [s.id]: v }))}
              />
              <Button size="sm" variant="secondary" disabled={busy || !targets[s.id]} onClick={() => run([s])}>
                بارگذاری
              </Button>
              {r && (
                <small style={{ color: r.error ? 'var(--color-negative)' : 'var(--text-muted)' }}>
                  {r.running ? 'در حال بارگذاری…' : r.error || `${fa(r.written)} روز ثبت شد (${faDate(r.from)} تا ${faDate(r.to)})`}
                </small>
              )}
            </div>
          );
        })}
      </div>
      <label className="admin-card-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        روزهایی که قبلاً ثبت شده‌اند هم با داده‌ی tgju جایگزین شوند
      </label>
      <Button size="sm" variant="secondary" icon={<History size={14} />} loading={busy} disabled={busy || !ordered.some((s) => targets[s.id])} onClick={() => run(ordered)}>
        بارگذاری همه‌ی موارد انتخاب‌شده
      </Button>

      <div className="stat-header" style={{ marginTop: 12 }}>
        <span className="stat-label">آنچه در تاریخچه هست</span>
      </div>
      <p className="admin-card-hint">شناسه‌ای که در دفتر قیمت نیست را هیچ کارتی نمی‌خواند: آن را به مورد درست منتقل یا حذف کنید.</p>
      <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflow: 'auto' }}>
        {data.history.map((h) => (
          <div key={h.key} style={rowStyle}>
            <span style={{ minWidth: 140 }}>
              <strong>{h.name || h.key}</strong> <small dir="ltr">{h.key}</small>
              {!h.inBook && <small style={{ color: 'var(--color-negative)' }}> · در دفتر قیمت نیست</small>}
            </span>
            <small style={{ color: 'var(--text-muted)' }}>{fa(h.days)} روز · {faDate(h.first)} تا {faDate(h.last)}</small>
            {!h.inBook && (
              <>
                <ItemSelect
                  items={data.items}
                  value={moveTo[h.key] || ''}
                  label={`انتقال ${h.key}`}
                  onChange={(v) => setMoveTo((prev) => ({ ...prev, [h.key]: v }))}
                />
                <Button size="sm" variant="secondary" icon={<ArrowLeftRight size={14} />} disabled={!moveTo[h.key]} onClick={() => moveKey(h.key)}>
                  انتقال
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => removeKey(h.key)}>
              حذف
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
