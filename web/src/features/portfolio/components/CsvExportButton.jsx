import React from 'react';
import { Download } from 'lucide-react';

export default function CsvExportButton({ items = [], portfolioName = 'portfolio', disabled = false }) {
  const handleExportCSV = () => {
    if (!items || items.length === 0) return;

    const headers = [
      'نام دارایی',
      'دسته‌بندی',
      'نوع',
      'مقدار',
      'واحد',
      'قیمت خرید (تومان)',
      'سرمایه اولیه (تومان)',
      'ارزش روز واحد (تومان)',
      'ارزش روز کل (تومان)',
      'سود/زیان (تومان)',
      'درصد بازدهی',
      'تاریخ خرید',
      'یادداشت',
      'شناسه سیستمی',
      'منبع'
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = items.map((item) => {
      const row = [
        escapeCSV(item.assetName || item.name || item.assetId),
        escapeCSV(item.category || item.assetType || 'سفارشی'),
        escapeCSV(item.assetType || item.category || 'custom'),
        escapeCSV(item.amount),
        escapeCSV(item.unit),
        escapeCSV(item.hasBuyPrice ? item.buyPrice : ''),
        escapeCSV(item.hasBuyPrice ? item.itemCost : ''),
        escapeCSV(item.unitRealPrice),
        escapeCSV(item.itemRealVal),
        escapeCSV(item.hasBuyPrice ? item.itemPnl : ''),
        escapeCSV(item.hasBuyPrice && item.itemPnlPct !== null && item.itemPnlPct !== undefined ? item.itemPnlPct.toFixed(1) + '%' : ''),
        escapeCSV(item.buyDate || ''),
        escapeCSV(item.notes || ''),
        escapeCSV(item.assetId || ''),
        escapeCSV(item.source === 'transactions' ? 'تراکنش‌ها' : 'دستی')
      ];
      return row.join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (portfolioName || 'portfolio').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `portfolio-${safeName}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      className="btn-export-csv icon-only"
      onClick={handleExportCSV}
      title="دریافت خروجی اکسل / CSV از اقلام این پورتفو"
      aria-label="خروجی CSV"
      disabled={disabled || items.length === 0}
    >
      <Download size={15} strokeWidth={2} />
    </button>
  );
}
