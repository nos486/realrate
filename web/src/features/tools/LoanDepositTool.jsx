/**
 * LoanDepositTool.jsx — «وام و سود سپرده»: a loan's installment, total cost, fees and real price
 * after inflation, or a deposit's profit and what it is really worth after inflation
 * (domain/toolCalculators.js loanCost, depositReturn)
 */

import React, { useMemo, useState } from 'react';
import { t } from '../../utils/i18n.js';
import { FilterPills } from '../../shared/ui/index.js';
import { loanCost, depositReturn } from '../../utils/toolCalculators.js';
import { Fields, NumberField, Results, ToolEmpty, Field, parseNum, toman, pct } from './toolParts.jsx';

const MODES = [
  { value: 'loan', label: t('وام') },
  { value: 'deposit', label: t('سپرده') },
];

function LoanPart() {
  const [v, setV] = useState({ principal: '', rate: '23', months: '12', feePct: '', feeFixed: '', inflation: '35' });
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const r = useMemo(() => loanCost({
    principal: parseNum(v.principal), annualRatePct: parseNum(v.rate), months: parseNum(v.months),
    feePct: parseNum(v.feePct), feeFixed: parseNum(v.feeFixed), inflationPct: parseNum(v.inflation),
  }), [v]);
  return (
    <>
      <Fields>
        <NumberField label={t('مبلغ وام')} affix={t('تومان')} value={v.principal} onChange={set('principal')} />
        <NumberField label={t('نرخ سود سالانه')} affix="%" value={v.rate} onChange={set('rate')} decimals />
        <NumberField label={t('تعداد اقساط (ماه)')} value={v.months} onChange={set('months')} />
        <NumberField label={t('کارمزد (درصد)')} affix="%" value={v.feePct} onChange={set('feePct')} decimals />
        <NumberField label={t('کارمزد ثابت')} affix={t('تومان')} value={v.feeFixed} onChange={set('feeFixed')} />
        <NumberField label={t('تورم سالانه‌ی پیش‌بینی‌شده')} affix="%" value={v.inflation} onChange={set('inflation')} decimals />
      </Fields>
      {r ? (
        <Results
          rows={[
            { label: t('قسط ماهانه'), value: toman(r.payment), strong: true },
            { label: t('مجموع بازپرداخت'), value: toman(r.totalPaid) },
            { label: t('سود پرداختی'), value: toman(r.interest) },
            r.fee > 0 && { label: t('کارمزد وام'), value: toman(r.fee) },
            { label: t('هزینه‌ی کل وام'), value: toman(r.totalCost) },
            { label: t('نرخ مؤثر سالانه (با کارمزد)'), value: pct(r.effectiveAnnualPct) },
            { label: t('هزینه‌ی واقعی به پول امروز'), value: toman(r.realCost), tone: r.realCost <= 0 ? 'good' : undefined },
            { label: t('نرخ واقعی بعد از تورم'), value: pct(r.realRatePct), tone: r.realRatePct <= 0 ? 'good' : 'bad' },
          ]}
          note={r.realRatePct < 0
            ? t('تورم از سود وام بیشتر است؛ بازپرداخت با پولی انجام می‌شود که ارزش کمتری دارد.')
            : t('نرخ مؤثر شامل کارمزد است؛ هزینه‌ی واقعی، اقساط را به ارزش پول امروز برمی‌گرداند.')}
        />
      ) : <ToolEmpty>{t('مبلغ و تعداد اقساط را وارد کنید.')}</ToolEmpty>}
    </>
  );
}

function DepositPart() {
  const [v, setV] = useState({ principal: '', rate: '23', months: '12', inflation: '35', compounding: 'simple' });
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const r = useMemo(() => depositReturn({
    principal: parseNum(v.principal), annualRatePct: parseNum(v.rate), months: parseNum(v.months),
    inflationPct: parseNum(v.inflation), compounding: v.compounding,
  }), [v]);
  return (
    <>
      <Fields>
        <NumberField label={t('مبلغ سپرده')} affix={t('تومان')} value={v.principal} onChange={set('principal')} />
        <NumberField label={t('نرخ سود سالانه')} affix="%" value={v.rate} onChange={set('rate')} decimals />
        <NumberField label={t('مدت (ماه)')} value={v.months} onChange={set('months')} />
        <NumberField label={t('تورم سالانه‌ی پیش‌بینی‌شده')} affix="%" value={v.inflation} onChange={set('inflation')} decimals />
        <Field label={t('نوع سود')}>
          <FilterPills
            variant="segmented"
            options={[{ value: 'simple', label: t('ساده') }, { value: 'monthly', label: t('ماهانه مرکب') }]}
            activeValue={v.compounding}
            onChange={set('compounding')}
          />
        </Field>
      </Fields>
      {r ? (
        <Results
          rows={[
            { label: t('سود سپرده'), value: toman(r.profit), strong: true },
            { label: t('مبلغ پایان دوره'), value: toman(r.final) },
            { label: t('ارزش مبلغ پایان دوره به پول امروز'), value: toman(r.realFinal) },
            { label: t('سود یا زیان واقعی'), value: toman(r.realProfit), tone: r.realProfit >= 0 ? 'good' : 'bad' },
            { label: t('بازده واقعی سالانه'), value: pct(r.realAnnualPct), tone: r.realAnnualPct >= 0 ? 'good' : 'bad' },
          ]}
          note={r.realProfit < 0 ? t('سود سپرده از تورم کمتر است؛ قدرت خرید پول شما کم می‌شود.') : undefined}
        />
      ) : <ToolEmpty>{t('مبلغ و مدت سپرده را وارد کنید.')}</ToolEmpty>}
    </>
  );
}

export default function LoanDepositTool() {
  const [mode, setMode] = useState('loan');
  return (
    <>
      <FilterPills variant="segmented" options={MODES} activeValue={mode} onChange={setMode} />
      {mode === 'loan' ? <LoanPart /> : <DepositPart />}
    </>
  );
}
