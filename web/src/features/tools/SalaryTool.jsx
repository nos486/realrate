/**
 * SalaryTool.jsx — «حقوق، مالیات و بیمه»: a monthly pay's insurance, income tax, net and the
 * employer's cost, and the year-end bonus (عیدی) and severance (سنوات). The year's figures are
 * config/toolRates.js PAYROLL; the minimum wage can be changed here.
 */

import React, { useState } from 'react';
import { t } from '../../utils/i18n.js';
import { FilterPills } from '../../shared/ui/index.js';
import { salaryBreakdown, eidiAndSanavat } from '../../utils/toolCalculators.js';
import { PAYROLL } from '../../config/toolRates.js';
import { Fields, NumberField, Results, ToolEmpty, parseNum, toman } from './toolParts.jsx';
import { toPersianDigits } from '../../shared/utils/formatters.js';

const MODES = [
  { value: 'salary', label: t('حقوق ماهانه') },
  { value: 'eidi', label: t('عیدی و سنوات') },
];

export default function SalaryTool() {
  const [mode, setMode] = useState('salary');
  const [v, setV] = useState({ base: '', allowances: '', minWage: PAYROLL.minWageMonthly.toLocaleString('en-US'), months: '12', lastPay: '', service: '' });
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const minWage = parseNum(v.minWage);
  const pay = salaryBreakdown({ base: parseNum(v.base), allowances: parseNum(v.allowances), minWage });
  const bonus = eidiAndSanavat({
    base: parseNum(v.base), lastPay: parseNum(v.lastPay), monthsWorked: parseNum(v.months), serviceMonths: parseNum(v.service), minWage,
  });
  const note = t('تخمینی بر پایه‌ی ارقام سال {year}؛ حداقل حقوق را می‌توانید خودتان تغییر دهید.', { year: toPersianDigits(PAYROLL.year) });

  return (
    <>
      <FilterPills variant="segmented" options={MODES} activeValue={mode} onChange={setMode} />
      <Fields>
        <NumberField label={t('حقوق پایه (ماهانه)')} affix={t('تومان')} value={v.base} onChange={set('base')} />
        {mode === 'salary' ? (
          <NumberField label={t('مزایا (مسکن، بن، ...)')} affix={t('تومان')} value={v.allowances} onChange={set('allowances')} />
        ) : (
          <>
            <NumberField label={t('ماه‌های کارکرد در سال')} value={v.months} onChange={set('months')} />
            <NumberField label={t('آخرین حقوق ماهانه (پایه‌ی سنوات)')} affix={t('تومان')} value={v.lastPay} onChange={set('lastPay')} hint={t('خالی: همان حقوق پایه')} />
            <NumberField label={t('سابقه‌ی کار (ماه)')} value={v.service} onChange={set('service')} />
          </>
        )}
        <NumberField label={t('حداقل حقوق ماهانه')} affix={t('تومان')} value={v.minWage} onChange={set('minWage')} />
      </Fields>
      {mode === 'salary' ? (
        pay ? (
          <Results
            rows={[
              { label: t('خالص دریافتی'), value: toman(pay.net), strong: true },
              { label: t('ناخالص'), value: toman(pay.gross) },
              { label: t('بیمه‌ی سهم کارگر'), value: toman(pay.insurance) },
              { label: t('مالیات بر حقوق'), value: toman(pay.tax) },
              { label: t('بیمه‌ی سهم کارفرما'), value: toman(pay.employerInsurance) },
              { label: t('هزینه‌ی کارفرما'), value: toman(pay.employerCost) },
            ]}
            note={note}
          />
        ) : <ToolEmpty>{t('حقوق را وارد کنید.')}</ToolEmpty>
      ) : (
        bonus ? (
          <Results
            rows={[
              { label: t('عیدی'), value: toman(bonus.eidi), strong: true },
              { label: t('بخش مشمول مالیات عیدی'), value: toman(bonus.eidiTaxable) },
              bonus.eidiTax > 0 && { label: t('مالیات عیدی'), value: toman(bonus.eidiTax) },
              { label: t('سنوات'), value: toman(bonus.sanavat), strong: true },
            ]}
            note={note}
          />
        ) : <ToolEmpty>{t('حقوق پایه را وارد کنید.')}</ToolEmpty>
      )}
    </>
  );
}
