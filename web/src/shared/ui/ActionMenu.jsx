import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

/**
 * ActionMenu — a "⋮" button that opens a short list of secondary actions
 *
 * For rows with more actions than fit on a phone: the main action stays a button, the rest go
 * here. Closes on a choice, a tap outside, or Escape.
 *
 * The list floats above the page (a portal, fixed under the button — or above it when there is no
 * room below), so a card or list that clips its overflow never cuts it off.
 *
 * @param {Array<{ key: string, label: string, icon?: React.ReactNode, onClick: () => void,
 *   disabled?: boolean, danger?: boolean, title?: string }>} items — falsy entries are skipped
 * @param {string} [label] — the button's accessible name
 */
export default function ActionMenu({ items = [], label = 'گزینه‌های بیشتر', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const list = items.filter(Boolean);

  // Pin the list to the button in the viewport; follow it while the page scrolls or resizes
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const trigger = rootRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight || 0;
      const below = window.innerHeight - r.bottom;
      const up = below < menuHeight + 12 && r.top > below;
      const rtl = getComputedStyle(trigger).direction === 'rtl';
      setPlace({
        top: up ? 'auto' : r.bottom + 6,
        bottom: up ? window.innerHeight - r.top + 6 : 'auto',
        left: rtl ? r.left : 'auto',
        right: rtl ? 'auto' : window.innerWidth - r.right,
        direction: rtl ? 'rtl' : 'ltr',
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inside = rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target);
      if (!inside) setOpen(false);
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
      {open && createPortal(
        <ul
          ref={menuRef}
          className="ui-action-menu-list is-floating"
          role="menu"
          id={menuId}
          style={place || { visibility: 'hidden' }}
        >
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
        </ul>,
        document.body
      )}
    </div>
  );
}
