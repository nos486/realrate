/**
 * DatabaseCard.jsx — Which database the app runs on, moving the data from D1 to Postgres, and
 * deleting the KV keys the app no longer uses
 *
 * The move runs on the server in steps; this card keeps asking for the next one and shows where
 * it is: maintenance mode goes on (and every server has to see it), the tables are copied, then
 * compared. Only when every table's row count matches does the app switch to Postgres. Maintenance
 * mode stays on until the admin opens the site again, once the switch has reached every server.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Database, ArrowLeftRight, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getDatabaseStatus, runDatabaseMigrationStep, cleanupLegacyKv } from '../api/adminApi.js';

const TABLE_NAMES = {
  users: 'کاربران',
  sessions: 'نشست‌ها',
  settings: 'تنظیمات',
  portfolios: 'پورتفوها',
  portfolio_holdings: 'دارایی‌ها (قدیمی)',
  transactions: 'تراکنش‌ها (قدیمی)',
  loans: 'وام‌ها',
  custom_banks: 'بانک‌های سفارشی',
  loan_installment_states: 'اقساط',
  loan_extra_payments: 'پرداخت‌های اضافه',
  incomes: 'درآمدها',
  recurring_incomes: 'درآمدهای ثابت',
  cheques: 'چک‌ها',
  auth_tokens: 'لینک‌های تأیید',
  user_vaults: 'گاوصندوق‌ها',
  vault_records: 'رکوردهای رمزشده',
  user_activity: 'فعالیت روزانه',
};

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function phaseText(state, now) {
  if (!state) return '';
  switch (state.phase) {
    case 'waiting': {
      const left = Math.max(0, Math.ceil((state.copyAfter - now) / 1000));
      return `حالت توسعه فعال شد؛ ${fa(left)} ثانیه صبر تا همه سرورها آن را ببینند…`;
    }
    case 'copying': {
      const copied = Object.values(state.copied || {}).reduce((a, b) => a + b, 0);
      return `در حال کپی جدول ${fa(state.tableIndex + 1)} از ${fa(Object.keys(TABLE_NAMES).length)} — ${fa(copied)} ردیف تا اینجا`;
    }
    case 'failed':
      return state.error || 'انتقال کامل نشد.';
    default:
      return '';
  }
}

function CountsTable({ counts }) {
  if (!Array.isArray(counts) || counts.length === 0) return null;
  return (
    <table className="admin-db-counts">
      <thead>
        <tr><th>جدول</th><th>D1</th><th>Postgres</th></tr>
      </thead>
      <tbody>
        {counts.map((c) => (
          <tr key={c.table} className={c.match ? '' : 'is-mismatch'}>
            <td>{TABLE_NAMES[c.table] || c.table}</td>
            <td>{fa(c.d1)}</td>
            <td>{fa(c.postgres)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DatabaseCard({ settings, onSave }) {
  const { confirm, toast } = useFeedback();
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [kvBusy, setKvBusy] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    let alive = true;
    getDatabaseStatus()
      .then((res) => { if (alive) setStatus(res); })
      .catch((err) => toast.error(err.message || 'دریافت وضعیت پایگاه داده ناموفق بود.'));
    return () => {
      alive = false;
      stopRef.current = true;
    };
  }, [toast]);

  // A clock for the countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const migrate = async (restart = false) => {
    const ok = await confirm({
      title: 'انتقال به Postgres',
      message: 'سایت به حالت توسعه می‌رود (فقط مدیران دسترسی دارند)، همه داده‌ها از D1 به Postgres کپی و شمارش می‌شوند و اگر همه برابر بودند برنامه به Postgres سوییچ می‌کند. تا پایان کار این صفحه را باز نگه دارید.',
      confirmText: 'شروع انتقال',
    });
    if (!ok) return;
    setRunning(true);
    stopRef.current = false;
    let first = true;
    try {
      for (;;) {
        const res = await runDatabaseMigrationStep({ restart: restart && first });
        first = false;
        setStatus((prev) => ({ ...prev, backend: res.backend, state: res.state }));
        const phase = res.state?.phase;
        if (phase === 'done') {
          toast.success('داده‌ها منتقل شدند و برنامه روی Postgres است.');
          break;
        }
        if (phase === 'failed') {
          toast.error(res.state?.error || 'انتقال کامل نشد.');
          break;
        }
        if (stopRef.current) break;
        if (phase === 'waiting') await sleep(Math.min(5000, Math.max(1000, res.state.copyAfter - Date.now())));
      }
    } catch (err) {
      toast.error(err.message || 'انتقال با خطا متوقف شد؛ دوباره که بزنید از همان‌جا ادامه می‌دهد.');
    } finally {
      setRunning(false);
    }
  };

  const cleanupKv = async () => {
    const ok = await confirm({
      title: 'پاک‌سازی KV',
      message: 'کلیدهای قدیمی KV که برنامه دیگر از آن‌ها استفاده نمی‌کند (کپی‌های قدیمی قیمت‌ها و کش‌های منسوخ) حذف می‌شوند.',
      confirmText: 'حذف',
      danger: true,
    });
    if (!ok) return;
    setKvBusy(true);
    try {
      const res = await cleanupLegacyKv();
      toast.success(`${fa(res.deletedCount)} کلید قدیمی حذف شد.`);
    } catch (err) {
      toast.error(err.message || 'پاک‌سازی ناموفق بود.');
    } finally {
      setKvBusy(false);
    }
  };

  const onPostgres = status?.backend === 'postgres';
  const state = status?.state;
  const maintenanceOn = Number(settings?.maintenance_mode) === 1;
  const openIn = state?.safeToOpenAt ? Math.max(0, Math.ceil((state.safeToOpenAt - now) / 1000)) : 0;

  return (
    <div className="portfolio-stat-card admin-db-card">
      <div className="stat-header">
        <span className="stat-label">
          <Database size={14} /> پایگاه داده
        </span>
        <span className={`admin-db-badge ${onPostgres ? 'is-pg' : ''}`}>{status ? (onPostgres ? 'Postgres' : 'D1') : '…'}</span>
      </div>

      {onPostgres ? (
        <>
          <p className="admin-card-hint">
            <CheckCircle2 size={13} /> همه داده‌ها روی Postgres است.
          </p>
          {maintenanceOn && (
            <Button
              size="sm"
              disabled={openIn > 0}
              onClick={() => onSave({ maintenance_mode: false })}
            >
              {openIn > 0 ? `باز کردن سایت (${fa(openIn)} ثانیه)` : 'باز کردن سایت (خاموش کردن حالت توسعه)'}
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="admin-card-hint">
            داده‌ها هنوز روی D1 است. انتقال، داده‌ها را کپی و شمارش می‌کند و فقط اگر همه جدول‌ها برابر بودند سوییچ می‌کند.
          </p>
          <p className="admin-card-hint">
            پیش از شروع، کش کوئری Hyperdrive را خاموش کنید (دستورش در docs/SETUP.md است).
          </p>
          {state?.phase && state.phase !== 'done' && (
            <p className={`admin-card-hint ${state.phase === 'failed' ? 'is-error' : ''}`}>
              {state.phase === 'failed' && <AlertTriangle size={13} />} {phaseText(state, now)}
            </p>
          )}
          <Button
            size="sm"
            icon={<ArrowLeftRight size={14} />}
            loading={running}
            disabled={running}
            onClick={() => migrate(state?.phase === 'failed')}
          >
            {state?.phase === 'failed'
              ? 'انتقال دوباره'
              : state?.phase === 'waiting' || state?.phase === 'copying' ? 'ادامه انتقال' : 'انتقال به Postgres'}
          </Button>
        </>
      )}

      <CountsTable counts={state?.counts} />

      <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} loading={kvBusy} disabled={kvBusy} onClick={cleanupKv}>
        پاک‌سازی کلیدهای قدیمی KV
      </Button>
    </div>
  );
}
