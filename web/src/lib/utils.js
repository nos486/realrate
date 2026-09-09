import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes conditionally and resolves conflicts cleanly.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
