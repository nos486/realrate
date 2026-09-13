import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Standard Unified Modal Component
 *
 * Features:
 * - Desktop: Centered pop-in dialog with glassmorphism
 * - Mobile (<640px): Ergonomic touch-friendly Bottom-Sheet drawer with drag handle
 * - Automatic body scroll lock and cleanup
 * - ESC key dismissal
 * - Backdrop click to close
 * - Pinned header and footer with isolated scrollable body
 * - Optional form wrapping via onSubmit prop
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
      <div className="modal-drag-handle" />
      <div className="modal-header">
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

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        ref={contentRef}
        className={`modal-content ${className}`}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {onSubmit ? (
          <form onSubmit={onSubmit} className="modal-form-layout">
            {innerContent}
          </form>
        ) : (
          innerContent
        )}
      </div>
    </div>
  );
}
