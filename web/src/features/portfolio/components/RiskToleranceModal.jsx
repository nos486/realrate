/**
 * RiskToleranceModal.jsx — «آزمون ریسک‌پذیری» of a portfolio
 *
 * Steps: the amount at risk (the portfolio's value by default) → how the test works → one
 * question per ratio in RISK_RATIOS (a slider from 0 to the amount at risk; loss and gain update
 * live) → the result: a gauge with the score, the profile's description and the suggested mix.
 * Scoring, profiles and the mix are in utils/riskProfile.js (shared with the API); the result
 * is saved by the caller (useRiskProfile) and only the latest one is kept.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { Gauge, ArrowLeft, RotateCcw, PiggyBank, ChartColumn } from 'lucide-react';
import { AlertBanner, Button, Modal, NumericInput } from '../../../shared/ui/index.js';
import { formatThousands, toEnglishDigits } from '../../../shared/utils/formatters.js';
import RiskMixPie from './RiskMixPie.jsx';
import {
  RISK_RATIOS,
  RISK_PROFILES,
  RISK_SLIDER_STEPS,
  outcomeOf,
  profileOf,
  mixItemsOf,
  scoreRisk,
} from '../../../utils/riskProfile.js';

const fa = (n, digits = 0) => Number(n || 0).toLocaleString(intlLocale(), { maximumFractionDigits: digits });
const parseAmount = (text) => Math.round(Number(toEnglishDigits(String(text || '')).replace(/[,،\s]/g, '')) || 0); // i18n-ignore
const toman = (n) => t('{amount} تومان', { amount: fa(Math.round(n)) });

const GAUGE = { w: 240, h: 130, cx: 120, cy: 120, r: 100, thick: 26 };
const gaugePoint = (r, pct) => {
  const a = Math.PI * (1 - pct / 100);
  return [GAUGE.cx + r * Math.cos(a), GAUGE.cy - r * Math.sin(a)];
};

/** The result gauge: one arc per profile band, the needle at the score */
function RiskGauge({ score }) {
  const { cx, cy, r, thick, w, h } = GAUGE;
  const arc = (from, to) => {
    const [x1, y1] = gaugePoint(r, from);
    const [x2, y2] = gaugePoint(r, to);
    const [x3, y3] = gaugePoint(r - thick, to);
    const [x4, y4] = gaugePoint(r - thick, from);
    return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r - thick} ${r - thick} 0 0 0 ${x4} ${y4}Z`;
  };
  const [nx, ny] = gaugePoint(r - thick - 6, score);
  return (
    <svg className="risk-gauge" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t('درصد ریسک‌پذیری {pct}', { pct: fa(score, 1) })}>
      {RISK_PROFILES.map((p, i) => (
        <path key={p.id} d={arc(p.from + 0.6, p.to - 0.6)} className="risk-gauge-band" style={{ opacity: 0.25 + (0.75 * (i + 1)) / RISK_PROFILES.length }}>
          <title>{p.title}</title>
        </path>
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} className="risk-gauge-needle" />
      <circle cx={cx} cy={cy} r="7" className="risk-gauge-hub" />
    </svg>
  );
}

export default function RiskToleranceModal({ portfolioValue = 0, result = null, readOnly = false, onSave, onClose }) {
  const portfolioAmount = Math.round(Number(portfolioValue) || 0);
  const [step, setStep] = useState(result ? 'result' : 'intro'); // intro | guide | 0..5 | result
  const [answers, setAnswers] = useState([]); // confirmed amounts, one per question
  const [slider, setSlider] = useState(0); // 0..RISK_SLIDER_STEPS
  const [totalText, setTotalText] = useState(() => (portfolioAmount > 0 ? formatThousands(String(portfolioAmount)) : ''));
  const [done, setDone] = useState(result); // the result being shown
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The amount the test is about: the portfolio's value today unless the user sets another
  // (an empty portfolio has no value, so the user gives one)
  const total = parseAmount(totalText);
  const isQuestion = typeof step === 'number';

  const start = () => {
    setAnswers([]);
    setSlider(0);
    setError('');
    setStep('intro');
  };

  const confirmAnswer = async () => {
    const next = [...answers.slice(0, step), Math.round((total * slider) / RISK_SLIDER_STEPS)];
    setAnswers(next);
    setSlider(0);
    if (step < RISK_RATIOS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({ totalAsset: total, answers: next });
      setDone(saved);
      setStep('result');
    } catch (err) {
      setError(err?.message || t('ذخیرهٔ نتیجه ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (step === 0) setStep('guide');
    else {
      setSlider(Math.round(((answers[step - 1] || 0) / total) * RISK_SLIDER_STEPS));
      setStep(step - 1);
    }
  };

  const profile = done ? profileOf(done.score) : null;
  const mixItems = useMemo(() => (profile ? mixItemsOf(profile.allocation) : []), [profile]);

  let body;
  let footer;
  if (step === 'intro') {
    body = (
      <div className="risk-step">
        <h3 className="risk-heading">{t('چقدر ریسک‌پذیر هستید؟')}</h3>
        <p className="risk-text">{t('در هر سرمایه‌گذاری امکان زیان وجود دارد. برای انتخاب سبد مناسب باید سطح ریسک‌پذیری شما مشخص شود. با پاسخ به {count} سؤال کوتاه ریسک‌پذیری خود را بسنجید.', { count: fa(RISK_RATIOS.length) })}</p>
        <label className="risk-label" htmlFor="risk-total">
          {portfolioAmount > 0 ? t('دارایی‌ای که آزمون برای آن انجام می‌شود (پیش‌فرض: ارزش این پورتفو)') : t('این پورتفو خالی است؛ مبلغ دارایی‌ای که آزمون برای آن انجام می‌شود را وارد کنید')}
        </label>
        <NumericInput id="risk-total" value={totalText} onValueChange={setTotalText} placeholder={t('۰')} affix={t('تومان')} />
        {portfolioAmount > 0 && total !== portfolioAmount && (
          <button type="button" className="risk-link" onClick={() => setTotalText(formatThousands(String(portfolioAmount)))}>{t('برگشت به ارزش پورتفو ({amount})', { amount: toman(portfolioAmount) })}</button>
        )}
      </div>
    );
    footer = (
      <div className="modal-actions">
        {done && <Button variant="secondary" block onClick={() => setStep('result')}>{t('نتیجهٔ قبلی')}</Button>}
        <Button block disabled={!(total > 0)} onClick={() => setStep('guide')}>{t('شروع آزمون')}</Button>
      </div>
    );
  } else if (step === 'guide') {
    body = (
      <div className="risk-step">
        <h3 className="risk-heading">{t('دستورالعمل آزمون')}</h3>
        <p className="risk-text">
          {t('با کشیدن اسلایدر به چپ و راست مشخص کنید حاضرید چند درصد از دارایی خود را در هر موقعیت در معرض ریسک قرار دهید. در هر سؤال شانس سود و زیان ۵۰٪ است و فقط نسبت سود به زیان فرق می‌کند.')}
        </p>
        <div className="risk-guide-art" aria-hidden="true">
          <PiggyBank size={44} />
          <span className="risk-guide-line" />
          <ChartColumn size={44} />
        </div>
      </div>
    );
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block onClick={() => setStep('intro')}>{t('برگشت')}</Button>
        <Button block iconRight={<ArrowLeft size={16} />} onClick={() => { setSlider(0); setStep(0); }}>{t('فهمیدم! شروع کن')}</Button>
      </div>
    );
  } else if (isQuestion) {
    const ratio = RISK_RATIOS[step];
    const amount = Math.round((total * slider) / RISK_SLIDER_STEPS);
    const { loss, gain } = outcomeOf(amount, ratio);
    body = (
      <div className="risk-step">
        <div className="risk-progress">{t('سؤال {pct} از {count}', { pct: fa(step + 1), count: fa(RISK_RATIOS.length) })}</div>
        <h3 className="risk-heading">{t('میزان ریسک ۱ به {pct}', { pct: fa(ratio, 2) })}</h3>
        <p className="risk-text">
          {t('به ازای هر')}{' '}<strong className="risk-loss">{t('۱ تومان')}</strong>{' '}{t('ریسک می‌توانید')}{' '}<strong className="risk-gain">{t('{amount} تومان', { amount: fa(ratio, 2) })}</strong>{' '}{t('سود کنید. احتمال سود ۵۰٪ و احتمال زیان ۵۰٪ است. با اسلایدر میزان ریسک خود را تعیین کنید.')}
        </p>
        <input
          type="range" dir="ltr" className="risk-slider" min="0" max={RISK_SLIDER_STEPS} step="1"
          value={slider} aria-label={t('میزان ریسک')} onChange={(e) => setSlider(Number(e.target.value))}
        />
        <p className="risk-outcome">
          {t('حاضرم')}{' '}<strong className="risk-loss">{toman(loss)}</strong>{' '}{t('زیان را بپذیرم تا شانس')}{' '}
          <strong className="risk-gain">{toman(gain)}</strong>{' '}{t('سود داشته باشم.')}
        </p>
        {error && <AlertBanner type="error" message={error} />}
      </div>
    );
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block disabled={saving} onClick={back}>{t('برگشت')}</Button>
        <Button block loading={saving} onClick={confirmAnswer}>{step === RISK_RATIOS.length - 1 ? t('تأیید و نتیجه') : t('تأیید و بعدی')}</Button>
      </div>
    );
  } else {
    const score = done?.score ?? scoreRisk(answers, total);
    body = (
      <div className="risk-step risk-result">
        <h3 className="risk-heading">{t('نتیجهٔ آزمون')}</h3>
        <RiskGauge score={score} />
        <div className="risk-score">{t('درصد ریسک‌پذیری شما:')}{' '}<strong>{t('{pct}٪', { pct: fa(score, 1) })}</strong></div>
        <h4 className="risk-profile-title">{profile.title}</h4>
        <p className="risk-text">{profile.text}</p>
        <h4 className="risk-subtitle">{t('ترکیب پیشنهادی برای این سطح')}</h4>
        <RiskMixPie items={mixItems} />
        <p className="risk-note">{t('این ترکیب فقط یک راهنمای آموزشی بر پایهٔ پاسخ‌های شماست و توصیهٔ سرمایه‌گذاری نیست.')}</p>
      </div>
    );
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block onClick={onClose}>{t('بستن')}</Button>
        {!readOnly && <Button block icon={<RotateCcw size={15} />} onClick={start}>{t('از نو')}</Button>}
      </div>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={t('آزمون ریسک‌پذیری')} icon={<Gauge size={18} />} maxWidth="520px" footer={footer}>
      {body}
    </Modal>
  );
}
