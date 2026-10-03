/**
 * PriceHistoryBackfillCard.jsx — Fill the past 2 years of daily prices (candles) from tgju: the
 * dollar, gold, coins, the ounces and currencies — one item, or all of them in turn (the dollar
 * first: dollar-priced items are converted with its history). Days already recorded are kept
 * unless "replace" is on.
 */

import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { backfillPriceHistory, getPriceHistoryBackfillSources } from '../api/adminApi.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const faDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fa-IR');

export default function PriceHistoryBackfillCard() {
  const { toast } = useFeedback();
  const [sources, setSources] = useState([]);
  const [key, setKey] = useState('usd');
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState({});

  useEffect(() => {
    getPriceHistoryBackfillSources()
      .then((res) => setSources(Array.isArray(res?.sources) ? res.sources : []))
      .catch(() => setSources([]));
  }, []);

  const runOne = async (k) => {
    setResults((prev) => ({ ...prev, [k]: { running: true } }));
    try {
      const res = await backfillPriceHistory({ key: k, days: 730, overwrite });
      setResults((prev) => ({ ...prev, [k]: res }));
      return true;
    } catch (err) {
      setResults((prev) => ({ ...prev, [k]: { error: err?.message || 'انجام نشد' } }));
      return false;
    }
  };

  const run = async (keys) => {
    setBusy(true);
    let ok = 0;
    for (const k of keys) if (await runOne(k)) ok += 1;
    setBusy(false);
    if (ok === keys.length) toast.success('تاریخچه بارگذاری شد');
    else toast.error(`${fa(keys.length - ok)} مورد انجام نشد`);
  };

  const labelOf = (k) => sources.find((s) => s.key === k)?.label || k;

  return (
    <div className="portfolio-stat-card">
      <div className="stat-header">
        <span className="stat-label">
          <History size={14} /> تاریخچه‌ی قیمت‌ها از tgju
        </span>
      </div>
      <p className="admin-card-hint">
        قیمت روزانه (باز، بیشترین، کمترین، پایانی) در ۲ سال گذشته از tgju گرفته و در تاریخچه ثبت می‌شود. دلار را اول
        بارگذاری کنید؛ انس‌ها با تاریخچه‌ی دلار به تومان تبدیل می‌شوند.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={key} onChange={(e) => setKey(e.target.value)} disabled={busy || !sources.length} aria-label="مورد">
          {sources.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" icon={<History size={14} />} loading={busy} disabled={busy || !sources.length} onClick={() => run([key])}>
          بارگذاری
        </Button>
        <Button size="sm" variant="secondary" disabled={busy || !sources.length} onClick={() => run(sources.map((s) => s.key))}>
          همه
        </Button>
      </div>
      <label className="admin-card-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        روزهایی که قبلاً ثبت شده‌اند هم با داده‌ی tgju جایگزین شوند
      </label>
      {Object.keys(results).length > 0 && (
        <ul className="admin-card-hint" style={{ margin: 0, paddingInlineStart: 18 }}>
          {Object.entries(results).map(([k, r]) => (
            <li key={k}>
              <strong>{labelOf(k)}</strong>:{' '}
              {r.running
                ? 'در حال بارگذاری…'
                : r.error
                  ? <span style={{ color: 'var(--color-negative)' }}>{r.error}</span>
                  : `${fa(r.written)} روز ثبت شد از ${fa(r.fetched)} ردیف${r.from ? ` (${faDate(r.from)} تا ${faDate(r.to)})` : ''}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
