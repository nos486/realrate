/**
 * RiskToleranceModal.jsx — «آزمون ریسک‌پذیری» of a portfolio
 *
 * Steps: the amount at risk (the portfolio's value by default) → how the test works → one
 * question per ratio in RISK_RATIOS (a slider from 0 to the amount at risk; loss and gain update
 * live) → the result: a gauge with the score, the profile's description and the suggested mix.
 * Scoring, profiles and the mix are in utils/riskProfile.js (shared with the API); the result
 * is saved by the caller (useRiskProfile) and only the latest one is kept.
 */

import React, { useMemo, useState } from 'react';
import { Gauge, ArrowLeft, RotateCcw, PiggyBank, ChartColumn } from 'lucide-react';
import { AlertBanner, Button, Modal, NumericInput } from '../../../shared/ui/index.js';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../../../shared/ui/chartColors.js';
import { formatThousands, toEnglishDigits } from '../../../shared/utils/formatters.js';
import {
  RISK_RATIOS,
  RISK_PROFILES,
  RISK_SLIDER_STEPS,
  RISK_ASSET_CLASSES,
  outcomeOf,
  profileOf,
  scoreRisk,
} from '../../../utils/riskProfile.js';

const fa = (n, digits = 0) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: digits });
const toman = (n) => `${fa(Math.round(n))} تومان`;
const parseAmount = (text) => Math.round(Number(toEnglishDigits(String(text || '')).replace(/[,،\s]/g, '')) || 0);

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
    <svg className="risk-gauge" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`درصد ریسک‌پذیری ${fa(score, 1)}`}>
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

const PIE = { size: 120, r: 54 };

/** The suggested mix: a pie with a legend (shares are percents) */
function RiskMixPie({ items }) {
  const c = PIE.size / 2;
  const shown = items.filter((i) => i.value > 0);
  const slices = shown.map((item, i) => {
    const before = shown.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      ...item,
      start: (before / 100) * Math.PI * 2,
      end: ((before + item.value) / 100) * Math.PI * 2,
      color: CHART_COLORS[i] || CHART_OTHER_COLOR,
    };
  });
  const pt = (a) => [c + PIE.r * Math.sin(a), c - PIE.r * Math.cos(a)];
  const path = (s) => {
    if (s.end - s.start >= Math.PI * 2 - 1e-6) return `M${c} ${c - PIE.r}A${PIE.r} ${PIE.r} 0 1 1 ${c - 0.01} ${c - PIE.r}Z`;
    const [x1, y1] = pt(s.start);
    const [x2, y2] = pt(s.end);
    return `M${c} ${c}L${x1} ${y1}A${PIE.r} ${PIE.r} 0 ${s.end - s.start > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`;
  };
  return (
    <div className="risk-mix">
      <svg width={PIE.size} height={PIE.size} viewBox={`0 0 ${PIE.size} ${PIE.size}`} role="img" aria-label="ترکیب پیشنهادی">
        {slices.map((s) => <path key={s.key} d={path(s)} fill={s.color}><title>{`${s.label}: ${fa(s.value)}٪`}</title></path>)}
      </svg>
      <ul className="risk-mix-legend">
        {slices.map((s) => (
          <li key={s.key}><i style={{ background: s.color }} /> {s.label} <strong>{fa(s.value)}٪</strong></li>
        ))}
      </ul>
    </div>
  );
}

