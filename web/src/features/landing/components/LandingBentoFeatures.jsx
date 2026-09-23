import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Briefcase,
  Lock,
  Receipt,
  Landmark,
  Wallet,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Check,
} from 'lucide-react';

function BentoCard({ children, className = '', title, subtitle, icon: Icon, badge }) {
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`bento-card ${className}`}
    >
      <div className="bento-glow-surface"></div>
      <div className="bento-card-inner">
        <div className="bento-header">
          <div className="bento-icon-box">
            <Icon size={20} />
          </div>
          {badge && <span className="bento-badge">{badge}</span>}
        </div>

        <div className="bento-meta">
          <h3 className="bento-title">{title}</h3>
          <p className="bento-subtitle">{subtitle}</p>
        </div>

        <div className="bento-interactive-preview">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function LandingBentoFeatures() {
  return (
    <section className="landing-bento-section" id="features">
      <div className="landing-container">
        {/* Section Header */}
        <div className="landing-section-header">
          <div className="section-tag-badge">
            <Sparkles size={14} />
            <span>امکانات یکپارچه</span>
          </div>
          <h2 className="section-title">
            هر آنچه برای تسلط کامل بر سرمایه‌تان نیاز دارید
          </h2>
          <p className="section-subtitle">
            شش ابزار قدرتمند و تخصصی مهندسی‌شده در یک پنل منسجم، سریع و محرمانه
          </p>
        </div>

        {/* Bento Grid 6 Asymmetric Cards */}
        <motion.div
          className="bento-grid"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Card 1: Live Rates & Bubble (Large Col 1) */}
          <BentoCard
            className="bento-col-span-2 bento-card-rates"
            title="نرخ لحظه‌ای و تحلیل موشکافانه حباب"
            subtitle="پایش برخط قیمت دلار، طلای ۱۸ عیار، سکه امامی و بهار آزادی، انس جهانی، تتر و ارزهای فیات با فرمول دقیق حباب ذاتی"
            icon={TrendingUp}
            badge="هوشمند و زنده"
          >
            <div className="preview-sparkline-box">
              <div className="preview-rate-row">
                <div className="asset-info">
                  <strong>طلای ۱۸ عیار</strong>
                  <span>۴٬۷۵۰٬۰۰۰ تومان/گرم</span>
                </div>
                <div className="asset-bubble-pill">
                  <span className="dot"></span>
                  حباب صفر (طلای خام)
                </div>
              </div>

              <div className="preview-rate-row">
                <div className="asset-info">
                  <strong>سکه تمام بهار آزادی</strong>
                  <span>۴۸٬۵۰۰٬۰۰۰ تومان</span>
                </div>
                <div className="asset-bubble-pill warning">
                  +۸.۲٪ حباب (۳٬۹۰۰٬۰۰۰ تومان)
                </div>
              </div>

              {/* Animated Stroke Chart SVG */}
              <div className="preview-mini-chart">
                <svg viewBox="0 0 400 70" preserveAspectRatio="none" className="bento-chart-svg">
                  <path
                    d="M0,50 Q60,20 120,40 T240,15 T340,30 T400,10"
                    fill="none"
                    stroke="url(#bentoGoldGrad)"
                    strokeWidth="3"
                    className="bento-chart-line"
                  />
                  <defs>
                    <linearGradient id="bentoGoldGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </BentoCard>

          {/* Card 2: Multi-Portfolio Tracker */}
          <BentoCard
            className="bento-card-portfolio"
            title="پورتفوی جامع چندگانه"
            subtitle="ردیابی موجودی طلا، سکه، ارز، سهام و صندوق‌های بورس با ارزش‌گذاری ریالی و ارزی"
            icon={Briefcase}
            badge="تخصیص هوشمند"
          >
            <div className="preview-portfolio-widget">
              <div className="alloc-bar-wrapper">
                <div className="alloc-bar gold" style={{ width: '45%' }} title="طلا و سکه"></div>
                <div className="alloc-bar crypto" style={{ width: '25%' }} title="ارز و کریپتو"></div>
                <div className="alloc-bar stock" style={{ width: '30%' }} title="سهام و صندوق"></div>
              </div>
              <div className="alloc-legend">
                <span><span className="dot gold"></span>طلا: ۴۵٪</span>
                <span><span className="dot crypto"></span>ارز: ۲۵٪</span>
                <span><span className="dot stock"></span>بورس: ۳۰٪</span>
              </div>
            </div>
          </BentoCard>

          {/* Card 3: Zero-Knowledge E2EE Vault */}
          <BentoCard
            className="bento-card-vault"
            title="گاوصندوق رمزنگاری سرتاسری (E2EE)"
            subtitle="پورتفوی اختصاصی با استاندارد رمزنگاری Zero-Knowledge؛ سرور هرگز موجودی یا تراکنش‌های شما را نمی‌بیند"
            icon={Lock}
            badge="امنیت بانکی"
          >
            <div className="preview-vault-widget">
              <div className="vault-lock-animation">
                <div className="lock-shackle"></div>
                <div className="lock-body">
                  <ShieldCheck size={18} className="lock-core-icon" />
                </div>
              </div>
              <div className="vault-status-text">
                <span className="cipher-badge">AES-GCM 256</span>
                <span className="status-label">کلید محلی روی مرورگر شما</span>
              </div>
            </div>
          </BentoCard>

          {/* Card 4: Ledger & Weighted Average Cost */}
          <BentoCard
            className="bento-card-ledger"
            title="دفتر کل تراکنش‌ها و میانگین موزون"
            subtitle="ثبت دقیق معاملات خرید و فروش طلا و ارز با محاسبه سود/زیان محقق‌شده و میانگین قیمت ورود"
            icon={Receipt}
            badge="حسابداری دقیق"
          >
            <div className="preview-ledger-widget">
              <div className="ledger-entry profit">
                <div className="entry-left">
                  <strong>فروش سکه امامی (۲ عدد)</strong>
                  <span>نرخ خروج: ۵۴٬۲۰۰٬۰۰۰ تومان</span>
                </div>
                <div className="entry-profit-badge">+۶٬۸۰۰٬۰۰۰ تومان</div>
              </div>
              <div className="ledger-entry buy">
                <div className="entry-left">
                  <strong>خرید طلای ۱۸ عیار (۱۵ گرم)</strong>
                  <span>میانگین ورود: ۴٬۶۵۰٬۰۰۰ تومان</span>
                </div>
                <div className="entry-badge-neutral">میانگین موزون</div>
              </div>
            </div>
          </BentoCard>

          {/* Card 5: Smart Loans & Installments (Col span 2) */}
          <BentoCard
            className="bento-col-span-2 bento-card-loans"
            title="مدیریت هوشمند وام‌ها و اقساط ماهانه"
            subtitle="جدول استهلاک وام بانکی، یادآور سررسید اقساط، اثر تسویه زودتر از موعد و تفکیک بانک‌های ایران"
            icon={Landmark}
            badge="محاسبه‌گر پیشرفته"
          >
            <div className="preview-loans-widget">
              <div className="loan-item-row">
                <div className="loan-meta">
                  <strong>وام مسکن (بانک مسکن)</strong>
                  <span>مانده بدهی: ۳۲۰٬۰۰۰٬۰۰۰ تومان • قسط بعدی: ۵ روز دیگر</span>
                </div>
                <div className="loan-progress-container">
                  <div className="loan-bar-bg">
                    <div className="loan-bar-fill" style={{ width: '65%' }}></div>
                  </div>
                  <span className="loan-progress-pct">۶۵٪ تسویه‌شده (۳۹ از ۶۰ قسط)</span>
                </div>
              </div>

              <div className="loan-item-row">
                <div className="loan-meta">
                  <strong>وام قرض‌الحسنه رسالت</strong>
                  <span>مانده بدهی: ۴۵٬۰۰۰٬۰۰۰ تومان • اقساط سررسید: منظم</span>
                </div>
                <div className="loan-progress-container">
                  <div className="loan-bar-bg">
                    <div className="loan-bar-fill" style={{ width: '85%' }}></div>
                  </div>
                  <span className="loan-progress-pct">۸۵٪ تسویه‌شده (۱۷ از ۲۰ قسط)</span>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Card 6: Income Streams Tracker */}
          <BentoCard
            className="bento-card-incomes"
            title="پایش جریان درآمدها"
            subtitle="ثبت حقوق، سود سرمایه‌گذاری، اجاره‌بها و فریلنسری با گزارش‌های ماهانه و سالانه تفکیکی"
            icon={Wallet}
            badge="جریان نقدی"
          >
            <div className="preview-income-widget">
              <div className="income-bars-display">
                <div className="bar-col">
                  <div className="bar-fill" style={{ height: '45%' }}></div>
                  <span>تیر</span>
                </div>
                <div className="bar-col">
                  <div className="bar-fill" style={{ height: '60%' }}></div>
                  <span>مرداد</span>
                </div>
                <div className="bar-col">
                  <div className="bar-fill" style={{ height: '80%' }}></div>
                  <span>شهریور</span>
                </div>
                <div className="bar-col active">
                  <div className="bar-fill" style={{ height: '100%' }}></div>
                  <span>مهر</span>
                </div>
              </div>
              <div className="income-trend-label">
                <TrendingUp size={13} className="text-profit" />
                <span>+۲۴٪ رشد جریان نقدی نسبت به فصل گذشته</span>
              </div>
            </div>
          </BentoCard>
        </motion.div>
      </div>
    </section>
  );
}
