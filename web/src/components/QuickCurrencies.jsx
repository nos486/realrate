import React from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '...';
  return Math.round(num).toLocaleString('fa-IR');
}

export default function QuickCurrencies({ quickCurrencies }) {
  const qc = quickCurrencies || {};

  const items = [
    { code: 'USD', name: 'دلار', flag: '🇺🇸', val: qc.USD },
    { code: 'EUR', name: 'یورو', flag: '🇪🇺', val: qc.EUR },
    { code: 'AED', name: 'درهم', flag: '🇦🇪', val: qc.AED },
    { code: 'TRY', name: 'لیر', flag: '🇹🇷', val: qc.TRY },
  ];

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
