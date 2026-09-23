import React from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

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
}) {
  const isMobile = useIsMobile(mobileBreakpoint);

  if (!rows || rows.length === 0) {
    return emptyState;
  }

  if (isMobile) {
    const titleCol = columns.find((c) => c.mobile === 'title');
    const metaCols = columns.filter((c) => c.mobile === 'meta');
    const statCols = columns.filter((c) => c.mobile === 'stat');
    const secondaryStatCols = columns.filter((c) => c.mobile === 'stat-secondary');
    const actionsCol = columns.find((c) => c.mobile === 'actions');

    return (
      <div className={`rdt-mobile-list ${wrapperClassName}`}>
        {rows.map((row) => (
          <div key={rowKey(row)} className={`rdt-mobile-card ${rowClassName ? rowClassName(row) : ''}`}>
            <div className="rdt-mobile-card-row rdt-mobile-card-top">
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
            {columns.map((c) => (
              <th key={c.key} className={c.thClassName}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClassName ? rowClassName(row) : ''}>
              {columns.map((c) => (
                <td key={c.key} className={c.tdClassName}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
