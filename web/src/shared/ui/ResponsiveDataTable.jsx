import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

function SortIcon({ active, dir }) {
  if (!active) return <ChevronsUpDown size={12} className="rdt-sort-icon idle" />;
  return dir === 'asc' ? (
    <ChevronUp size={12} className="rdt-sort-icon active" />
  ) : (
    <ChevronDown size={12} className="rdt-sort-icon active" />
  );
}

/**
 * ResponsiveDataTable — a dense desktop `<table>` that collapses into compact,
 * minimal cards below the app's mobile breakpoint instead of horizontally scrolling.
 *
 * Meant to be the ONE shared table shell for any dense data list in the app (portfolio
 * holdings, transactions, and anything future) — column definitions and cell rendering
 * are written once and used for both the desktop row and the mobile card, so the two
 * layouts can never drift out of sync with each other.
 *
 * @param {object[]} columns - [{
 *   key: string,                     // unique
 *   header: ReactNode,               // desktop <th> content
 *   render: (row) => ReactNode,      // cell content — shared between desktop & mobile
 *   thClassName, tdClassName: string,
 *   mobile: 'title' | 'meta' | 'stat' | 'stat-secondary' | 'actions' | undefined,
 *     // which slot this column fills in the compact mobile card. A column with no
 *     // `mobile` role is simply left out of the card — this is what makes the mobile
 *     // view shorter than the desktop row, with no extra per-table logic required.
 * }]
 * @param {object[]} rows
 * @param {(row: object) => string} [rowKey] - defaults to row.id
 * @param {(row: object) => string} [rowClassName]
 * @param {string} [tableClassName]
 * @param {string} [wrapperClassName]
 * @param {number} [mobileBreakpoint=768]
 * @param {ReactNode} [emptyState]
 * @param {object} [sortState] - { key, dir: 'asc'|'desc' } | null — the current sort.
 *   A column opts into sorting by setting `sortKey` to the same key used in the
 *   sort; its header then becomes a clickable
 *   button with a direction indicator instead of plain text.
 * @param {(key: string) => void} [onSortChange] - called with a column's key when its header is clicked.
 * @param {(row: object) => ReactNode} [renderExpanded] - rows open: tapping a row (not a button
 *   or link in it) shows this under it, full width — a desktop row gets a row of its own under it,
 *   a mobile card grows. Which rows are open is kept here.
 * @param {object} [selection] - rows can be picked: { selected: Set of row keys, onToggle(row),
 *   canSelect?(row) (a row it returns false for has no checkbox),
 *   onToggleAll(checked) for the rows shown, label(row) for the checkbox's name }. A checkbox
 *   starts each desktop row (and the header picks every row shown) and each mobile card.
 */
