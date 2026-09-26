import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { buildCsvContent, downloadCsvFile, safeFilenamePart } from '../utils/csv.js';
import { todayIso } from '../utils/dates.js';

/**
 * GenericCsvExportButton — feature-agnostic "export to CSV" icon button.
 * Any feature (Portfolio, Incomes, Loans, ...) supplies its own header list
 * and a per-item row-builder; the CSV building/downloading itself is shared.
 *
 * @param {object[]} items
 * @param {string[]} headers
 * @param {(item: object) => any[]} mapRow - returns the raw cell values for one item, in header order
 * @param {string} fileBaseName - used as the exported file's name, before the date suffix
 * @param {() => Promise<object[]>} [loadItems] - fetches the items when clicked (instead of `items`)
 * @param {boolean} [disabled]
 * @param {string} [title]
 */
export default function GenericCsvExportButton({
  items = [],
  loadItems,
  headers,
  mapRow,
  fileBaseName,
  disabled = false,
  title = 'دریافت خروجی CSV',
}) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    let list = items;
    if (loadItems) {
      setLoading(true);
      try {
        list = await loadItems();
      } catch {
        list = [];
      } finally {
        setLoading(false);
      }
    }
    if (!list || list.length === 0) return;
    const rows = list.map(mapRow);
    const content = buildCsvContent(headers, rows);
    const dateStr = todayIso();
    downloadCsvFile(`${safeFilenamePart(fileBaseName)}-${dateStr}.csv`, content);
  };

  return (
    <button
      type="button"
      className="btn-export-csv icon-only"
      onClick={handleExport}
      title={title}
      aria-label="خروجی CSV"
      disabled={disabled || loading || (!loadItems && items.length === 0)}
      aria-busy={loading}
    >
      <Download size={15} strokeWidth={2} />
    </button>
  );
}
