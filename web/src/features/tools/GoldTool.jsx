/**
 * GoldTool.jsx — «قیمت طلا با اجرت و مالیات»: what a piece of gold costs at the goldsmith (the
 * day's price, wage, seller's profit and VAT), and the day's coin prices with their bubble
 * (utils/calculator.js calculateMarketData, the same bubble the home shows)
 */

import React, { useMemo, useState } from 'react';
import { t } from '../../utils/i18n.js';
import { usePricing } from '../market/context/PricingContext.jsx';
import { calculateMarketData } from '../../utils/calculator.js';
import { goldPurchase } from '../../utils/toolCalculators.js';
import { GOLD_DEFAULTS } from '../../config/toolRates.js';
import { Fields, NumberField, Results, ToolEmpty, parseNum, toman, pct } from './toolParts.jsx';

/** The coin rows the bubble table shows */
const COINS = ['full_coin', 'half_coin', 'quarter_coin'];

export default function GoldTool() {
  const pricing = usePricing();
  const livePerGram = Math.round(Number(pricing?.getAssetPrice?.('gold_18k')) || 0);
  const [v, setV] = useState({ grams: '1', price: '', wage: String(GOLD_DEFAULTS.wagePct), profit: String(GOLD_DEFAULTS.profitPct), tax: String(GOLD_DEFAULTS.taxPct) });
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const perGram = v.price === '' ? livePerGram : parseNum(v.price);
  const r = goldPurchase({ grams: parseNum(v.grams), pricePerGram: perGram, wagePct: parseNum(v.wage), profitPct: parseNum(v.profit), taxPct: parseNum(v.tax) });

  const market = useMemo(() => {
    if (!pricing?.priceBook) return null;
    const data = calculateMarketData({ usdToman: pricing.usdToman, goldUsd: pricing.goldUsd, book: pricing.priceBook, globalSettings: pricing.globalSettings });
    return data?.success === false ? null : data;
  }, [pricing?.priceBook, pricing?.usdToman, pricing?.goldUsd, pricing?.globalSettings]);
  const coins = (market?.analysis || []).filter((i) => COINS.includes(i.id) && i.market);

  return (
    <>
      <Fields>
        <NumberField label={t('وزن (گرم)')} value={v.grams} onChange={set('grams')} decimals />
        <NumberField
          label={t('قیمت هر گرم طلای ۱۸ عیار')}
          affix={t('تومان')}
          value={v.price === '' && livePerGram ? livePerGram.toLocaleString('en-US') : v.price}
          onChange={set('price')}
          hint={livePerGram ? t('پیش‌فرض: قیمت لحظه‌ای بازار') : undefined}
        />
        <NumberField label={t('اجرت ساخت')} affix="%" value={v.wage} onChange={set('wage')} decimals />
        <NumberField label={t('سود فروشنده')} affix="%" value={v.profit} onChange={set('profit')} decimals />
        <NumberField label={t('مالیات بر ارزش افزوده')} affix="%" value={v.tax} onChange={set('tax')} decimals hint={t('فقط روی اجرت و سود')} />
      </Fields>
      {r ? (
        <Results
          rows={[
            { label: t('مبلغ قابل پرداخت'), value: toman(r.total), strong: true },
            { label: t('ارزش طلای خام'), value: toman(r.metal) },
            { label: t('اجرت'), value: toman(r.wage) },
            { label: t('سود فروشنده'), value: toman(r.profit) },
            { label: t('مالیات'), value: toman(r.tax) },
            { label: t('قیمت تمام‌شده‌ی هر گرم'), value: toman(r.perGram) },
            { label: t('اضافه بر ارزش طلا'), value: pct(r.overMetalPct) },
          ]}
        />
      ) : <ToolEmpty>{t('وزن و قیمت هر گرم را وارد کنید.')}</ToolEmpty>}

      {coins.length > 0 && (
        <div className="tool-block">
          <h3 className="tool-block-title">{t('حباب سکه امروز')}</h3>
          <table className="tool-table">
            <thead><tr><th>{t('سکه')}</th><th>{t('قیمت بازار')}</th><th>{t('ارزش ذاتی')}</th><th>{t('حباب')}</th></tr></thead>
            <tbody>
              {coins.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{toman(c.market)}</td>
                  <td>{toman(c.intrinsic)}</td>
                  <td className={c.bubble_pct > 0 ? 'is-bad' : 'is-good'}>{pct(c.bubble_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
