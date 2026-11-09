/**
 * AskAnswer.jsx — The answer to a question about one's own spending or income: the figure, its
 * period, what makes it up (shared by the reports card and the AI assistant)
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React from 'react';
import { EmptyState } from '../../shared/ui/index.js';

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


/**
 * @param {{ answer: object, query: object, money: (n: number) => string }} props `money`: the amount formatter
 */
export default function AskAnswer({ answer, query, money }) {
  const headline = query.intent === 'count'
    ? { value: answer.count.toLocaleString(intlLocale()), unit: t('مورد') }
    : query.intent === 'average'
      ? { value: money(answer.average), unit: t('تومان در هر مورد') }
      : query.intent === 'top' && answer.top[0]
        ? { value: money(answer.top[0].amount), unit: `${t('تومان')} — ${answer.top[0].title}` }
        : { value: money(answer.total), unit: t('تومان') };
  if (answer.count === 0) {
    return <EmptyState title={t('موردی پیدا نشد')} description={t('در {period} چیزی با این شرایط ثبت نشده است.', { period: periodLabel(query.period) })} />;
  }
  return (
    <div className="ask-answer" role="status">
      <div className="ask-answer-head">
        <strong className="ask-answer-value">{headline.value}</strong>
        <span className="ask-answer-unit">{headline.unit}</span>
      </div>
      <p className="ask-answer-meta">
        {t('{period} · {count} مورد', { period: periodLabel(query.period), count: answer.count.toLocaleString(intlLocale()) })}
        {query.intent !== 'sum' && query.intent !== 'average' ? ` · ${t('جمع {amount} تومان', { amount: money(answer.total) })}` : ''}
      </p>
      {answer.byCategory.length > 1 && (
        <ul className="ask-list">
          {answer.byCategory.map((c) => <li key={c.category}><span>{c.label}</span><span>{money(c.total)}</span></li>)}
        </ul>
      )}
      <h4 className="ask-subtitle">{t('بزرگ‌ترین‌ها')}</h4>
      <ul className="ask-list">
        {answer.top.map((r) => (
          <li key={r.id}><span>{r.title} <small>{r.date}</small></span><span>{money(r.amount)}</span></li>
        ))}
      </ul>
    </div>
  );
}
