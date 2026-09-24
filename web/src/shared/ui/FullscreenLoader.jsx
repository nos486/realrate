import React, { useState, useEffect } from 'react';
import { subscribeLoading } from '../api/httpClient.js';

const SHOW_DELAY_MS = 400;

/**
 * FullscreenLoader — Global blocking loading screen that captures all pointer and keyboard events
 * while a write request (save, delete, import) is in flight. Reads use per-view skeletons.
 */
export default function FullscreenLoader() {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Only show for writes that take a noticeable time, so quick saves don't flash a
    // full-screen overlay
    let timer = null;
    const unsubscribe = subscribeLoading((loading) => {
      window.clearTimeout(timer);
      if (loading) {
        timer = window.setTimeout(() => setIsLoading(true), SHOW_DELAY_MS);
      } else {
        setIsLoading(false);
      }
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';

      // Prevent tab-focusing underlying hidden buttons
      const handleKeyDown = (e) => {
        if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
        }
      };
      window.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div
      className="fullscreen-loader-overlay"
      role="alert"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="fullscreen-loader-backdrop" />
      <div className="fullscreen-loader-box">
        {/* Animated Dual Glowing Rings */}
        <div className="loader-orbit-container">
          <div className="loader-ring outer-ring" />
          <div className="loader-ring inner-ring" />
          <div className="loader-center-spark" />
        </div>

        {/* Informative Persian Loading Text */}
        <div className="loader-text-content">
          <h4 className="loader-main-title">در حال بارگذاری اطلاعات از سرور</h4>
          <p className="loader-sub-title">لطفاً شکیبا باشید، در حال پردازش و همگام‌سازی داده‌ها...</p>
        </div>

        {/* Shimmering Progress Bar */}
        <div className="loader-progress-track">
          <div className="loader-progress-bar" />
        </div>
      </div>
    </div>
  );
}
