/**
 * PortfolioPlanCards.jsx — The portfolio's planning cards: «هدف ترکیب» and «آزمون ریسک‌پذیری»
 *
 * Rendered in the overview column on wide screens and below the holdings on narrow ones
 * (HoldingsView), so the records come first on a phone. Each card is left out when it has
 * nothing to show (no allocation, locked vault, no opener).
 */

import React from 'react';
import { Gauge } from 'lucide-react';
import AllocationTargetsCard from './AllocationTargetsCard.jsx';
import RiskMixPie from './RiskMixPie.jsx';
import { profileOf, mixItemsOf } from '../../../utils/riskProfile.js';

export default function PortfolioPlanCards({
  // Category targets against today's mix (utils/allocationTargets.js); null hides the card
  allocation = null,
  onEditTargets = null,
  // The risk-tolerance test (utils/riskProfile.js): its latest result and the opener; null hides the card
  riskResult = null,
  onOpenRisk = null,
  hideValues = false,
  isVaultLocked = false,
}) {
  if (isVaultLocked) return null;
  return (
    <>
      {allocation && (
        <AllocationTargetsCard allocation={allocation} onEdit={onEditTargets} readOnly={!onEditTargets} hideValues={hideValues} />
      )}
      {/* Risk-tolerance test */}
      {onOpenRisk && (
        <div className="portfolio-stat-card risk-profile-card">
          <div className="stat-header">
            <span className="stat-label"><Gauge size={13} /> آزمون ریسک‌پذیری</span>
          </div>
          {riskResult ? (
            <>
              <p className="stat-sub risk-profile-card-result">
                <strong>{profileOf(riskResult.score).title}</strong>
                {' '}— {riskResult.score.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪
              </p>
              <RiskMixPie items={mixItemsOf(profileOf(riskResult.score).allocation)} />
            </>
          ) : (
            <p className="stat-sub">با چند سؤال کوتاه بسنجید چقدر ریسک‌پذیر هستید و چه ترکیبی برای این پورتفو مناسب است.</p>
          )}
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onOpenRisk}>
            <Gauge size={14} /> {riskResult ? 'مشاهدهٔ نتیجه' : 'شروع آزمون'}
          </button>
        </div>
      )}
    </>
  );
}
