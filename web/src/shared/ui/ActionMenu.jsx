import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * ActionMenu — a "⋮" button that opens a short list of secondary actions
 *
 * For rows with more actions than fit on a phone: the main action stays a button, the rest go
 * here. Closes on a choice, a tap outside, or Escape.
 *
 * @param {Array<{ key: string, label: string, icon?: React.ReactNode, onClick: () => void,
 *   disabled?: boolean, danger?: boolean, title?: string }>} items — falsy entries are skipped
 * @param {string} [label] — the button's accessible name
 */
export default function ActionMenu({ items = [], label = 'گزینه‌های بیشتر', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const list = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!list.length) return null;

  return (
    <div className={`ui-action-menu ${className}`} ref={rootRef}>
      <button
        type="button"
        className="ui-btn ui-btn-secondary ui-btn-sm ui-action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <ul className="ui-action-menu-list" role="menu" id={menuId}>
          {list.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className={`ui-action-menu-item ${item.danger ? 'is-danger' : ''}`}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
