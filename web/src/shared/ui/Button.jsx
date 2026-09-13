import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Universal Minimalist Button Component
 * Driven entirely by CSS design tokens (no hardcoded colors, sizes, borders, or shadows).
 *
 * @param {'primary' | 'secondary' | 'ghost' | 'danger'} [variant='primary']
 * @param {'sm' | 'md' | 'lg'} [size='md']
 * @param {boolean} [loading=false]
 * @param {boolean} [block=false]
 * @param {React.ReactNode} [icon] - Leading icon
 * @param {React.ReactNode} [iconRight] - Trailing icon
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    icon = null,
    iconRight = null,
    disabled = false,
    type = 'button',
    className = '',
    children,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  const classNames = [
    'ui-btn',
    `ui-btn-${variant}`,
    `ui-btn-${size}`,
    block ? 'ui-btn-block' : '',
    loading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classNames}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} className="spin-anim ui-btn-spinner" />
      ) : (
        icon && <span className="ui-btn-icon leading">{icon}</span>
      )}

      {children && <span className="ui-btn-label">{children}</span>}

      {!loading && iconRight && (
        <span className="ui-btn-icon trailing">{iconRight}</span>
      )}
    </button>
  );
});

export default Button;
