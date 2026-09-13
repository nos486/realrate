import React, { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';

export default function ShareLinkToggle({ portfolio, onOpenSettings }) {
  const [copied, setCopied] = useState(false);

  if (!portfolio) return null;

  const shareUrl = portfolio.shareSlug
    ? `${window.location.origin}/p/${portfolio.shareSlug}`
    : '';

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="share-link-toggle-widget">
      {portfolio.shareEnabled ? (
        <div className="share-active-pill" onClick={onOpenSettings} title="مدیریت تنظیمات اشتراک">
          <Share2 size={13} className="share-icon active" />
          <span className="share-slug-text">لینک اشتراک فعال است</span>
          <button
            type="button"
            className="btn-copy-share-url"
            onClick={handleCopy}
            title="کپی لینک عمومی"
          >
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-enable-share-link"
          onClick={onOpenSettings}
          title="فعال‌سازی لینک اشتراک‌گذاری عمومی برای این پورتفو"
        >
          <Share2 size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          <span>اشتراک‌گذاری</span>
        </button>
      )}
    </div>
  );
}
