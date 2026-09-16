import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { toEnglishDigits } from '../utils/formatters.js';
import { getReferenceRatesSpecs } from '../config/sources.config.js';

function formatRate(num) {
  if (num === null || num === undefined || num === '') return '...';
  const str = toEnglishDigits(String(num)).replace(/[,،٬\s]/g, '').trim();
  const clean = parseFloat(str);
  if (isNaN(clean) || clean === 0) return '...';
  return Math.round(clean).toLocaleString('fa-IR');
}

/**
 * LiveRatesTicker:
 * Interactive dropdown selector for live reference rates (USD, USDT, etc.)
 * Allows user to select base calculation rate from a sleek dropdown menu.
 */
export default function LiveRatesTicker({
  usdPrice,
  onUsdClick,
  activeReferenceRate = null,
  referenceRates = [],
  onCycleReferenceRate = null,
  onSelectReferenceRate = null,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const defaultRefSpec = getReferenceRatesSpecs()[0];
  const canSelect = referenceRates && referenceRates.length > 1;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const labelDesktop = activeReferenceRate?.label || defaultRefSpec?.label || '';
  const labelMobile = activeReferenceRate?.shortLabel || defaultRefSpec?.shortLabel || '';
  const itemKey = activeReferenceRate?.key || defaultRefSpec?.key || 'usd';
  const pulseColor = activeReferenceRate?.pulseColor || defaultRefSpec?.pulseColor || (itemKey === 'usdt' ? 'cyan' : 'green');
  const displayPrice = (usdPrice !== undefined && usdPrice !== null && usdPrice !== '')
    ? usdPrice
    : (activeReferenceRate?.price || 0);

  const handleTriggerClick = () => {
    if (canSelect) {
      setIsOpen((prev) => !prev);
    } else if (onCycleReferenceRate) {
      onCycleReferenceRate();
    } else if (onUsdClick) {
      onUsdClick();
    }
  };

  const handleSelectOption = (rateKey) => {
    if (onSelectReferenceRate) {
      onSelectReferenceRate(rateKey);
    } else if (onCycleReferenceRate) {
      onCycleReferenceRate();
    }
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`main-live-ticker-wrap ${className}`}
      style={{ position: 'relative' }}
    >
      <button
        type="button"
        className={`main-live-ticker ${isOpen ? 'open' : ''}`}
        onClick={handleTriggerClick}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={canSelect ? 'انتخاب نرخ مرجع محاسبات (دلار، تتر، ...)' : `نرخ زنده ${labelDesktop}`}
      >
        <span className="ticker-lead">
          <span className={`ticker-pulse ${pulseColor}`} />
          <span className="ticker-tag desktop-text">{labelDesktop}:</span>
          <span className="ticker-tag mobile-text">{labelDesktop || labelMobile}:</span>
        </span>

        <span className="ticker-value-group">
          <strong className="ticker-amount">{formatRate(displayPrice)}</strong>
          <span className="ticker-unit">تومان</span>

          {canSelect && (
            <span
              className="main-live-ticker-chevron"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                color: 'var(--text-muted)',
                marginRight: '2px',
              }}
            >
              <ChevronDown size={14} />
            </span>
          )}
        </span>
      </button>

      {/* Floating Dropdown Selector Menu */}
      {isOpen && canSelect && (
        <div
          className="main-live-ticker-menu"
          role="listbox"
          aria-label="انتخاب نرخ مرجع"
        >
          <div className="main-live-ticker-menu-header">
            <span>انتخاب نرخ مبنای محاسبات</span>
          </div>

          {referenceRates.map((rate) => {
            const isSelected = rate.key === itemKey;
            const ratePulse = rate.pulseColor || (rate.key === 'usdt' ? 'cyan' : 'green');
            const rateFormattedPrice = formatRate(rate.price);

            return (
              <button
                key={rate.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`main-live-ticker-option ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelectOption(rate.key)}
              >
                <div className="ticker-option-left">
                  <span className={`ticker-pulse ${ratePulse}`} />
                  <span className="ticker-option-name">
                    {rate.label || rate.name}
                  </span>
                  {rate.symbol && (
                    <span className="ticker-option-sym">
                      ({rate.symbol})
                    </span>
                  )}
                </div>

                <div className="ticker-option-right">
                  <strong className="ticker-option-price">
                    {rateFormattedPrice} <span className="ticker-option-unit">تومان</span>
                  </strong>
                  {isSelected && (
                    <Check size={14} className="ticker-option-check" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
