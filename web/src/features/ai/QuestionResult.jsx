/**
 * QuestionResult.jsx — The AI assistant's answer to a spoken question about one's own spending or
 * income: each sentence the assistant rewrote is answered on this device from the decrypted records
 * (reports/useAsk.js), so a comparison («خوراک این ماه با پارسال») is two figures one under the other
 */

import React, { useEffect } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { LoadErrorBanner, SkeletonRows } from '../../shared/ui/index.js';
import { useAsk } from '../reports/useAsk.js';
import AskAnswer from '../reports/AskAnswer.jsx';
import { formatAmount } from '../expenses/utils/format.js';

function OneQuestion({ question }) {
  const { state, answer, query, ask } = useAsk();
  // Asked once, when the card shows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { ask(question); }, [question]);
  return (
    <section className="ai-question">
      <h4 className="ai-question-text"><MessageCircleQuestion size={16} aria-hidden="true" />{question}</h4>
      {state.status === 'loading' && <SkeletonRows rows={2} columns={2} label={t('در حال یافتن پاسخ')} />}
      {state.status === 'error' && <LoadErrorBanner error={state.error} onRetry={() => ask(question)} />}
      {answer && <AskAnswer answer={answer} query={query} money={formatAmount} />}
    </section>
  );
}

/** @param {{ answer: { questions: string[] } }} props */
export default function QuestionResult({ answer }) {
  return (
    <div className="ai-questions">
      {answer.questions.map((q) => <OneQuestion key={q} question={q} />)}
    </div>
  );
}
