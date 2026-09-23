/**
 * LandingPage.jsx — Modern, Minimalist, High-End Landing Page for RealRate
 *
 * Inspired by Linear, Vercel, and Raycast aesthetics:
 * - Pure Persian RTL layout with Vazirmatn typography
 * - High-end dark theme (#07090e) with subtle glassmorphism and animated ambient aurora
 * - CRITICAL: Absolutely NO real prices — only abstract charts, percentages, ratios & mock sparklines
 * - Interactive 3D tilt Hero mockup reacting to mouse movement
 * - Bento Grid with mouse spotlight glow
 * - Dynamic mock counters with soft pulse animations
 * - Interactive terminal card with one-click copy
 * - Zero-Knowledge privacy preview toggle
 * - Clean semantic HTML, accessible, lightweight, and supports prefers-reduced-motion
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Landmark,
  PieChart,
  Lock,
  Scale,
  CalendarCheck,
  Sparkles,
  Check,
  Copy,
  ExternalLink,
  ChevronLeft,
  Star,
  ArrowLeft,
  Code2,
} from 'lucide-react';
import { useAuth } from '../features/auth/index.js';
import { toPersianDigits } from '../shared/utils/formatters.js';

// Clean standard GitHub SVG icon
function GithubIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

// Google 'G' official logo SVG
function GoogleLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function LandingPage() {
  const { triggerLogin } = useAuth();

  // Mouse tilt for Hero Mockup
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const heroCardRef = useRef(null);

  const handleHeroMouseMove = useCallback((e) => {
    if (!heroCardRef.current) return;
    const rect = heroCardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Normalized subtle tilt angle (max ±6 degrees)
    const rotateY = (x / (rect.width / 2)) * 5;
    const rotateX = -(y / (rect.height / 2)) * 5;
    setTilt({ x: rotateX, y: rotateY });
  }, []);

  const handleHeroMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  // Dynamic subtle mock ticker simulation (percentages only, no real prices)
  const [mockBubble, setMockBubble] = useState(8.4);
  const [mockYield, setMockYield] = useState(24.2);
  const [tickActive, setTickActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickActive(true);
      setMockBubble((prev) => {
        const delta = (Math.random() * 0.4 - 0.2);
        return parseFloat(Math.max(6.5, Math.min(10.5, prev + delta)).toFixed(1));
      });
      setMockYield((prev) => {
        const delta = (Math.random() * 0.6 - 0.25);
        return parseFloat(Math.max(21.0, Math.min(27.0, prev + delta)).toFixed(1));
      });
      setTimeout(() => setTickActive(false), 900);
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  // Spotlight mouse effect on Bento cards
  const handleBentoMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--spotlight-x', `${x}px`);
    card.style.setProperty('--spotlight-y', `${y}px`);
  };

  // Copy command for Terminal card
  const [copied, setCopied] = useState(false);
  const cloneCmd = 'git clone https://github.com/nos486/realrate.git';

  const handleCopyCmd = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cloneCmd).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      });
    }
  };

  // Smooth scroll handler
  const scrollToSection = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-root" dir="rtl" lang="fa">
      {/* ── Background Mesh Aurora & Dot Grid ───────────────────────────── */}
      <div className="landing-ambient-canvas" aria-hidden="true">
        <div className="landing-aurora-blob aurora-blue" />
        <div className="landing-aurora-blob aurora-gold" />
        <div className="landing-aurora-blob aurora-cyan" />
        <div className="landing-dot-grid" />
      </div>

      {/* ── Sticky Minimal Glass Header ─────────────────────────────────── */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <a href="/" className="landing-brand" aria-label="صفحه اصلی RealRate">
            <span className="landing-brand-icon">
              <TrendingUp size={20} />
            </span>
            <span className="landing-brand-name">RealRate</span>
            <span className="landing-brand-tag">متن‌باز</span>
          </a>

          <nav className="landing-nav" aria-label="منوی اصلی لندینگ">
            <a href="#features" onClick={(e) => scrollToSection(e, 'features')}>
              ویژگی‌ها
            </a>
            <a href="#open-source" onClick={(e) => scrollToSection(e, 'open-source')}>
              کد منبع
            </a>
          </nav>

          <div className="landing-header-actions">
            <a
              href="https://github.com/nos486/realrate"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-github"
              aria-label="مشاهده مخزن RealRate در گیت‌هاب"
            >
              <GithubIcon size={18} />
              <span className="hide-mobile">گیت‌هاب</span>
            </a>

            <button
              type="button"
              className="landing-btn-primary"
              onClick={triggerLogin}
              aria-label="ورود به برنامه RealRate"
            >
              <span>ورود به برنامه</span>
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Landing Body ───────────────────────────────────────────── */}
      <main className="landing-main-content">
        {/* ── 1. HERO SECTION ─────────────────────────────────────────── */}
        <section className="landing-hero-section">
          <div className="landing-hero-grid">
            {/* Hero Left / Text Info */}
            <div className="landing-hero-copy">
              <div className="landing-badge">
                <span className="landing-badge-star">⭐</span>
                <span>کاملاً رایگان و ۱۰۰٪ متن‌باز</span>
                <span className="landing-badge-dot" />
                <span className="landing-badge-sub">بدون ردیاب تجاری</span>
              </div>

              <h1 className="landing-title">
                ارزش واقعی <span className="text-gradient-gold">دارایی‌هایت</span> را بشناس
              </h1>

              <p className="landing-lead">
                تحلیل حباب طلا و سکه، مدیریت پورتفو، وام‌ها و درآمدها — همه در یک جا،
                امن و رایگان بر پایه‌ی فرمول‌های واقعی بازار و انس جهانی.
              </p>

              <div className="landing-cta-group">
                <button
                  type="button"
                  className="landing-cta-main"
                  onClick={triggerLogin}
                >
                  <span className="cta-shimmer" />
                  <GoogleLogo size={20} />
                  <span>شروع رایگان با گوگل</span>
                  <ArrowLeft size={18} className="cta-arrow" />
                </button>

                <a
                  href="https://github.com/nos486/realrate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-cta-ghost"
                >
                  <GithubIcon size={19} />
                  <span>کد منبع در GitHub</span>
                  <ExternalLink size={14} className="ghost-ext-icon" />
                </a>
              </div>
            </div>

            {/* Hero Right / 3D Floating Interactive Dashboard Mockup */}
            <div
              className="landing-hero-visual-wrapper"
              onMouseMove={handleHeroMouseMove}
              onMouseLeave={handleHeroMouseLeave}
            >
              <div
                className="landing-mockup-card"
                ref={heroCardRef}
                style={{
                  transform: `perspective(1100px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                }}
              >
                {/* Mockup Header bar */}
                <div className="mockup-topbar">
                  <div className="mockup-dots">
                    <span className="dot dot-red" />
                    <span className="dot dot-yellow" />
                    <span className="dot dot-green" />
                  </div>
                  <div className="mockup-title-status">
                    <span className="status-ping" />
                    <span>داشبورد ارزش‌سنجی زنده RealRate</span>
                  </div>
                  <div className="mockup-pill-badge">
                    <Lock size={12} />
                    <span>E2EE فعال</span>
                  </div>
                </div>

                {/* Mockup Quick Metrics Strip (Percentages only, no static prices) */}
                <div className="mockup-metrics-grid">
                  <div className={`mockup-metric-box ${tickActive ? 'is-ticking' : ''}`}>
                    <div className="metric-box-header">
                      <span className="metric-label">شاخص حباب کل</span>
                      <span className="metric-badge-ok">مطلوب</span>
                    </div>
                    <div className="metric-value-row">
                      <span className="metric-val text-amber">
                        +{toPersianDigits(mockBubble)}٪
                      </span>
                      <Scale size={16} className="metric-icon" />
                    </div>
                    <div className="metric-progress-track">
                      <div
                        className="metric-progress-fill fill-amber"
                        style={{ width: `${Math.min(100, mockBubble * 8)}%` }}
                      />
                    </div>
                  </div>

                  <div className={`mockup-metric-box ${tickActive ? 'is-ticking' : ''}`}>
                    <div className="metric-box-header">
                      <span className="metric-label">بازدهی تجمیعی پورتفو</span>
                      <span className="metric-badge-green">صعودی</span>
                    </div>
                    <div className="metric-value-row">
                      <span className="metric-val text-emerald">
                        +{toPersianDigits(mockYield)}٪
                      </span>
                      <TrendingUp size={16} className="metric-icon text-emerald" />
                    </div>
                    <div className="metric-progress-track">
                      <div
                        className="metric-progress-fill fill-emerald"
                        style={{ width: `${Math.min(100, mockYield * 3)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mockup-metric-box">
                    <div className="metric-box-header">
                      <span className="metric-label">استهلاک اقساط ماه</span>
                      <span className="metric-badge-blue">۲ از ۳ قسط</span>
                    </div>
                    <div className="metric-value-row">
                      <span className="metric-val text-cyan">
                        {toPersianDigits('۶۷')}٪
                      </span>
                      <CalendarCheck size={16} className="metric-icon text-cyan" />
                    </div>
                    <div className="metric-progress-track">
                      <div className="metric-progress-fill fill-cyan" style={{ width: '67%' }} />
                    </div>
                  </div>
                </div>

                {/* Mockup Abstract Dynamic Curve Chart */}
                <div className="mockup-chart-container">
                  <div className="chart-legend-row">
                    <div className="chart-legend-item">
                      <span className="legend-indicator gold" />
                      <span>ارزش واقعی طلا بر مبنای انس</span>
                    </div>
                    <div className="chart-legend-item">
                      <span className="legend-indicator blue" />
                      <span>روند میانگین سبد سرمایه‌گذاری</span>
                    </div>
                    <div className="chart-range-pill">۶ ماه اخیر</div>
                  </div>

                  <svg
                    className="mockup-svg-chart"
                    viewBox="0 0 540 160"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="areaGradientBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.36" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="lineStrokeGold" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#0284c7" />
                      </linearGradient>
                    </defs>

                    {/* Subtle grid lines */}
                    <line x1="0" y1="40" x2="540" y2="40" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <line x1="0" y1="80" x2="540" y2="80" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <line x1="0" y1="120" x2="540" y2="120" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

                    {/* Shaded Area */}
                    <path
                      d="M 0 130 C 70 120, 120 100, 180 105 C 240 110, 290 65, 360 60 C 430 55, 480 30, 540 22 L 540 160 L 0 160 Z"
                      fill="url(#areaGradientBlue)"
                    />

                    {/* Main Trend Line */}
                    <path
                      d="M 0 130 C 70 120, 120 100, 180 105 C 240 110, 290 65, 360 60 C 430 55, 480 30, 540 22"
                      fill="none"
                      stroke="url(#lineStrokeGold)"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />

                    {/* Secondary benchmark curve */}
                    <path
                      d="M 0 145 C 90 140, 160 125, 240 120 C 320 115, 400 90, 540 75"
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth="1.8"
                      strokeDasharray="4 4"
                    />

                    {/* Live pulsating point at tip */}
                    <circle cx="538" cy="22" r="5" fill="#38bdf8" />
                    <circle cx="538" cy="22" r="10" fill="#38bdf8" opacity="0.4" className="chart-pulse-ring" />
                  </svg>
                </div>

                {/* Mockup Asset Allocation mini rows */}
                <div className="mockup-allocation-bar">
                  <div className="alloc-label-group">
                    <span className="alloc-title">توزیع دارایی‌های پورتفو:</span>
                    <span className="alloc-tag tag-gold">طلا و سکه ۳۸٪</span>
                    <span className="alloc-tag tag-blue">ارزهای اصلی ۳۲٪</span>
                    <span className="alloc-tag tag-purple">صندوق و سهام ۱۸٪</span>
                    <span className="alloc-tag tag-green">نقد ۱۲٪</span>
                  </div>
                  <div className="alloc-multi-track">
                    <div className="track-segment bg-gold" style={{ width: '38%' }} />
                    <div className="track-segment bg-blue" style={{ width: '32%' }} />
                    <div className="track-segment bg-purple" style={{ width: '18%' }} />
                    <div className="track-segment bg-green" style={{ width: '12%' }} />
                  </div>
                </div>

                {/* Floating pill overlays */}
                <div className="mockup-floating-badge badge-top-right">
                  <Sparkles size={14} className="text-amber" />
                  <span>محاسبه حباب بدون تاخیر</span>
                </div>
                <div className="mockup-floating-badge badge-bottom-left">
                  <ShieldCheck size={14} className="text-emerald" />
                  <span>کلید خصوصی فقط در دستگاه شما</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. CORE FEATURES (Single Row) ─────────────────────────── */}
        <section id="features" className="landing-features-compact-section">
          <div className="landing-section-header compact">
            <span className="section-pill">ویژگی‌های کلیدی</span>
            <h2 className="section-title">ابزار یکپارچه مدیریت مالی شخصی</h2>
          </div>

          <div className="features-single-row">
            {/* Feature 1 */}
            <div className="feature-compact-card" onMouseMove={handleBentoMouseMove}>
              <div className="bento-spotlight" />
              <div className="feature-compact-icon icon-gold">
                <Scale size={22} />
              </div>
              <h3 className="feature-compact-title">تحلیل حباب طلا و سکه</h3>
              <p className="feature-compact-desc">
                سنجش دقیق حباب و ارزش ذاتی بر پایه انس جهانی و فرمول‌های رسمی بازار بدون قیمت‌گذاری فرضی.
              </p>
              <div className="feature-compact-tag text-amber">
                <span>سنجش لحظه‌ای حباب</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="feature-compact-card" onMouseMove={handleBentoMouseMove}>
              <div className="bento-spotlight" />
              <div className="feature-compact-icon icon-blue">
                <PieChart size={22} />
              </div>
              <h3 className="feature-compact-title">مدیریت پورتفوی چنددارایی</h3>
              <p className="feature-compact-desc">
                پایش متمرکز طلا، ارز، صندوق‌های بورس و نقدینگی همراه با محاسبه خودکار سود و زیان محقق‌شده.
              </p>
              <div className="feature-compact-tag text-cyan">
                <span>تنوع‌بخشی و بازدهی</span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="feature-compact-card" onMouseMove={handleBentoMouseMove}>
              <div className="bento-spotlight" />
              <div className="feature-compact-icon icon-emerald">
                <Lock size={22} />
              </div>
              <h3 className="feature-compact-title">امنیت Zero-Knowledge</h3>
              <p className="feature-compact-desc">
                رمزنگاری داده‌ها با کلید شخصی در مرورگر؛ حتی سرورهای RealRate به ارقام دارایی شما دسترسی ندارند.
              </p>
              <div className="feature-compact-tag text-emerald">
                <span>رمزنگاری سرتاسری</span>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="feature-compact-card" onMouseMove={handleBentoMouseMove}>
              <div className="bento-spotlight" />
              <div className="feature-compact-icon icon-cyan">
                <Landmark size={22} />
              </div>
              <h3 className="feature-compact-title">وام‌ها، اقساط و درآمدها</h3>
              <p className="feature-compact-desc">
                محاسبه استهلاک اقساط، یادآوری سررسید و ثبت منظم درآمدهای ماهانه با خروجی‌های استاندارد.
              </p>
              <div className="feature-compact-tag text-cyan">
                <span>انضباط مالی جامع</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. OPEN SOURCE SHOWCASE ─────────────────────────────────── */}
        <section id="open-source" className="landing-opensource-section">
          <div className="opensource-container">
            <div className="opensource-header">
              <div className="os-badge">
                <Code2 size={16} />
                <span>۱۰۰٪ Open Source</span>
              </div>
              <h2 className="os-title">متن‌باز، شفاف، برای همه</h2>
              <p className="os-subtitle">
                کد RealRate کاملاً آزاد است. معماری را بررسی کن، ستاره بده، ویژگی‌های جدید پیشنهاد کن
                یا نسخه مستقل خودت را راه‌اندازی کن.
              </p>
            </div>

            {/* Interactive Terminal Card */}
            <div className="terminal-card">
              <div className="terminal-topbar">
                <div className="terminal-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <span className="terminal-title">bash — clone & run</span>
                <button
                  type="button"
                  className="terminal-copy-btn"
                  onClick={handleCopyCmd}
                  aria-label="کپی دستور در کلیپ‌بورد"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-emerald" />
                      <span className="text-emerald">کپی شد!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>کپی دستور</span>
                    </>
                  )}
                </button>
              </div>

              <div className="terminal-body" dir="ltr">
                <div className="term-line">
                  <span className="term-prompt">$</span>
                  <span className="term-cmd">git clone https://github.com/nos486/realrate.git</span>
                </div>
                <div className="term-line">
                  <span className="term-prompt">$</span>
                  <span className="term-cmd">cd realrate && npm install</span>
                </div>
                <div className="term-line">
                  <span className="term-prompt">$</span>
                  <span className="term-cmd">npm run dev</span>
                </div>
                <div className="term-line text-comment">
                  <span className="term-comment"># Ready at http://localhost:5173</span>
                </div>
              </div>
            </div>

            {/* Action Buttons for GitHub */}
            <div className="opensource-actions">
              <a
                href="https://github.com/nos486/realrate"
                target="_blank"
                rel="noopener noreferrer"
                className="os-btn-star"
              >
                <Star size={18} className="star-icon" />
                <span>ثبت ستاره در GitHub</span>
              </a>

              <a
                href="https://github.com/nos486/realrate/pulls"
                target="_blank"
                rel="noopener noreferrer"
                className="os-btn-contribute"
              >
                <GithubIcon size={18} />
                <span>مشارکت در توسعه پروژه</span>
              </a>
            </div>

            {/* Technology Stack Badges */}
            <div className="tech-stack-row">
              <span className="tech-badge">React 19</span>
              <span className="tech-badge">Vite</span>
              <span className="tech-badge">Cloudflare Workers</span>
              <span className="tech-badge">SQLite D1</span>
              <span className="tech-badge">Web Crypto (E2EE)</span>
            </div>
          </div>
        </section>
      </main>

      {/* ── 4. MINIMAL CLEAN FOOTER ─────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-brand-side">
            <div className="footer-logo-row">
              <span className="landing-brand-icon">
                <TrendingUp size={18} />
              </span>
              <span className="footer-brand-title">RealRate</span>
            </div>
            <p className="footer-motto">
              ابزار آزاد، مستقل و رمزنگاری‌شده برای تحلیل ارزش ذاتی و مدیریت امور مالی شخصی.
            </p>
          </div>

          <div className="footer-links-side">
            <div className="footer-col">
              <span className="footer-col-title">دسترسی سریع</span>
              <a href="#features" onClick={(e) => scrollToSection(e, 'features')}>
                قابلیت‌ها
              </a>
              <a href="#open-source" onClick={(e) => scrollToSection(e, 'open-source')}>
                کد منبع
              </a>
            </div>

            <div className="footer-col">
              <span className="footer-col-title">ارتباط و توسعه</span>
              <a
                href="https://github.com/nos486/realrate"
                target="_blank"
                rel="noopener noreferrer"
              >
                مخزن گیت‌هاب
              </a>
              <a
                href="https://github.com/nos486/realrate/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                گزارش باگ و ایده
              </a>
              <a
                href="https://github.com/nos486/realrate/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
              >
                مجوز MIT
              </a>
            </div>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <p className="footer-copy">
            ساخته‌شده با <span className="text-rose">❤️</span> به‌صورت متن‌باز برای جامعه مالی ایران.
          </p>
          <span className="footer-license">© {toPersianDigits('2026')} RealRate. آزاد تحت مجوز MIT.</span>
        </div>
      </footer>
    </div>
  );
}
