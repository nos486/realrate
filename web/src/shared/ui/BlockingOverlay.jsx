/**
 * BlockingOverlay.jsx — A loader in the middle of the screen that takes every tap, key and scroll
 * while the app waits on the server: nothing behind it can be opened or sent again
 *
 * Shown by FullscreenLoader (a write on its way) and TabLoadingGate (a tab being opened). `action`:
 * an optional button under it.
 */

import React, { useEffect } from 'react';

/**
 * @param {{ title: string, subtitle?: string, action?: React.ReactNode }} props
 */
export default function BlockingOverlay({ title, subtitle = '', action = null }) {
  useEffect(() => {
    // No scrolling behind it, and no keyboard reaching what is under it (its own button aside)
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => {
      if (e.target?.closest?.('.fullscreen-loader-action')) return;
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);

  return (
    <div className="fullscreen-loader-overlay" role="alert" aria-busy="true" aria-live="assertive">
      <div className="fullscreen-loader-backdrop" />
      <div className="fullscreen-loader-box">
        <div className="loader-orbit-container">
          <div className="loader-ring outer-ring" />
          <div className="loader-ring inner-ring" />
          <div className="loader-center-spark" />
        </div>
        <div className="loader-text-content">
          <h4 className="loader-main-title">{title}</h4>
          {subtitle && <p className="loader-sub-title">{subtitle}</p>}
        </div>
        <div className="loader-progress-track">
          <div className="loader-progress-bar" />
        </div>
        {action && <div className="fullscreen-loader-action">{action}</div>}
      </div>
    </div>
  );
}
