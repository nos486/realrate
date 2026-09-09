import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-semibold shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98]',
        gold:
          'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 active:scale-[0.98]',
        secondary:
          'bg-white/[0.05] text-slate-200 border border-white/10 hover:bg-white/[0.09] hover:text-white light:bg-slate-100 light:text-slate-800 light:border-slate-200 light:hover:bg-slate-200 active:scale-[0.98]',
        outline:
          'border border-white/10 bg-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white light:border-slate-300 light:text-slate-700 light:hover:bg-slate-100 active:scale-[0.98]',
        ghost:
          'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] light:text-slate-600 light:hover:text-slate-900 light:hover:bg-slate-100 active:scale-[0.98]',
        destructive:
          'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 active:scale-[0.98]',
        success:
          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 active:scale-[0.98]',
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm',
        sm: 'h-8 px-3 text-xs rounded-lg',
        lg: 'h-12 px-6 text-base rounded-2xl',
        icon: 'h-9 w-9 p-0 rounded-xl',
        'icon-sm': 'h-7 w-7 p-0 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  }
);

export const Button = React.forwardRef(
  ({ className, variant, size, isLoading = false, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-current" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { buttonVariants };
