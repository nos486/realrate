/**
 * MahrTool.jsx — «محاسبه‌ی مهریه»: a dowry fixed in a past year at today's value (grown with the
 * central bank's annual inflation, config/toolRates.js), and a dowry fixed in coins at today's coin price
 */

import React, { useState } from 'react';
import { t } from '../../utils/i18n.js';
import { FilterPills } from '../../shared/ui/index.js';
import { usePricing } from '../market/context/PricingContext.jsx';
import { gregorianToJalali } from '../../utils/loanCalculator.js';
import { mahrToday, mahrCoinsValue } from '../../utils/toolCalculators.js';
import { INFLATION_BY_YEAR, LAST_INFLATION_YEAR } from '../../config/toolRates.js';
import { Fields, NumberField, Results, ToolEmpty, parseNum, toman } from './toolParts.jsx';
import { toPersianDigits } from '../../shared/utils/formatters.js';

const MODES = [
  { value: 'inflation', label: t('مبلغ مهریه (تعدیل با تورم)') },
  { value: 'coins', label: t('تعداد سکه') },
];

/** The current Shamsi year */
const currentShamsiYear = () => {
  const now = new Date();
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()).jy;
};

export default function MahrTool() {
  const pricing = usePricing();
  const coinPrice = Number(pricing?.getAssetPrice?.('full_coin')) || 0;
  const thisYear = currentShamsiYear();
  const [mode, setMode] = useState('inflation');
  const [v, setV] = useState({ amount: '', year: String(thisYear - 5), assumed: String(INFLATION_BY_YEAR[LAST_INFLATION_YEAR]), coins: '' });
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const r = mahrToday({ amount: parseNum(v.amount), marriageYear: parseNum(v.year), currentYear: thisYear, assumedPct: parseNum(v.assumed), coinPrice });
  const coinsValue = mahrCoinsValue(parseNum(v.coins), coinPrice);

  return (
    <>
      <FilterPills variant="segmented" options={MODES} activeValue={mode} onChange={setMode} />
      {mode === 'inflation' ? (
        <>
          <Fields>
            <NumberField label={t('مبلغ مهریه در زمان عقد')} affix={t('تومان')} value={v.amount} onChange={set('amount')} />
            <NumberField label={t('سال عقد (شمسی)')} value={v.year} onChange={set('year')} />
            <NumberField
              label={t('تورم سال‌های بدون آمار')}
              affix="%"
              value={v.assumed}
              onChange={set('assumed')}
              decimals
              hint={t('آمار تورم تا سال {year} در برنامه هست', { year: toPersianDigits(LAST_INFLATION_YEAR) })}
            />
          </Fields>
          {r ? (
            <Results
              rows={[
                { label: t('مهریه به ارزش امروز'), value: toman(r.today), strong: true },
                { label: t('ضریب تعدیل'), value: toPersianDigits(r.factor) },
                r.coins !== null && { label: t('معادل سکه‌ی امامی امروز'), value: toPersianDigits(r.coins) },
              ]}
              note={t('تقریبی است: از تورم متوسط سالانه‌ی بانک مرکزی استفاده شده؛ برای رقم دادگاه، شاخص رسمی بانک مرکزی ملاک است.')}
            />
          ) : <ToolEmpty>{t('مبلغ مهریه و سال عقد را وارد کنید.')}</ToolEmpty>}
        </>
      ) : (
        <>
          <Fields>
            <NumberField label={t('تعداد سکه‌ی امامی')} value={v.coins} onChange={set('coins')} />
          </Fields>
          {coinsValue ? (
            <Results rows={[
              { label: t('مهریه به نرخ امروز'), value: toman(coinsValue), strong: true },
              { label: t('قیمت هر سکه'), value: toman(coinPrice) },
            ]} />
          ) : <ToolEmpty>{coinPrice ? t('تعداد سکه را وارد کنید.') : t('نرخ‌ها هنوز بارگذاری نشده‌اند.')}</ToolEmpty>}
        </>
      )}
    </>
  );
}
