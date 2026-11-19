/**
 * RentTool.jsx — «رهن و اجاره»: exchanging deposit and monthly rent at a yearly conversion rate
 * (domain/toolCalculators.js rentExchange), a slider from all deposit to all rent with the split
 * under it (rentSplit), and the most a rent may be raised to
 */

import React, { useState } from 'react';
import { getLocale, t } from '../../utils/i18n.js';
import { FilterPills } from '../../shared/ui/index.js';
import { rentExchange, rentSplit, cappedRent } from '../../utils/toolCalculators.js';
import { RENT_DEFAULTS } from '../../config/toolRates.js';
import { Fields, NumberField, pct, Results, ToolEmpty, parseNum, toman } from './toolParts.jsx';

const MODES = [
  { value: 'newDeposit', label: t('تغییر ودیعه') },
  { value: 'newRent', label: t('تغییر اجاره') },
];

/** The slider's value is the rent share in a left-to-right page and the deposit share in a right-to-left one, so the right end is always all rent */
const RTL = () => getLocale() === 'fa';

/** One line: slide to all rent (right) or all deposit (left); the percent and amounts of each below */
function RentSlider({ deposit, rent, rate }) {
  const [share, setShare] = useState(null); // the rent share, null until moved: the current mix
  const split = rentSplit({ deposit, rent, annualRatePct: rate, rentSharePct: share });
  if (!split) return null;
  const rtl = RTL();
  const value = rtl ? split.depositSharePct : split.rentSharePct;
  const labels = [
    <span key="rent">{t('کامل اجاره')}</span>,
    <span key="deposit">{t('کامل رهن')}</span>,
  ];
  return (
    <div className="tool-block">
      <h3 className="tool-block-title">{t('ترکیب رهن و اجاره')}</h3>
      <input
        type="range"
        className="tool-slider"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={t('ترکیب رهن و اجاره')}
        onChange={(e) => {
          const v = Number(e.target.value);
          setShare(rtl ? 100 - v : v);
        }}
      />
      <div className="tool-slider-ends">{rtl ? labels : [...labels].reverse()}</div>
      <Results
        rows={[
          { label: t('رهن'), value: `${pct(split.depositSharePct)} · ${toman(split.deposit)}`, strong: true },
          { label: t('اجاره‌ی ماهانه'), value: `${pct(split.rentSharePct)} · ${toman(split.rent)}`, strong: true },
        ]}
      />
    </div>
  );
}

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
      <RentSlider deposit={parseNum(v.deposit)} rent={parseNum(v.rent)} rate={parseNum(v.rate)} />
      <Fields>
        <NumberField label={t('سقف افزایش اجاره')} affix="%" value={v.cap} onChange={set('cap')} decimals />
      </Fields>
      {parseNum(v.rent) > 0 && (
        <Results rows={[{ label: t('بیشترین اجاره‌ی مجاز در تمدید'), value: toman(cappedRent(parseNum(v.rent), parseNum(v.cap))) }]} />
      )}
    </>
  );
}
