/**
 * StatementQuestionsStep.jsx — Step two of the import: what the user is asked
 *
 * The rows are put in groups (ten deposits from one account, the purchases at one terminal, the
 * transfers to one person) and each group that is not obvious from the bank's own words is one
 * question — biggest first — already filled in with the best guess. «هزینه‌های کوچک» is one rule
 * for every small expense nobody was asked about. What is left unanswered is filled in from the
 * rows' own words, and every row can still be changed in the review.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Check, Sparkles } from 'lucide-react';
import DecisionEditor from './DecisionEditor.jsx';
import { faAmount, faDigits, shamsiDay, groupDecision } from './statementFormat.js';

/** Questions shown before «نمایش بیشتر» */
const PAGE = 15;

function GroupQuestion({ group, answers, onAnswer, onClear, accounts, categories }) {
  const [open, setOpen] = useState(false);
  const answered = Boolean(answers[group.key]);
  const decision = groupDecision(group, answers);
  const selfHint = group.suggestion.reason === 'own_name';
  return (
    <article className={`statement-question ${answered ? 'is-answered' : ''}`}>
      <header className="statement-question-head">
        <div>
          <strong dir="auto">{faDigits(group.label)}</strong>
          <span className="statement-chip">{group.kindLabel}</span>
          <span className={`statement-chip ${group.direction === 'credit' ? 'is-in' : 'is-out'}`}>{group.direction === 'credit' ? 'واریز' : 'برداشت'}</span>
        </div>
        <div className="statement-question-meta">
          <span>{faAmount(group.count)} تراکنش</span>
          <span>جمع {faAmount(group.total)} تومان</span>
          <span>{shamsiDay(group.firstDate)}{group.firstDate !== group.lastDate ? ` تا ${shamsiDay(group.lastDate)}` : ''}</span>
        </div>
      </header>
      {selfHint && <p className="statement-hint">نام روی این تراکنش‌ها نام خود شماست؛ اگر بین حساب‌های خودتان است، «انتقال» را بزنید و حساب مقابل را انتخاب کنید.</p>}
      <DecisionEditor
        id={`g-${group.key}`}
        direction={group.direction}
        value={decision}
        onChange={(value) => onAnswer(group.key, value)}
        accounts={accounts}
        categories={categories}
        titlePlaceholder={group.partyName ? `مثلاً: ${group.partyName}` : 'عنوان (اختیاری)'}
      />
      <div className="statement-question-foot">
        <button type="button" className="statement-link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} نمونه‌ی تراکنش‌ها
        </button>
        {answered ? (
          <button type="button" className="statement-link" onClick={() => onClear(group.key)}><Check size={14} /> پاسخ داده شد · بازگشت به پیشنهاد</button>
        ) : (
          <span className="statement-muted">{group.suggestion.confidence === 'none' ? 'پاسخی نداده‌اید؛ طبق قاعده‌ی هزینه‌های کوچک یا «سایر» ثبت می‌شود' : 'پیشنهاد خودکار از توضیحات'}</span>
        )}
      </div>
      {open && (
        <ul className="statement-samples">
          {group.samples.map((text, i) => <li key={i} dir="auto">{faDigits(text)}</li>)}
        </ul>
      )}
    </article>
  );
}

/**
 * @param {{ analysis: object, answers: object, small: object, onSmall: (s: object) => void,
 *   onAnswer: (key: string, d: object) => void, onClear: (key: string) => void, accounts: object[],
 *   categories: object }} props
 */
export default function StatementQuestionsStep({ analysis, answers, small, onSmall, onAnswer, onClear, accounts, categories }) {
  const [shown, setShown] = useState(PAGE);
  const { questions, automatic } = useMemo(() => {
    const asked = analysis.groups.filter((g) => g.needsAnswer && g.notable);
    // Not obvious first, then the biggest
    asked.sort((a, b) => (a.suggestion.confidence === 'none' ? 0 : 1) - (b.suggestion.confidence === 'none' ? 0 : 1) || b.total - a.total);
    return { questions: asked, automatic: analysis.groups.filter((g) => !g.needsAnswer) };
  }, [analysis]);
  const expenseList = categories.expense;

  return (
    <div className="statement-step">
      <section className="statement-small-rule">
        <h4><Sparkles size={16} /> هزینه‌های کوچک</h4>
        <p>برداشت‌هایی که نمی‌پرسم و تا این مبلغ هستند، همه با هم در یک دسته ثبت شوند؛ بقیه را در پایین می‌پرسم.</p>
        <label className="statement-check">
          <input type="checkbox" checked={small.enabled} onChange={(e) => onSmall({ ...small, enabled: e.target.checked })} />
          <span>فعال باشد</span>
        </label>
        {small.enabled && (
          <div className="statement-decision-fields">
            <label className="statement-field" htmlFor="small-max">
              <span>تا مبلغ (تومان)</span>
              <input
                id="small-max"
                className="statement-input"
                inputMode="numeric"
                value={faAmount(small.maxToman)}
                onChange={(e) => {
                  const digits = Number(String(e.target.value).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '')) || 0;
                  onSmall({ ...small, maxToman: digits });
                }}
              />
            </label>
            <label className="statement-field" htmlFor="small-category">
              <span>دسته</span>
              <select id="small-category" className="statement-select" value={small.category} onChange={(e) => onSmall({ ...small, category: e.target.value })}>
                {expenseList.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>

      <section>
        <h4>{questions.length ? `${faAmount(questions.length)} مورد را از شما می‌پرسم` : 'چیزی برای پرسیدن نیست'}</h4>
        <p className="statement-muted">هر مورد یک گروه تراکنش است (مثلاً همه‌ی واریزهای یک شماره حساب). جواب شما برای همه‌ی تراکنش‌های آن گروه اعمال می‌شود؛ جواب ندهید، از روی توضیحات خود تراکنش پر می‌شود.</p>
        <div className="statement-questions">
          {questions.slice(0, shown).map((group) => (
            <GroupQuestion key={group.key} group={group} answers={answers} onAnswer={onAnswer} onClear={onClear} accounts={accounts} categories={categories} />
          ))}
        </div>
        {questions.length > shown && (
          <button type="button" className="statement-more" onClick={() => setShown((n) => n + PAGE)}>نمایش بیشتر ({faAmount(questions.length - shown)} مورد دیگر)</button>
        )}
      </section>

      {automatic.length > 0 && (
        <section>
          <h4>خودکار دسته‌بندی شد</h4>
          <ul className="statement-auto-list">
            {automatic.map((g) => (
              <li key={g.key}><span>{g.kindLabel}</span><span className="statement-muted">{faAmount(g.count)} تراکنش · {faAmount(g.total)} تومان</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
