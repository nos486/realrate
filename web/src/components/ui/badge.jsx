import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors select-none',
  {
    variants: {
      variant: {
        default:
          'bg-white/10 text-slate-200 border border-white/10 light:bg-slate-100 light:text-slate-800 light:border-slate-200',
        gold:
          'bg-amber-500/15 text-amber-400 border border-amber-500/30',
        success:
          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
        destructive:
          'bg-rose-500/15 text-rose-400 border border-rose-500/30',
        outline:
          'border border-white/20 text-slate-400 light:border-slate-300 light:text-slate-600',
        telegram:
          'bg-[#229ED9]/15 text-[#229ED9] border border-[#229ED9]/30',
        api:
          'bg-purple-500/15 text-purple-400 border border-purple-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
