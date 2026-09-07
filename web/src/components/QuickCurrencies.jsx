import React from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
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
    <div className="quick-currencies-bar">
      {items.map((item) => (
        <div key={item.code} className="quick-curr-item">
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="quick-curr-flag">{item.flag}</span>
            <span className="quick-curr-name">{item.name}</span>
          </span>
          <strong className="quick-curr-price">
            {item.val ? `${formatNum(item.val)} تومان` : 'در حال دریافت...'}
          </strong>
        </div>
      ))}
    </div>
  );
}
