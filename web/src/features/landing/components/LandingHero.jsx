import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, TrendingUp, ShieldCheck, PieChart, Sparkles, ChevronDown, Lock } from 'lucide-react';
import { useAuth } from '../../auth/index.js';

export default function LandingHero() {
  const { triggerLogin } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const cardRef = useRef(null);

  // 3D Tilt State
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // Animated Counter for portfolio total
  const [displayValue, setDisplayValue] = useState(0);
  const targetValue = 485200000;

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(targetValue);
      return;
    }

    let start = 0;
    const duration = 1600;
    const startTime = performance.now();

    const animateValue = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(easeOut * targetValue));

      if (progress < 1) {
        requestAnimationFrame(animateValue);
      }
    };

    const animFrame = requestAnimationFrame(animateValue);
    return () => cancelAnimationFrame(animFrame);
  }, [shouldReduceMotion]);

  const handleMouseMove = (e) => {
    if (shouldReduceMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Small subtle degrees: max 8 deg
    const rotateX = ((y - centerY) / centerY) * -7;
    const rotateY = ((x - centerX) / centerX) * 7;

    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const scrollToRates = () => {
    const el = document.getElementById('features') || document.getElementById('bubble-calculator');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="landing-hero-section">
      {/* Aurora Ambient Mesh Background */}
      <div className="landing-aurora-glow" aria-hidden="true">
        <div className="aurora-blob aurora-gold"></div>
        <div className="aurora-blob aurora-blue"></div>
        <div className="aurora-blob aurora-cyan"></div>
        <div className="landing-grid-overlay"></div>
      </div>

      <div className="landing-hero-content">
        {/* Trust Pill / Badge */}
        <motion.div
          className="landing-badge-pill"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="badge-pulse-dot"></span>
          <span className="badge-text">نسل جدید پلتفرم مالی و تحلیل حباب</span>
          <span className="badge-tag">نسخه ۲.۰</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          className="landing-hero-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          قیمت واقعی طلا و ارز را ببینید،{' '}
          <span className="text-gradient-gold">نه فقط قیمت بازار</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="landing-hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          حباب سکه و طلا را لحظه‌ای تحلیل کنید؛ پورتفوی دارایی‌ها، وام‌ها، اقساط و درآمدهایتان را
          با امنیت کامل در یک گاوصندوق رمزنگاری‌شده مدیریت کنید.
        </motion.p>

        {/* Hero Actions (CTAs) */}
        <motion.div
          className="landing-hero-cta-group"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            type="button"
            className="landing-btn-primary"
            onClick={triggerLogin}
            id="landing-hero-start-btn"
          >
            <div className="btn-shimmer-sweep"></div>
            <svg className="google-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span className="btn-text">شروع رایگان با گوگل</span>
            <ArrowLeft size={18} className="btn-arrow-icon" />
          </button>

          <button
            type="button"
            className="landing-btn-secondary"
            onClick={scrollToRates}
          >
            <span>مشاهده نرخ‌های زنده و دمو</span>
            <ChevronDown size={18} />
          </button>
        </motion.div>

        {/* 3D Glass Dashboard Showcase */}
        <motion.div
          className="landing-dashboard-stage"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            ref={cardRef}
            className="landing-dashboard-card"
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${isHovered ? 'scale(1.015)' : 'scale(1)'}`,
            }}
          >
            {/* Top Mock Window Bar */}
            <div className="dashboard-topbar">
              <div className="dashboard-dots">
                <span className="dash-dot red"></span>
                <span className="dash-dot yellow"></span>
                <span className="dash-dot green"></span>
              </div>
              <div className="dashboard-pill-badge">
                <Lock size={12} className="vault-icon-tiny" />
                <span>پورتفوی شخصی (رمزنگاری Zero-Knowledge فعال)</span>
              </div>
              <div className="dashboard-live-indicator">
                <span className="live-pulse-dot"></span>
                <span>نرخ زنده بازار</span>
              </div>
            </div>

            {/* Dashboard Main Metrics Grid */}
            <div className="dashboard-body-grid">
              {/* Left Column: Total & Sparkline */}
              <div className="dash-metric-card primary-valuation">
                <div className="dash-card-header">
                  <span className="dash-card-label">ارزش کل دارایی‌ها (بر مبنای نرخ روز)</span>
                  <span className="dash-tag-profit">
                    <TrendingUp size={13} />
                    <span>+۳.۴٪ امروز</span>
                  </span>
                </div>
                <div className="dash-big-number">
                  <span className="amount">{displayValue.toLocaleString('fa-IR')}</span>
                  <span className="unit">تومان</span>
                </div>

                {/* Animated SVG Sparkline */}
                <div className="dash-sparkline-wrap">
                  <svg className="dash-sparkline-svg" viewBox="0 0 320 60" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,45 Q40,48 80,32 T160,28 T240,15 T320,8 L320,60 L0,60 Z"
                      fill="url(#sparklineGrad)"
                    />
                    <path
                      d="M0,45 Q40,48 80,32 T160,28 T240,15 T320,8"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="dash-sparkline-path"
                    />
                  </svg>
                </div>
              </div>

              {/* Right Column: Bubble Gauge & Real Value */}
              <div className="dash-metric-card bubble-analysis">
                <div className="dash-card-header">
                  <span className="dash-card-label">تحلیل حباب لحظه‌ای سکه تمام</span>
                  <span className="dash-bubble-badge">۱۴.۸٪ حباب</span>
                </div>

                <div className="dash-bubble-comparison">
                  <div className="comparison-row">
                    <span className="row-label">قیمت بازار (تابلو):</span>
                    <strong className="row-val market">۵۴٬۲۰۰٬۰۰۰ تومان</strong>
                  </div>
                  <div className="comparison-row">
                    <span className="row-label">ارزش واقعی (انس + طلا):</span>
                    <strong className="row-val real text-gradient-gold">۴۷٬۲۱۰٬۰۰۰ تومان</strong>
                  </div>
                  <div className="comparison-row bubble-gap-highlight">
                    <span className="row-label">میزان حباب نقدی:</span>
                    <strong className="row-val gap">+۶٬۹۹۰٬۰۰۰ تومان</strong>
                  </div>
                </div>

                {/* Gauge Visual Bar */}
                <div className="dash-gauge-track">
                  <div className="gauge-fill-real" style={{ width: '85%' }} title="ارزش ذاتی"></div>
                  <div className="gauge-fill-bubble" style={{ width: '15%' }} title="حباب بازار"></div>
                </div>
                <div className="gauge-labels">
                  <span>ارزش واقعی: ۸۵٪</span>
                  <span className="text-warning">حباب: ۱۵٪</span>
                </div>
              </div>
            </div>

            {/* Asset Allocation Chips Footer */}
            <div className="dashboard-chips-bar">
              <span className="chips-title">ترکیب سبد دارایی:</span>
              <div className="chips-container">
                <span className="dash-chip gold">
                  <span className="chip-dot"></span>
                  طلای ۱۸ عیار (۳۸٪)
                </span>
                <span className="dash-chip coin">
                  <span className="chip-dot"></span>
                  سکه امامی (۲۶٪)
                </span>
                <span className="dash-chip currency">
                  <span className="chip-dot"></span>
                  دلار و تتر (۲۱٪)
                </span>
                <span className="dash-chip stock">
                  <span className="chip-dot"></span>
                  صندوق طلا و سهام (۱۵٪)
                </span>
              </div>
            </div>

            {/* Ambient Corner Reflection Effect */}
            <div className="dashboard-glass-reflection"></div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
