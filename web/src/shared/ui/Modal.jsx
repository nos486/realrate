import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Dragged down further than this (px), or flicked, a bottom sheet closes */
const SWIPE_CLOSE_DISTANCE = 110;
const SWIPE_CLOSE_VELOCITY = 0.7;
const isSheetLayout = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;
import { X } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackToClose.js';

/**
 * Standard Unified Modal Component
 *
 * Features:
 * - Desktop: Centered pop-in dialog with glassmorphism
 * - Mobile (<640px): Ergonomic touch-friendly Bottom-Sheet drawer; dragging it down by its
 *   handle or header closes it (a deliberate gesture, unlike a stray tap outside)
 * - Automatic body scroll lock and cleanup
 * - ESC key dismissal; the phone's back button closes it (useBackToClose)
 * - Pinned header and footer with isolated scrollable body
 * - Backdrop click does NOT close the modal — only explicit actions do (the × button, a
 *   footer's cancel/submit, etc.), so an accidental click outside never discards in-progress input
 * - Optional form wrapping via onSubmit prop
 * - Rendered at the end of <body> (a portal): an ancestor with a transform, filter or
 *   backdrop-filter (a page's entry animation, another modal's frosted card) would otherwise
 *   become the box `position: fixed` is measured from — the sheet ends up inside it, clipped or
 *   under the app's bottom bar, and a modal opened from another modal's form would sit inside that
 *   <form> (Enter in its fields submitting the form below)
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  icon = null,
  subtitle = null,
  children,
  footer = null,
  onSubmit = null,
  maxWidth = '520px',
  className = '',
  bodyClassName = '',
}) {
  const contentRef = useRef(null);
  const drag = useRef(null);
  useBackToClose(isOpen, onClose);

  // Bottom sheet (phones): follow the finger down from the handle or header, close past a point
  const setOffset = (px, animate) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
    el.style.transform = px ? `translateY(${px}px)` : '';
  };
  const onGripDown = (e) => {
    if (!isSheetLayout() || e.target.closest('button, a, input, select, textarea')) return;
    drag.current = { y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e) => {
    if (drag.current) setOffset(Math.max(0, e.clientY - drag.current.y), false);
  };
  const onGripUp = (e) => {
    if (!drag.current) return;
    const distance = Math.max(0, e.clientY - drag.current.y);
    const velocity = distance / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (distance > SWIPE_CLOSE_DISTANCE || velocity > SWIPE_CLOSE_VELOCITY) onClose?.();
    else setOffset(0, true);
  };
  const grip = { onPointerDown: onGripDown, onPointerMove: onGripMove, onPointerUp: onGripUp, onPointerCancel: onGripUp };

  useEffect(() => {
    if (!isOpen) return;

    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const innerContent = (
    <>
      <div className="modal-drag-handle" {...grip} />
      <div className="modal-header" {...grip}>
        <div className="modal-title-wrap">
          {icon && <span className="modal-icon">{icon}</span>}
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="بستن"
        >
          <X size={18} />
        </button>
      </div>

      <div className={`modal-scroll-body ${bodyClassName}`}>
        {children}
      </div>

      {footer && (
        <div className="modal-actions-pinned">
          {footer}
        </div>
      )}
    </>
  );

  const dialog = (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div
        ref={contentRef}
        className={`modal-content ${className}`}
        style={{ maxWidth }}
      >
        {onSubmit ? (
          // React events bubble through portals: a modal's form must not submit the form of
          // the modal (or page) it was opened from
          <form onSubmit={(e) => { e.stopPropagation(); onSubmit(e); }} className="modal-form-layout">
            {innerContent}
          </form>
        ) : (
          innerContent
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' && document.body ? createPortal(dialog, document.body) : dialog;
}
