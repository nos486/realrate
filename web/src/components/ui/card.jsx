import React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.08] bg-[#0f1422]/95 text-slate-100 shadow-xl backdrop-blur-md transition-all duration-200',
        'light:bg-white light:border-slate-200 light:text-slate-900 light:shadow-sm',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn('text-base font-extrabold text-white light:text-slate-900 tracking-tight flex items-center gap-2', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-slate-400 light:text-slate-500 leading-relaxed', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center p-5 pt-0 border-t border-white/[0.06] light:border-slate-100', className)} {...props} />;
}