export default function RiskToleranceModal({ portfolioValue = 0, result = null, readOnly = false, onSave, onClose }) {
  const [step, setStep] = useState(result ? 'result' : 'intro'); // intro | guide | 0..5 | result
  const [totalText, setTotalText] = useState(() => formatThousands(String(Math.round(result?.totalAsset || portfolioValue || 0) || '')));
  const [answers, setAnswers] = useState([]); // confirmed amounts, one per question
  const [slider, setSlider] = useState(0); // 0..RISK_SLIDER_STEPS
  const [done, setDone] = useState(result); // the result being shown
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      setError(err?.message || 'ذخیرهٔ نتیجه ناموفق بود.');
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
  const mixItems = useMemo(
    () => (profile ? Object.entries(profile.allocation).map(([key, value]) => ({ key, label: RISK_ASSET_CLASSES[key] || key, value })) : []),
    [profile]
  );

  let body;
  let footer;
  if (step === 'intro') {
    body = (
      <div className="risk-step">
        <h3 className="risk-heading">چقدر ریسک‌پذیر هستید؟</h3>
        <p className="risk-text">
          در هر سرمایه‌گذاری امکان زیان وجود دارد. برای انتخاب سبد مناسب باید سطح ریسک‌پذیری شما مشخص شود.
          با پاسخ به {fa(RISK_RATIOS.length)} سؤال کوتاه ریسک‌پذیری خود را بسنجید.
        </p>
        <label className="risk-label" htmlFor="risk-total">مبلغ دارایی‌ای که آزمون برای آن انجام می‌شود</label>
        <NumericInput id="risk-total" value={totalText} onValueChange={setTotalText} placeholder="۰" affix="تومان" />
        {portfolioValue > 0 && total !== Math.round(portfolioValue) && (
          <button type="button" className="risk-link" onClick={() => setTotalText(formatThousands(String(Math.round(portfolioValue))))}>
            استفاده از ارزش فعلی پورتفو ({toman(portfolioValue)})
          </button>
        )}
      </div>
    );
    footer = (
      <div className="modal-actions">
        {done && <Button variant="secondary" block onClick={() => setStep('result')}>نتیجهٔ قبلی</Button>}
        <Button block disabled={!(total > 0)} onClick={() => setStep('guide')}>شروع آزمون</Button>
      </div>
    );
  } else if (step === 'guide') {
    body = (
      <div className="risk-step">
        <h3 className="risk-heading">دستورالعمل آزمون</h3>
        <p className="risk-text">
          با کشیدن اسلایدر به چپ و راست مشخص کنید حاضرید چند درصد از دارایی خود را در هر موقعیت در معرض ریسک قرار دهید.
          در هر سؤال شانس سود و زیان ۵۰٪ است و فقط نسبت سود به زیان فرق می‌کند.
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
        <Button variant="secondary" block onClick={() => setStep('intro')}>برگشت</Button>
        <Button block iconRight={<ArrowLeft size={16} />} onClick={() => { setSlider(0); setStep(0); }}>فهمیدم! شروع کن</Button>
      </div>
    );
  } else if (isQuestion) {
    const ratio = RISK_RATIOS[step];
    const amount = Math.round((total * slider) / RISK_SLIDER_STEPS);
    const { loss, gain } = outcomeOf(amount, ratio);
    body = (
      <div className="risk-step">
        <div className="risk-progress">سؤال {fa(step + 1)} از {fa(RISK_RATIOS.length)}</div>
        <h3 className="risk-heading">میزان ریسک ۱ به {fa(ratio, 2)}</h3>
        <p className="risk-text">
          به ازای هر <strong className="risk-loss">۱ تومان</strong> ریسک می‌توانید <strong className="risk-gain">{fa(ratio, 2)} تومان</strong> سود کنید.
          احتمال سود ۵۰٪ و احتمال زیان ۵۰٪ است. با اسلایدر میزان ریسک خود را تعیین کنید.
        </p>
        <input
          type="range" dir="ltr" className="risk-slider" min="0" max={RISK_SLIDER_STEPS} step="1"
          value={slider} aria-label="میزان ریسک" onChange={(e) => setSlider(Number(e.target.value))}
        />
        <p className="risk-outcome">
          حاضرم <strong className="risk-loss">{toman(loss)}</strong> زیان را بپذیرم تا شانس{' '}
          <strong className="risk-gain">{toman(gain)}</strong> سود داشته باشم.
        </p>
        {error && <AlertBanner type="error" message={error} />}
      </div>
    );
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block disabled={saving} onClick={back}>برگشت</Button>
        <Button block loading={saving} onClick={confirmAnswer}>{step === RISK_RATIOS.length - 1 ? 'تأیید و نتیجه' : 'تأیید و بعدی'}</Button>
      </div>
    );
  } else {
    const score = done?.score ?? scoreRisk(answers, total);
    body = (
      <div className="risk-step risk-result">
        <h3 className="risk-heading">نتیجهٔ آزمون</h3>
        <RiskGauge score={score} />
        <div className="risk-score">درصد ریسک‌پذیری شما: <strong>{fa(score, 1)}٪</strong></div>
        <h4 className="risk-profile-title">{profile.title}</h4>
        <p className="risk-text">{profile.text}</p>
        <h4 className="risk-subtitle">ترکیب پیشنهادی برای این سطح</h4>
        <RiskMixPie items={mixItems} />
        <p className="risk-note">این ترکیب فقط یک راهنمای آموزشی بر پایهٔ پاسخ‌های شماست و توصیهٔ سرمایه‌گذاری نیست.</p>
      </div>
    );
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block onClick={onClose}>بستن</Button>
        {!readOnly && <Button block icon={<RotateCcw size={15} />} onClick={start}>از نو</Button>}
      </div>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="آزمون ریسک‌پذیری" icon={<Gauge size={18} />} maxWidth="520px" footer={footer}>
      {body}
    </Modal>
  );
}
