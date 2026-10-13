/**
 * StatementReviewStep.jsx — Step three of the import: every row, as it will be saved
 *
 * Nothing is stored until the user presses «ثبت» here. The rows are listed with what each becomes
 * (expense, income, transfer, left out), in tabs and a search; a row opens to change its type,
 * category, title or account, to save or leave it out, and to switch off the link to a loan
 * installment, cheque or subscription it was matched with. Rows already recorded are shown
 * apart and never saved twice.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Link2, AlertTriangle } from 'lucide-react';
import { FilterPills } from '../../../shared/ui/index.js';
import DecisionEditor from './DecisionEditor.jsx';
import { faAmount, faDigits, shamsiDay } from './statementFormat.js';

const PAGE = 60;

const STATUS_NOTE = {
  duplicate: 'قبلاً ثبت شده (همین فایل یا پیامک)',
  maybe_duplicate: 'احتمالاً قبلاً با دست ثبت شده (همان روز و مبلغ)',
  reversed: 'برگشت خورده؛ خرید و برگشتش همدیگر را خنثی می‌کنند',
};

const TABS = [
  { value: 'all', label: 'همه' },
  { value: 'expense', label: 'هزینه' },
  { value: 'income', label: 'درآمد' },
  { value: 'transfer', label: 'انتقال' },
  { value: 'check', label: 'نیاز به بررسی' },
  { value: 'left', label: 'کنار گذاشته' },
];

const actionLabel = (row) => (row.decision.action === 'expense' ? 'هزینه' : row.decision.action === 'income' ? 'درآمد' : row.decision.action === 'transfer' ? 'انتقال' : 'نادیده');

function matchesTab(row, tab) {
  if (tab === 'all') return true;
  if (tab === 'left') return !row.included;
  if (tab === 'check') return Boolean(row.issue) || row.status === 'maybe_duplicate' || (row.source === 'default' && row.status === 'new');
  return row.included && row.decision.action === tab;
}

function ReviewRow({ row, onOverride, onClearOverride, onInclude, onLink, accounts, categories }) {
  const [open, setOpen] = useState(false);
  const { tx, decision } = row;
  const credit = tx.direction === 'credit';
  const overridden = row.source === 'row';
  const canSave = row.status !== 'duplicate';
  return (
    <li className={`statement-row ${row.included ? '' : 'is-left'} ${row.issue ? 'has-issue' : ''}`}>
      <div className="statement-row-main">
        <input
          type="checkbox"
          aria-label={`ثبت شود: ${row.title}`}
          checked={row.included}
          disabled={!canSave || Boolean(row.issue)}
          onChange={(e) => onInclude(tx.id, e.target.checked)}
        />
        <button type="button" className="statement-row-body" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="statement-row-date">{shamsiDay(tx.date)}</span>
          <span className="statement-row-title" dir="auto">{row.title}</span>
          <span className={`statement-chip is-action-${decision.action}`}>{actionLabel(row)}</span>
          <span className={`statement-row-amount ${credit ? 'is-in' : 'is-out'}`}>{credit ? '+' : '−'}{faAmount(tx.amount)}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {(STATUS_NOTE[row.status] || row.issue || row.link) && (
        <p className={`statement-row-note ${row.issue ? 'is-error' : ''}`}>
          {row.issue ? <><AlertTriangle size={12} /> {row.issue}</> : STATUS_NOTE[row.status]}
          {row.link && <span className="statement-link-note"><Link2 size={12} /> وصل به {row.link.label}</span>}
        </p>
      )}
      {open && (
        <div className="statement-row-detail">
          <DecisionEditor
            id={`r-${tx.id}`}
            direction={tx.direction}
            value={decision}
            onChange={(value) => onOverride(tx.id, value)}
            accounts={accounts}
            categories={categories}
            titlePlaceholder={row.title}
          />
          <div className="statement-row-actions">
            {overridden && <button type="button" className="statement-link" onClick={() => onClearOverride(tx.id)}>بازگشت به حالت گروه</button>}
            {row.linkable && (
              <label className="statement-check">
                <input type="checkbox" checked={Boolean(row.link)} onChange={(e) => onLink(tx.id, e.target.checked)} />
                <span>وصل به بخش‌های برنامه (وام، چک، اشتراک)</span>
              </label>
            )}
          </div>
          <p className="statement-original" dir="auto">{faDigits(tx.description)}</p>
        </div>
      )}
    </li>
  );
}

/**
 * @param {{ plan: object[], summary: object, accounts: object[], categories: object,
 *   onOverride: Function, onClearOverride: Function, onInclude: Function, onIncludeMany: Function, onLink: Function }} props
 */
