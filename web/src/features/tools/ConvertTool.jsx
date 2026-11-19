/**
 * ConvertTool.jsx — «تبدیل ارز و طلا»: an amount of any currency, gold or coin in another, through
 * the price book's toman prices (the browser never computes a price: it looks them up by id)
 */

import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { usePricing } from '../market/context/PricingContext.jsx';
import { CURRENCIES } from '../../utils/currencies.js';
import { convertAmount } from '../../utils/toolCalculators.js';
import { Field, NumberField, Fields, Results, ToolEmpty, parseNum, toman } from './toolParts.jsx';
import { formatPrice } from '../market/assetPrice.js';

/** Gold and coins offered next to the currencies (price book ids) */
const GOLD_UNITS = [
  { id: 'gold_18k', label: t('گرم طلای ۱۸ عیار') },
  { id: 'full_coin', label: t('سکه امامی') },
  { id: 'half_coin', label: t('نیم سکه') },
  { id: 'quarter_coin', label: t('ربع سکه') },
];

export default function ConvertTool() {
  const pricing = usePricing();
  const units = useMemo(() => [
    { id: 'toman', label: t('تومان'), price: 1 },
    ...CURRENCIES.filter((c) => c.priceId).map((c) => ({ id: c.priceId, label: c.label, price: Number(pricing?.getAssetPrice?.(c.priceId)) || 0 })),
    ...GOLD_UNITS.map((u) => ({ ...u, price: Number(pricing?.getAssetPrice?.(u.id)) || 0 })),
  ].filter((u) => u.price > 0), [pricing]);
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('usd');
  const [to, setTo] = useState('toman');
  const unit = (id) => units.find((u) => u.id === id);
  const a = unit(from);
  const b = unit(to);
  const value = a && b ? convertAmount(parseNum(amount), a.price, b.price) : null;

  const select = (current, onChange, label) => (
    <Field label={label}>
      <select className="ui-input-control" value={current} onChange={(e) => onChange(e.target.value)}>
        {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
      </select>
    </Field>
  );

  return (
    <>
      <Fields>
        <NumberField label={t('مقدار')} value={amount} onChange={setAmount} decimals />
        {select(from, setFrom, t('از'))}
        {select(to, setTo, t('به'))}
      </Fields>
      <button type="button" className="tool-swap" onClick={() => { setFrom(to); setTo(from); }}>
        <ArrowLeftRight size={14} /> {t('جابه‌جایی')}
      </button>
      {value !== null && a && b ? (
        <Results
          rows={[
            { label: `${formatPrice(parseNum(amount))} ${a.label}`, value: `${formatPrice(value)} ${b.label}`, strong: true },
            { label: t('نرخ هر {unit}', { unit: a.label }), value: toman(a.price) },
          ]}
        />
      ) : <ToolEmpty>{t('نرخ‌ها هنوز بارگذاری نشده‌اند.')}</ToolEmpty>}
    </>
  );
}
