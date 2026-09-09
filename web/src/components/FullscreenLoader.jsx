import React, { useState, useEffect } from 'react';
import { subscribeLoading } from '../api/client.js';
import { RefreshCw } from 'lucide-react';

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
      document.body.style.overflow = 'hidden';

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="alert"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-4 p-6 sm:p-8 rounded-2xl border border-white/10 bg-[#0e131f]/95 shadow-2xl text-center max-w-sm w-full animate-in zoom-in-95 duration-200 light:bg-white light:border-slate-200">
        <div className="relative flex items-center justify-center w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 animate-ping" />
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        </div>

        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-bold text-white light:text-slate-900 m-0">
            در حال بارگذاری اطلاعات از سرور
          </h4>
          <p className="text-xs text-slate-400 light:text-slate-500 m-0">
            لطفاً شکیبا باشید، در حال پردازش و همگام‌سازی داده‌ها...
          </p>
        </div>

        <div className="w-full h-1 bg-white/10 light:bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full animate-pulse w-2/3 mx-auto" />
        </div>
      </div>
    </div>
  );
}
