import React from 'react';
import { Download } from 'lucide-react';
import { buildHoldingsCsv } from '../utils/holdingsCsv.js';
import { todayIso } from '../../../shared/utils/dates.js';

export default function CsvExportButton({ items = [], portfolioName = 'portfolio', disabled = false }) {
  const handleExportCSV = () => {
    if (!items || items.length === 0) return;

    const csvContent = buildHoldingsCsv(items);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (portfolioName || 'portfolio').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
    const dateStr = todayIso();
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
