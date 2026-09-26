/**
 * Pagination.jsx — "Showing X–Y of Z" with previous / next buttons (shared by every paged list)
 */

import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import Button from './Button.jsx';

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

/**
 * @param {object} props
 * @param {number} props.page 1-based
 * @param {number} props.pageSize
 * @param {number} props.total
 * @param {(page: number) => void} props.onChange
 * @param {boolean} [props.loading]
 * @param {string} [props.label] accessible name of the navigation
 */
export default function Pagination({ page, pageSize, total, onChange, loading = false, label = 'صفحه‌بندی' }) {
  if (!total) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  return (
    <nav className="ui-pagination" aria-label={label}>
      <span className="ui-pagination-range">
        نمایش {faNum(first)} تا {faNum(last)} از {faNum(total)}
      </span>
      {pageCount > 1 && (
        <div className="ui-pagination-controls">
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronRight size={14} />}
            disabled={current <= 1 || loading}
            onClick={() => onChange(current - 1)}
          >
            قبلی
          </Button>
          <span className="ui-pagination-page" aria-live="polite">
            صفحه {faNum(current)} از {faNum(pageCount)}
          </span>
          <Button variant="secondary" size="sm" disabled={current >= pageCount || loading} onClick={() => onChange(current + 1)}>
            بعدی
            <ChevronLeft size={14} />
          </Button>
        </div>
      )}
    </nav>
  );
}