export default function ResponsiveDataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  rowClassName,
  tableClassName = '',
  wrapperClassName = '',
  mobileBreakpoint = 768,
  emptyState = null,
  sortState = null,
  onSortChange = null,
  renderExpanded = null,
  selection = null,
}) {
  const isMobile = useIsMobile(mobileBreakpoint);
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const expandable = typeof renderExpanded === 'function';
  const isOpen = (row) => expandable && openKeys.has(rowKey(row));
  const toggle = (row) => setOpenKeys((prev) => {
    const next = new Set(prev);
    const key = rowKey(row);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  // A tap on the row itself, not on a control inside it
  const onRowClick = (row) => (e) => {
    if (!expandable || e.target.closest('button, a, input, select, textarea, label')) return;
    toggle(row);
  };
  const onRowKey = (row) => (e) => {
    if (!expandable || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggle(row);
  };
  const rowProps = (row) => (expandable
    ? { onClick: onRowClick(row), onKeyDown: onRowKey(row), tabIndex: 0, 'aria-expanded': isOpen(row), role: 'button' }
    : {});

  if (!rows || rows.length === 0) {
    return emptyState;
  }

  const isSelected = (row) => Boolean(selection?.selected.has(rowKey(row)));
  const selectedClass = (row) => (isSelected(row) ? 'is-selected' : '');
  // A row the selection leaves out (`selection.canSelect`) has no checkbox
  const checkbox = (row) => (selection.canSelect && !selection.canSelect(row) ? null : (
    <input
      type="checkbox"
      className="rdt-select"
      checked={isSelected(row)}
      onChange={() => selection.onToggle(row)}
      aria-label={selection.label ? selection.label(row) : 'انتخاب'}
    />
  ));
  const shownSelected = selection ? rows.filter(isSelected).length : 0;

  if (isMobile) {
    const titleCol = columns.find((c) => c.mobile === 'title');
    const metaCols = columns.filter((c) => c.mobile === 'meta');
    const statCols = columns.filter((c) => c.mobile === 'stat');
    const secondaryStatCols = columns.filter((c) => c.mobile === 'stat-secondary');
    const actionsCol = columns.find((c) => c.mobile === 'actions');

    return (
      <div className={`rdt-mobile-list ${wrapperClassName}`}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            className={`rdt-mobile-card ${rowClassName ? rowClassName(row) : ''} ${expandable ? 'is-expandable' : ''} ${isOpen(row) ? 'is-open' : ''} ${selectedClass(row)}`}
            {...rowProps(row)}
          >
            <div className="rdt-mobile-card-row rdt-mobile-card-top">
              {selection && checkbox(row)}
              {titleCol && <div className="rdt-mobile-card-title">{titleCol.render(row)}</div>}
              {actionsCol && <div className="rdt-mobile-card-actions">{actionsCol.render(row)}</div>}
            </div>

            {metaCols.length > 0 && (
              <div className="rdt-mobile-card-row rdt-mobile-card-meta">
                {metaCols.map((c) => (
                  <React.Fragment key={c.key}>{c.render(row)}</React.Fragment>
                ))}
              </div>
            )}

            {(statCols.length > 0 || secondaryStatCols.length > 0) && (
              <div className="rdt-mobile-card-row rdt-mobile-card-stats">
                {statCols.map((c) => (
                  <div key={c.key} className="rdt-mobile-stat">
                    {c.render(row)}
                  </div>
                ))}
                {secondaryStatCols.map((c) => (
                  <div key={c.key} className="rdt-mobile-stat rdt-mobile-stat-secondary">
                    {c.render(row)}
                  </div>
                ))}
              </div>
            )}
            {isOpen(row) && <div className="rdt-expanded" onClick={(e) => e.stopPropagation()}>{renderExpanded(row)}</div>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <table className={tableClassName}>
        <thead>
          <tr>
            {selection && (
              <th className="rdt-select-cell">
                <input
                  type="checkbox"
                  className="rdt-select"
                  checked={shownSelected === rows.length}
                  ref={(el) => { if (el) el.indeterminate = shownSelected > 0 && shownSelected < rows.length; }}
                  onChange={(e) => selection.onToggleAll(e.target.checked)}
                  aria-label="انتخاب همه‌ی ردیف‌های این صفحه"
                />
              </th>
            )}
            {columns.map((c) =>
              c.sortKey ? (
                <th
                  key={c.key}
                  className={c.thClassName}
                  aria-sort={sortState?.key === c.sortKey ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    className="rdt-sort-th-btn"
                    onClick={() => onSortChange?.(c.sortKey)}
                  >
                    {c.header}
                    <SortIcon active={sortState?.key === c.sortKey} dir={sortState?.dir} />
                  </button>
                </th>
              ) : (
                <th key={c.key} className={c.thClassName}>
                  {c.header}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <React.Fragment key={rowKey(row)}>
              <tr
                className={`${rowClassName ? rowClassName(row) : ''} ${expandable ? 'is-expandable' : ''} ${isOpen(row) ? 'is-open' : ''} ${selectedClass(row)}`}
                {...rowProps(row)}
              >
                {selection && <td className="rdt-select-cell">{checkbox(row)}</td>}
                {columns.map((c) => (
                  <td key={c.key} className={c.tdClassName}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
              {isOpen(row) && (
                <tr className="rdt-expanded-row">
                  <td colSpan={columns.length + (selection ? 1 : 0)}>
                    <div className="rdt-expanded">{renderExpanded(row)}</div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
