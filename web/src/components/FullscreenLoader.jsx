import React, { useState, useEffect } from 'react';
import { subscribeLoading } from '../api/client.js';

/**
 * FullscreenLoader — Global blocking loading screen that captures all pointer and keyboard events
 * whenever data is loading from the server across any page.
 */
export default function FullscreenLoader() {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeLoading((loading) => {
      setIsLoading(loading);
    });
    return unsubscribe;
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
