import React from 'react';
import { cn } from '@/lib/utils';

export const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={cn('w-full caption-bottom text-sm text-start', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

export const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('border-b border-white/10 bg-white/[0.02] light:border-slate-200 light:bg-slate-50/50', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-white/[0.05] transition-colors hover:bg-white/[0.03] data-[state=selected]:bg-white/[0.05]',
      'light:border-slate-100 light:hover:bg-slate-50',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-12 px-5 text-start align-middle font-bold text-xs text-slate-300 light:text-slate-700 uppercase tracking-wider select-none',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('py-4 px-5 align-middle text-slate-200 light:text-slate-800 text-sm', className)} {...props} />
));
TableCell.displayName = 'TableCell';
