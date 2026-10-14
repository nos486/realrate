import React, { useState } from 'react';
import { t } from '../../utils/i18n.js';

/**
 * BankLogo — a bank's logo on a light tile (bank marks are drawn for light backgrounds), or
 * the first letter of its name for custom / unrecognized banks.
 * @param {{ bank: import('./resolveBank.js').ResolvedBank, size?: number, className?: string }} props
 */
export default function BankLogo({ bank, size = 32, className = '' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (bank?.logo && !failed) {
    return (
      <span className={`bank-logo ${className}`} style={style} aria-hidden="true">
        <img src={bank.logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  }

  const unknown = t('؟');
  const initial = (bank?.shortName || bank?.name || unknown).replace(/^(بانک|مؤسسه|موسسه)\s+/, '').trim().charAt(0) || unknown; // i18n-ignore
  return (
    <span
      className={`bank-logo is-placeholder ${bank?.kind === 'none' ? 'is-empty' : ''} ${className}`}
      style={{ ...style, fontSize: Math.round(size * 0.44) }}
      aria-hidden="true"
    >
      {bank?.kind === 'none' ? '—' : initial}
    </span>
  );
}
