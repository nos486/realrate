/**
 * AskCard.jsx — «از داده‌هایت بپرس»: type a question about your spending or income in plain
 * Persian and get the figure, with what makes it up
 *
 * The question is read by rules (askQuery.js) and answered from the records of the question's
 * period, loaded and decrypted here (useAsk.js) — nothing is sent anywhere. Everyday expenses and
 * incomes only (what the reports count); a category set apart from the totals counts when named.
 * The rules read Persian, so the card is shown in the Persian version only.
 */

import { getLocale, t } from '../../utils/i18n.js';
import React, { useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { Button, LoadErrorBanner, SkeletonRows } from '../../shared/ui/index.js';
import TextField from '../../shared/ui/TextField.jsx';
import ReportCard from './ReportCard.jsx';
import AskAnswer from './AskAnswer.jsx';
import { useAsk } from './useAsk.js';

const EXAMPLES = [
  'خرج رستوران سه ماه اخیر', // i18n-ignore
  'درآمد امسال', // i18n-ignore
  'بیشترین خرج ماه قبل', // i18n-ignore
  'چند بار تاکسی گرفتم این ماه', // i18n-ignore
];

export default function AskCard({ f }) {
  const [text, setText] = useState('');
  const { state, answer, query, ask: run } = useAsk();

  const ask = (question) => {
    const q = String(question ?? text).trim();
    if (!q) return;
    setText(q);
    run(q);
  };

  if (getLocale() !== 'fa') return null;

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
      {answer && <AskAnswer answer={answer} query={query} money={f.money} />}
    </ReportCard>
  );
}
