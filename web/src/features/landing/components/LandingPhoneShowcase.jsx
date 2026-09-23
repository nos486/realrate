import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, Eye, EyeOff, Lock, Check, Smartphone, Sparkles, PieChart } from 'lucide-react';

export default function LandingPhoneShowcase() {
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <section className="landing-showcase-section">
      <div className="landing-container">
        <div className="showcase-layout-grid">
          {/* Left Column: Phone Mockup */}
          <motion.div
            className="showcase-phone-col"
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="phone-device-frame">
              {/* Dynamic Island / Speaker Notch */}
              <div className="phone-notch">
                <div className="notch-speaker"></div>
                <div className="notch-camera"></div>
              </div>

              {/* Inside Screen Content */}
              <div className="phone-screen-content">
                {/* Mobile Top Bar */}
                <div className="phone-screen-header">
                  <div className="phone-brand">
                    <span className="dot gold"></span>
                    <strong>پورتفوی طلای مهدی</strong>
                  </div>
                  <button
                    type="button"
                    className="phone-privacy-toggle"
                    onClick={() => setIsPrivate(!isPrivate)}
                    title={isPrivate ? 'نمایش مبالغ' : 'مخفی‌سازی مبالغ'}
                  >
                    {isPrivate ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Total Balance Card */}
                <div className="phone-balance-card">
                  <span className="card-label">ارزش کل سبد اشتراک‌گذاری‌شده</span>
                  <div className="card-amount">
                    {isPrivate ? (
                      <span className="masked-digits">••••••••• تومان</span>
                    ) : (
                      <>
                        <strong>۲۹۴٬۸۰۰٬۰۰۰</strong> <span className="unit">تومان</span>
                      </>
                    )}
                  </div>
                  <div className="card-gain">
                    <span className="gain-pill">+۱۲.۴٪ سود دوره</span>
                  </div>
                </div>

                {/* Mini Asset Rows */}
                <div className="phone-assets-list">
                  <div className="phone-asset-item">
                    <div className="asset-dot gold"></div>
                    <div className="asset-names">
                      <strong>طلای ۱۸ عیار</strong>
                      <span>۳۵ گرم</span>
                    </div>
                    <div className="asset-val">
                      {isPrivate ? '••••••' : '۱۶۶٬۲۵۰٬۰۰۰ ت'}
                    </div>
                  </div>

                  <div className="phone-asset-item">
                    <div className="asset-dot coin"></div>
                    <div className="asset-names">
                      <strong>سکه امامی طرح جدید</strong>
                      <span>۲ قطعه</span>
                    </div>
                    <div className="asset-val">
                      {isPrivate ? '••••••' : '۱۰۸٬۴۰۰٬۰۰۰ ت'}
                    </div>
                  </div>

                  <div className="phone-asset-item">
                    <div className="asset-dot stock"></div>
                    <div className="asset-names">
                      <strong>صندوق طلای عیار</strong>
                      <span>۱٬۰۶۰ واحد</span>
                    </div>
                    <div className="asset-val">
                      {isPrivate ? '••••••' : '۲۰٬۱۵۰٬۰۰۰ ت'}
                    </div>
                  </div>
                </div>

                {/* Share Link Pill in App */}
                <div className="phone-share-status">
                  <Share2 size={13} className="share-icon" />
                  <span>لینک فعال: realrate.ir/p/mehdi-gold</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Explanatory Copy & Benefits */}
          <motion.div
            className="showcase-text-col"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="section-tag-badge">
              <Share2 size={14} />
              <span>اشتراک‌گذاری هوشمند</span>
            </div>

            <h2 className="section-title">
              پورتفوی خود را با همکاران یا خانواده به اشتراک بگذارید؛{' '}
              <span className="text-gradient-gold">با حفظ کامل حریم خصوصی</span>
            </h2>

            <p className="section-subtitle text-right">
              می‌خواهید ترکیب سبد سرمایه‌گذاری خود را به مشاور مالی‌تان نشان دهید، اما مایل نیستید مبالغ
              دقیق فاش شوند؟ با یک کلیک لینک اختصاصی بسازید:
            </p>

            <div className="showcase-perks-list">
              <div className="perk-item">
                <div className="perk-check">
                  <Check size={16} />
                </div>
                <div>
                  <strong>حالت حریم خصوصی (Privacy Mode):</strong>
                  <p>امکان مخفی‌سازی ارقام ریالی و نمایش صرفاً درصدها و ترکیب نمادها با یک کلیک.</p>
                </div>
              </div>

              <div className="perk-item">
                <div className="perk-check">
                  <Check size={16} />
                </div>
                <div>
                  <strong>محافظت با رمز عبور (اختیاری):</strong>
                  <p>تعیین رمز اختصاصی روی لینک اشتراک‌گذاری برای دسترسی صرفاً افراد مجاز.</p>
                </div>
              </div>

              <div className="perk-item">
                <div className="perk-check">
                  <Check size={16} />
                </div>
                <div>
                  <strong>تجربه عالی روی موبایل (PWA آماده نصب):</strong>
                  <p>بدون نیاز به دانلود از اپ‌استورها؛ با باز کردن در سافاری یا کروم، مستقیماً به صفحه اصلی گوشی بیفزایید.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
