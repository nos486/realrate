/**
 * AskCard.jsx — «از داده‌هایت بپرس»: type a question about your spending or income in plain
 * Persian and get the figure, with what makes it up
 *
 * The question is read by rules (askQuery.js) and answered from the records of the question's
 * period, loaded and decrypted here — nothing is sent anywhere. Everyday expenses and incomes
 * only (what the reports count); a category set apart from the totals counts when named. The
 * rules read Persian, so the card is shown in the Persian version only.
 */

import { intlLocale, getLocale, t } from '../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { Button, EmptyState, LoadErrorBanner, SkeletonRows } from '../../shared/ui/index.js';
import TextField from '../../shared/ui/TextField.jsx';
import ReportCard from './ReportCard.jsx';
import { getCategory, isExcludedCategory } from '../../shared/categories/categoryStore.js';
import { getExpenseGroups, getExpenses } from '../../shared/vault/vaultExpenses.js';
import { getIncomes } from '../../shared/vault/vaultIncomes.js';
import { expenseInToman } from '../../utils/expenseDocument.js';
import { incomeInToman } from '../../utils/incomeDocument.js';
import { todayIso } from '../../shared/utils/dates.js';
import { usePricing } from '../market/index.js';
import { useUsdAt } from '../market/dailyHistory.js';
import { useFxRates } from '../market/useFxRates.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { parseQuestion, answerQuestion } from './askQuery.js';

const EXAMPLES = [
  'خرج رستوران سه ماه اخیر', // i18n-ignore
  'درآمد امسال', // i18n-ignore
  'بیشترین خرج ماه قبل', // i18n-ignore
  'چند بار تاکسی گرفتم این ماه', // i18n-ignore
];


/** The period as a short phrase */
function periodLabel({ key, params = {} }) {
  switch (key) {
    case 'today': return t('امروز');
    case 'yesterday': return t('دیروز');
    case 'weeks': return params.n > 1 ? t('{n} هفته‌ی اخیر', { n: params.n }) : t('هفته‌ی اخیر');
    case 'months': return t('{n} ماه اخیر', { n: params.n });
    case 'month': return params.year ? `${params.month} ${params.year}` : params.month;
    case 'year': return t('سال {year}', { year: String(params.year) });
    default: return t('این ماه');
  }
}

/** Load the question's period: everyday expenses or incomes */
async function loadRecords(query) {
  const { from, to } = query.period;
  if (query.kind === 'income') return (await getIncomes({ from, to })).incomes;
  const { groups } = await getExpenseGroups();
  const daily = groups.find((g) => g.type === 'daily');
  return daily ? (await getExpenses({ parent: daily.id, from, to })).expenses : [];
}

export default function AskCard({ f }) {
  const [text, setText] = useState('');
  const [state, setState] = useState({ status: 'idle', query: null, records: [], error: '' });
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(true);
  const fx = useFxRates(state.records);
  const rates = useMemo(() => ({ usdToman, usdAt, ...fx }), [usdToman, usdAt, fx]);
  const expenseCats = useCategories('expense', { includeHidden: true });
  const incomeCats = useCategories('income', { includeHidden: true });

  const ask = async (question) => {
    const q = String(question ?? text).trim();
    if (!q) return;
    setText(q);
    const query = parseQuestion(q, { today: todayIso(), categories: { expense: expenseCats, income: incomeCats } });
    setState({ status: 'loading', query, records: [], error: '' });
    try {
      setState({ status: 'done', query, records: await loadRecords(query), error: '' });
    } catch (err) {
      setState({ status: 'error', query, records: [], error: err?.message || t('خطا در بارگذاری داده‌ها') });
    }
  };

  const { query } = state;
  const answer = useMemo(() => {
    if (state.status !== 'done') return null;
    const kind = query.kind;
    return answerQuestion(query, state.records, {
      toToman: (r) => (kind === 'income' ? incomeInToman(r, rates) : expenseInToman(r, rates)),
      isExcluded: (c) => isExcludedCategory(kind, c),
      labelOf: (c) => getCategory(kind, c).label,
    });
  }, [state.status, state.records, query, rates]);

  if (getLocale() !== 'fa') return null;

  const headline = answer && (query.intent === 'count'
    ? { value: answer.count.toLocaleString(intlLocale()), unit: t('مورد') }
    : query.intent === 'average'
      ? { value: f.money(answer.average), unit: t('تومان در هر مورد') }
      : query.intent === 'top' && answer.top[0]
        ? { value: f.money(answer.top[0].amount), unit: `${t('تومان')} — ${answer.top[0].title}` }
        : { value: f.money(answer.total), unit: t('تومان') });

  return (
    <ReportCard title={t('از داده‌هایت بپرس')} Icon={MessageCircleQuestion} span="span-12" className="ask-card">
      <p className="report-footnote">{t('به فارسی بپرس؛ پاسخ فقط روی دستگاه تو، از داده‌های رمزنگاری‌شده‌ات ساخته می‌شود.')}</p>
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <TextField
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('مثلاً: خرج رستوران سه ماه اخیر')}
          aria-label={t('پرسش')}
        />
        <Button type="submit" icon={<Send size={16} />} loading={state.status === 'loading'} disabled={!text.trim()}>{t('بپرس')}</Button>
      </form>
      <div className="ask-examples">
        {EXAMPLES.map((ex) => <button type="button" key={ex} className="ask-example" onClick={() => ask(ex)}>{ex}</button>)}
      </div>

      {state.status === 'loading' && <SkeletonRows rows={3} columns={2} label={t('در حال یافتن پاسخ')} />}
      {state.status === 'error' && <LoadErrorBanner error={state.error} onRetry={() => ask(text)} />}
      {answer && (answer.count === 0 ? (
        <EmptyState title={t('موردی پیدا نشد')} description={t('در {period} چیزی با این شرایط ثبت نشده است.', { period: periodLabel(query.period) })} />
      ) : (
        <div className="ask-answer" role="status">
          <div className="ask-answer-head">
            <strong className="ask-answer-value">{headline.value}</strong>
            <span className="ask-answer-unit">{headline.unit}</span>
          </div>
          <p className="ask-answer-meta">
            {t('{period} · {count} مورد', { period: periodLabel(query.period), count: answer.count.toLocaleString(intlLocale()) })}
            {query.intent !== 'sum' && query.intent !== 'average' ? ` · ${t('جمع {amount} تومان', { amount: f.money(answer.total) })}` : ''}
          </p>
          {answer.byCategory.length > 1 && (
            <ul className="ask-list">
              {answer.byCategory.map((c) => <li key={c.category}><span>{c.label}</span><span>{f.money(c.total)}</span></li>)}
            </ul>
          )}
          <h4 className="ask-subtitle">{t('بزرگ‌ترین‌ها')}</h4>
          <ul className="ask-list">
            {answer.top.map((r) => (
              <li key={r.id}><span>{r.title} <small>{r.date}</small></span><span>{f.money(r.amount)}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </ReportCard>
  );
}
