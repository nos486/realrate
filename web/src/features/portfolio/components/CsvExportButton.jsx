/**
 * CsvExportButton.jsx — The portfolio as a CSV file: every entry of every asset (utils/holdingsCsv.js)
 */
import React from 'react';
import { Download } from 'lucide-react';
import { buildHoldingsCsv } from '../utils/holdingsCsv.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { saveTextFile } from '../../../shared/utils/fileExport.js';
import { safeFilenamePart } from '../../../shared/utils/csv.js';

export default function CsvExportButton({ assets = [], portfolioName = 'portfolio', disabled = false }) {
  const empty = !assets.some((a) => a.entries?.length);
  const handleExportCSV = () => {
    if (empty) return;
    saveTextFile(`portfolio-${safeFilenamePart(portfolioName, 'portfolio')}-${todayIso()}.csv`, buildHoldingsCsv(assets), 'text/csv;charset=utf-8')
      .catch((err) => console.warn('Saving the CSV failed:', err));
  };

  return (
    <button
      type="button"
      className="btn-export-csv icon-only"
      onClick={handleExportCSV}
      title="خروجی CSV از همه‌ی ثبت‌های این پورتفو (خرید، فروش، پرداخت)"
      aria-label="خروجی CSV"
      disabled={disabled || empty}
    >
      <Download size={15} strokeWidth={2} />
    </button>
  );
}
