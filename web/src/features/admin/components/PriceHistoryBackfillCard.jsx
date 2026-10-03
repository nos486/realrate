/**
 * PriceHistoryBackfillCard.jsx — Fill the dollar's past days (2 years) in the price history from
 * tgju, so charts start with years of data. Days already recorded are kept unless "replace" is on.
 */

import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { backfillPriceHistory } from '../api/adminApi.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

export default function PriceHistoryBackfillCard() {
  const { toast } = useFeedback();
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await backfillPriceHistory({ key: 'usd', days: 730, overwrite });
      setResult(res);
      toast.success(`${fa(res.written)} روز در تاریخچه‌ی دلار ثبت شد`);
    } catch (err) {
      toast.error(err?.message || 'بارگذاری تاریخچه انجام نشد');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portfolio-stat-card">
      <div className="stat-header">
        <span className="stat-label">
          <History size={14} /> تاریخچه‌ی قیمت دلار
        </span>
      </div>
      <p className="admin-card-hint">
        قیمت روزانه‌ی دلار آزاد (باز، بیشترین، کمترین، پایانی) در ۲ سال گذشته از tgju گرفته و در تاریخچه ثبت می‌شود.
      </p>
      <label className="admin-card-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        روزهایی که قبلاً ثبت شده‌اند هم با داده‌ی tgju جایگزین شوند
      </label>
      <Button size="sm" variant="secondary" icon={<History size={14} />} loading={busy} disabled={busy} onClick={run}>
        بارگذاری ۲ سال گذشته
      </Button>
      {result && (
        <p className="admin-card-hint">
          {fa(result.fetched)} ردیف خوانده شد، {fa(result.written)} روز ثبت شد
          {result.from && ` (از ${new Date(result.from).toLocaleDateString('fa-IR')} تا ${new Date(result.to).toLocaleDateString('fa-IR')})`}
        </p>
      )}
    </div>
  );
}
