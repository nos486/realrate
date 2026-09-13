import React from 'react';
import { getCanonicalAssetSpec } from '../utils/financialSpecs.js';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '...';
  return Math.round(num).toLocaleString('fa-IR');
}

const QUICK_CODES = ['USD', 'EUR', 'AED', 'TRY'];

export default function QuickCurrencies({ quickCurrencies }) {
  const qc = quickCurrencies || {};

  const items = QUICK_CODES.map((code) => {
    const spec = getCanonicalAssetSpec(code) || {};
    return {
      code,
      name: spec.name || code,
      flag: spec.flag || '🌐',
      val: qc[code],
    };
  });


  return (
    <div className="ticker-strip">
      {items.map((item) => (
        <div key={item.code} className="ticker-item">
          <div className="ticker-left">
            <span className="ticker-flag">{item.flag}</span>
            <span className="ticker-title">{item.name}</span>
          </div>
          <div className="ticker-right">
            <span className="ticker-price">{formatNum(item.val)}</span>
            <span className="ticker-currency">تومان</span>
          </div>
        </div>
      ))}
    </div>
  );
}
