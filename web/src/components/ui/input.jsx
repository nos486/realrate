import React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef(({ className, type = 'text', error, ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50',
        'light:bg-slate-50 light:border-slate-200 light:text-slate-900 light:placeholder:text-slate-400 light:focus-visible:bg-white',
        'disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-150',
        error && 'border-rose-500/50 focus-visible:ring-rose-500/30',
        className
      )}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export const Textarea = React.forwardRef(({ className, error, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50',
        'light:bg-slate-50 light:border-slate-200 light:text-slate-900 light:placeholder:text-slate-400 light:focus-visible:bg-white',
        'disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-150',
        error && 'border-rose-500/50 focus-visible:ring-rose-500/30',
        className
      )}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';

export const Label = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={cn('text-xs font-semibold text-slate-300 light:text-slate-700 block select-none', className)}
      {...props}
    />
  );
});

Label.displayName = 'Label';