export default function StatementReviewStep({ plan, summary, accounts, categories, onOverride, onClearOverride, onInclude, onIncludeMany, onLink }) {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.value, plan.filter((r) => matchesTab(r, t.value)).length])), [plan]);
  const rows = useMemo(() => {
    const q = query.trim();
    return plan.filter((r) => matchesTab(r, tab) && (!q || r.title.includes(q) || r.tx.description.includes(q) || String(r.tx.amount).includes(q)));
  }, [plan, tab, query]);
  const pending = rows.filter((r) => !r.included && r.status !== 'duplicate' && !r.issue);

  return (
    <div className="statement-step">
      <div className="statement-tiles">
        <div className="statement-tile"><span>هزینه</span><strong>{faAmount(summary.expense.count)}</strong><small>{faAmount(summary.expense.total)} تومان</small></div>
        <div className="statement-tile"><span>درآمد</span><strong>{faAmount(summary.income.count)}</strong><small>{faAmount(summary.income.total)} تومان</small></div>
        <div className="statement-tile"><span>انتقال</span><strong>{faAmount(summary.transfer.count)}</strong><small>{faAmount(summary.transfer.total)} تومان</small></div>
        <div className="statement-tile is-muted"><span>ثبت نمی‌شود</span><strong>{faAmount(summary.duplicate + summary.maybeDuplicate + summary.reversed + summary.skipped)}</strong><small>تکراری، برگشتی یا ردشده</small></div>
      </div>
      {summary.issues > 0 && <p className="statement-row-note is-error"><AlertTriangle size={12} /> {faAmount(summary.issues)} ردیف حساب مقابل انتقال ندارد؛ در تب «نیاز به بررسی» حسابش را انتخاب کنید یا نوعش را عوض کنید.</p>}
      <FilterPills
        options={TABS.map((t) => ({ ...t, badge: faAmount(counts[t.value]) }))}
        activeValue={tab}
        onChange={(v) => { setTab(v); setShown(PAGE); }}
        size="sm"
      />
      <input
        className="statement-input statement-search"
        type="search"
        placeholder="جستجو در عنوان، توضیح یا مبلغ"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
        aria-label="جستجو"
      />
      {pending.length > 0 && tab === 'check' && (
        <button type="button" className="statement-more" onClick={() => onIncludeMany(pending.map((r) => r.tx.id), true)}>
          ثبت همه‌ی این {faAmount(pending.length)} ردیف
        </button>
      )}
      <ul className="statement-rows">
        {rows.slice(0, shown).map((row) => (
          <ReviewRow
            key={row.tx.id}
            row={row}
            accounts={accounts}
            categories={categories}
            onOverride={onOverride}
            onClearOverride={onClearOverride}
            onInclude={onInclude}
            onLink={onLink}
          />
        ))}
      </ul>
      {rows.length === 0 && <p className="statement-muted">ردیفی در این بخش نیست.</p>}
      {rows.length > shown && (
        <button type="button" className="statement-more" onClick={() => setShown((n) => n + PAGE)}>نمایش بیشتر ({faAmount(rows.length - shown)} ردیف دیگر)</button>
      )}
    </div>
  );
}
