import React, { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { publicOrigin } from '../../../shared/native/nativeApp.js';
import { t } from '../../../utils/i18n.js';

export default function ShareLinkToggle({ portfolio, onOpenSettings }) {
  const [copied, setCopied] = useState(false);

  if (!portfolio) return null;

  const shareUrl = portfolio.shareSlug
    ? `${publicOrigin()}/p/${portfolio.shareSlug}`
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
        <div className="share-active-pill" onClick={onOpenSettings} title={t('مدیریت تنظیمات اشتراک')}>
          <Share2 size={13} className="share-icon active" />
          <span className="share-slug-text">{t('لینک اشتراک فعال است')}</span>
          <button
            type="button"
            className="btn-copy-share-url"
            onClick={handleCopy}
            title={t('کپی لینک عمومی')}
          >
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-enable-share-link"
          onClick={onOpenSettings}
          title={t('فعال‌سازی لینک اشتراک‌گذاری عمومی برای این پورتفو')}
        >
          <Share2 size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
          <span>{t('اشتراک‌گذاری')}</span>
        </button>
      )}
    </div>
  );
}
