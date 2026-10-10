/**
 * FullscreenLoader.jsx — The blocking loader (BlockingOverlay) while a write request (save, delete,
 * import) is in flight. Reads use per-view skeletons; a tab being opened has TabLoadingGate.
 */

import React, { useState, useEffect } from 'react';
import { subscribeLoading } from '../api/httpClient.js';
import BlockingOverlay from './BlockingOverlay.jsx';

const SHOW_DELAY_MS = 400;

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

  if (!isLoading) return null;
  return (
    <BlockingOverlay
      title="در حال بارگذاری اطلاعات از سرور"
      subtitle="لطفاً شکیبا باشید، در حال پردازش و همگام‌سازی داده‌ها..."
    />
  );
}
