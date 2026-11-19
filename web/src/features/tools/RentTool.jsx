/**
 * RentTool.jsx — «رهن و اجاره»: exchanging deposit and monthly rent at a yearly conversion rate
 * (domain/toolCalculators.js rentExchange), and the most a rent may be raised to
 */

import React, { useState } from 'react';
import { t } from '../../utils/i18n.js';
import { FilterPills } from '../../shared/ui/index.js';
import { rentExchange, cappedRent } from '../../utils/toolCalculators.js';
import { RENT_DEFAULTS } from '../../config/toolRates.js';
import { Fields, NumberField, Results, ToolEmpty, parseNum, toman } from './toolParts.jsx';

const MODES = [
  { value: 'newDeposit', label: t('تغییر ودیعه') },
  { value: 'newRent', label: t('تغییر اجاره') },
];

export default function RentTool() {
  const [mode, setMode] = useState('newDeposit');
  const [v, setV] = useState({ deposit: '', rent: '', rate: String(RENT_DEFAULTS.annualRatePct), target: '', cap: String(RENT_DEFAULTS.maxIncreasePct) });
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const x = rentExchange({
    deposit: parseNum(v.deposit), rent: parseNum(v.rent), annualRatePct: parseNum(v.rate),
    newDeposit: mode === 'newDeposit' && v.target !== '' ? parseNum(v.target) : null,
    newRent: mode === 'newRent' && v.target !== '' ? parseNum(v.target) : null,
  });

  return (
    <>
      <Fields>
        <NumberField label={t('رهن (ودیعه) فعلی')} affix={t('تومان')} value={v.deposit} onChange={set('deposit')} />
        <NumberField label={t('اجاره‌ی ماهانه‌ی فعلی')} affix={t('تومان')} value={v.rent} onChange={set('rent')} />
        <NumberField label={t('نرخ تبدیل سالانه')} affix="%" value={v.rate} onChange={set('rate')} decimals hint={t('هر ۱۰۰ تومان رهن، سالی این‌قدر اجاره')} />
      </Fields>
      <FilterPills variant="segmented" options={MODES} activeValue={mode} onChange={(m) => { setMode(m); set('target')(''); }} />
      <Fields>
        <NumberField
          label={mode === 'newDeposit' ? t('رهن جدید') : t('اجاره‌ی ماهانه‌ی جدید')}
          affix={t('تومان')}
          value={v.target}
          onChange={set('target')}
        />
      </Fields>
      {x ? (
        <Results
          rows={[
            x.result && { label: mode === 'newDeposit' ? t('اجاره‌ی ماهانه‌ی جدید') : t('رهن جدید'), value: toman(mode === 'newDeposit' ? x.result.rent : x.result.deposit), strong: true },
            { label: t('معادل کامل رهن'), value: toman(x.allDeposit) },
            { label: t('معادل کامل اجاره‌ی ماهانه'), value: toman(x.allRent) },
          ]}
        />
      ) : <ToolEmpty>{t('رهن یا اجاره و نرخ تبدیل را وارد کنید.')}</ToolEmpty>}
      <Fields>
        <NumberField label={t('سقف افزایش اجاره')} affix="%" value={v.cap} onChange={set('cap')} decimals />
      </Fields>
      {parseNum(v.rent) > 0 && (
        <Results rows={[{ label: t('بیشترین اجاره‌ی مجاز در تمدید'), value: toman(cappedRent(parseNum(v.rent), parseNum(v.cap))) }]} />
      )}
    </>
  );
}
