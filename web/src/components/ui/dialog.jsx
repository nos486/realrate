import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({ open, onOpenChange, children }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        onClick={() => onOpenChange?.(false)}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      />
      {/* Content wrapper */}
      <div className="relative z-10 w-full max-w-2xl my-auto animate-in zoom-in-95 fade-in duration-200">
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogContent({ className, children, onClose }) {
  return (
    <div
      className={cn(
        'relative w-full rounded-2xl bg-[#0e131f] text-slate-100 border border-white/10 shadow-2xl p-6 overflow-hidden',
        'light:bg-white light:text-slate-900 light:border-slate-200 light:shadow-xl',
        className
      )}
    >
      {onClose && (
        <button
          onClick={onClose}
          type="button"
          aria-label="بستن"
          className="absolute top-4 start-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 light:text-slate-500 light:hover:text-slate-900 light:hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      {children}
    </div>
  );
}

export function DialogHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-start pb-4 border-b border-white/5 light:border-slate-100', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }) {
  return (
    <h2
      className={cn('text-lg font-bold text-white light:text-slate-900 tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }) {
  return (
    <p
      className={cn('text-xs text-slate-400 light:text-slate-500 leading-relaxed', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }) {
  return <div className={cn('py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/5 light:border-slate-100',
        className
      )}
      {...props}
    />
  );
}
