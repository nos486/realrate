/**
 * AppSheet.jsx — A bottom sheet, the Android way to offer a few choices on top of a page
 *
 * Slides up from the bottom over a dimmed page. Closes on the backdrop, Escape, the phone's back
 * button (useBackToClose), or by dragging it down by its handle. Content scrolls inside when tall.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '../hooks/useBackToClose.js';

/** Dragged down further than this (px), or flicked, it closes */
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.6;

export default function AppSheet({ open, onClose, title, children, className = '' }) {
  const sheetRef = useRef(null);
  const drag = useRef(null);
  const [offset, setOffset] = useState(0);
  useBackToClose(open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement;
    sheetRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
      setOffset(0);
    };
  }, [open, onClose]);

  const onPointerDown = (e) => {
    drag.current = { y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOffset(Math.max(0, e.clientY - drag.current.y));
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const distance = Math.max(0, e.clientY - drag.current.y);
    const velocity = distance / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (distance > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) onClose();
    else setOffset(0);
  };

  return createPortal(
    <div className={`app-sheet-root ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="app-sheet-backdrop" onClick={onClose} />
      <section
        ref={sheetRef}
        className={`app-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        inert={!open}
        style={offset ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined}
      >
        <div
          className="app-sheet-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="app-sheet-handle" />
          {title && <h2 className="app-sheet-title">{title}</h2>}
        </div>
        <div className="app-sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
