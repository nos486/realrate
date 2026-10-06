/**
 * LandingPage.jsx — The logged-out landing page: what RealRate is, in a few calm sections
 *
 *   header (brand · links · ورود)
 *   1. hero — one sentence, one paragraph, two buttons, three promises
 *   2. «همه در یک جا» — the six things the app does, one line each
 *   3. «تحلیل امروز بازار» — the AI's latest analysis, live (LandingAnalysis: read only when near)
 *   4. «چرا RealRate» — private (E2EE), the Android app, open source
 *   5. questions (the first five of the FAQ page), then a closing call to start
 *   footer
 *
 * No prices are shown: nothing here is stale when cached or crawled. Styles: styles/landing.css.
 */
import React, { useCallback, useState } from 'react';
import {
  TrendingUp,
  ArrowLeft,
  ChevronLeft,
  Sparkles,
  Scale,
  PieChart,
  Wallet,
  Landmark,
  ChartColumn,
  Newspaper,
  Lock,
  Smartphone,
  Code2,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppSuggestBanner from '../shared/app/AppSuggestBanner.jsx';
import { useAuth } from '../features/auth/index.js';
import { useDemo } from '../features/demo/index.js';
import { APP_BASE, DEMO_ENABLED } from '../shared/routes.js';
import { toPersianDigits } from '../shared/utils/formatters.js';
import { STATIC_PAGES } from '../seo/pages.js';
import LandingAnalysis from '../features/news/LandingAnalysis.jsx';

const LANDING_FAQS = STATIC_PAGES.faq.faqs.slice(0, 5);
const GITHUB_URL = 'https://github.com/nos486/realrate';

/** What the app does: one line each, each to its own page */
const FEATURES = [
  { Icon: Scale, tone: 'gold', title: 'بازار و حباب', text: 'ارزش ذاتی و حباب طلا و سکه، ارزها، تتر و بورس — به‌روز و خودکار.', href: '/features/gold-coin-bubble' },
  { Icon: PieChart, tone: 'blue', title: 'پورتفو', text: 'همه‌ی دارایی‌ها در یک جا، با سود و زیان زنده و میانگین خرید.', href: '/features/portfolio' },
  { Icon: Wallet, tone: 'green', title: 'هزینه و بودجه', text: 'هزینه‌های روزمره با دسته و بودجه‌ی ماهانه، حساب‌ها و پروژه‌ها.', href: '/features' },
  { Icon: Landmark, tone: 'cyan', title: 'درآمد، وام و چک', text: 'اقساط و سررسیدها، درآمدهای ثابت و چک‌ها با یادآوری.', href: '/features/loans' },
  { Icon: ChartColumn, tone: 'violet', title: 'گزارش سالانه', text: 'درآمد و هزینه، پس‌انداز و سرمایه‌گذاری سال در یک صفحه؛ خروجی PDF.', href: '/features' },
  { Icon: Newspaper, tone: 'rose', title: 'اخبار و تحلیل هوش مصنوعی', text: 'فقط خبرهایی که روی بازار اثر دارند، و تحلیل هر روز.', href: '/news' },
];

/** Why trust it with your money */
const PILLARS = [
  { Icon: Lock, title: 'فقط برای خودت', text: 'داده‌های مالی روی دستگاه خودت رمز می‌شوند؛ سرور فقط متن رمزشده را می‌بیند.', link: { href: '/features/encryption', label: 'رمزنگاری سرتاسری' } },
  { Icon: Smartphone, title: 'اپ اندروید', text: 'پیامک بانک را خودش می‌خواند و هزینه را ثبت می‌کند — متن پیامک از گوشی بیرون نمی‌رود.', link: { href: '/android', label: 'دانلود اپ' } },
  { Icon: Code2, title: 'رایگان و متن‌باز', text: 'بدون تبلیغ و ردیاب تجاری؛ کد کامل در گیت‌هاب است و هر کس می‌تواند بررسی‌اش کند.', link: { href: GITHUB_URL, label: 'کد در GitHub', external: true } },
];

const PROMISES = ['رایگان', 'رمزنگاری سرتاسری', 'وب و اندروید'];

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

/** A section's small label, title and one line under it */
function SectionHead({ eyebrow, title, text }) {
  return (
    <div className="lp-section-head">
      {eyebrow && <span className="lp-eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

export default function LandingPage() {
  const { user, triggerLogin } = useAuth();
  const { enterDemo } = useDemo();
  const [enteringDemo, setEnteringDemo] = useState(false);
  const navigate = useNavigate();

  // Signed-in visitors go straight into the app; guests start the Google login
  const enterApp = useCallback(() => {
    if (user) navigate(APP_BASE, { replace: true });
    else triggerLogin();
  }, [user, navigate, triggerLogin]);

  const handleDemoClick = useCallback(async () => {
    setEnteringDemo(true);
    try {
      await enterDemo();
    } catch (err) {
      console.warn('Demo login failed:', err?.message || err);
    } finally {
      setEnteringDemo(false);
    }
  }, [enterDemo]);

  const startButtons = (
    <div className="lp-actions">
      <button type="button" className="lp-btn lp-btn-primary" onClick={enterApp}>
        <GoogleLogo size={18} />
        <span>{user ? 'ورود به برنامه' : 'شروع رایگان با گوگل'}</span>
        <ArrowLeft size={17} />
      </button>
      {DEMO_ENABLED && !user && (
        <button type="button" className="lp-btn lp-btn-ghost" onClick={handleDemoClick} disabled={enteringDemo}>
          <Sparkles size={17} />
          <span>{enteringDemo ? 'در حال ورود…' : 'دیدن نسخه‌ی دمو'}</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="landing-root" dir="rtl" lang="fa">
      <AppSuggestBanner />

      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <a href="/" className="lp-brand" aria-label="RealRate — صفحه‌ی اصلی">
            <span className="lp-brand-icon"><TrendingUp size={18} /></span>
            <span>RealRate</span>
          </a>
          <nav className="lp-nav" aria-label="منوی اصلی">
            <a href="/features">امکانات</a>
            <a href="/news">اخبار</a>
            <a href="/android">اپ اندروید</a>
            <a href="/faq">سؤالات</a>
          </nav>
          <button type="button" className="lp-btn lp-btn-small" onClick={enterApp}>
            <span>ورود</span>
            <ChevronLeft size={15} />
          </button>
        </div>
      </header>

      <main>
        {/* 1. Hero */}
        <section className="lp-hero">
          <div className="lp-container lp-hero-inner">
            <span className="lp-pill">
              <Sparkles size={14} aria-hidden="true" />
              تازه: اخبار بازار، تحلیل روز با هوش مصنوعی و گزارش سالانه
            </span>
            <h1>
              پول و دارایی‌هایت را
              <br />
              <span className="lp-accent">یک‌جا و واقعی</span> ببین
            </h1>
            <p className="lp-lead">
              ارزش واقعی طلا و ارز، پورتفو، هزینه‌ها، درآمد، وام و چک — با گزارش سالانه و خبرهای مهم بازار.
              رایگان، متن‌باز و رمزنگاری‌شده روی دستگاه خودت.
            </p>
            {startButtons}
            <ul className="lp-promises" aria-label="ویژگی‌های اصلی">
              {PROMISES.map((p) => (
                <li key={p}><Check size={15} aria-hidden="true" />{p}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2. What it does */}
        <section id="features" className="lp-section">
          <div className="lp-container">
            <SectionHead eyebrow="امکانات" title="همه‌ی کارهای مالی در یک جا" text="از قیمت لحظه‌ای بازار تا گزارش آخر سال." />
            <div className="lp-features">
              {FEATURES.map(({ Icon, tone, title, text, href }) => (
                <a key={title} href={href} className="lp-feature">
                  <span className={`lp-feature-icon is-${tone}`}><Icon size={20} aria-hidden="true" /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </a>
              ))}
            </div>
            <a href="/features" className="lp-more">
              <span>همه‌ی امکانات</span>
              <ArrowLeft size={15} />
            </a>
          </div>
        </section>

        {/* 3. The day's analysis, live */}
        <LandingAnalysis
          id="analysis"
          className="lp-section lp-section-tint"
          head={(
            <SectionHead
              eyebrow="هوش مصنوعی"
              title="تحلیل امروز بازار"
              text="هوش مصنوعی خبرهای مهم امروز را با هم می‌خواند: چه شد و چرا برای بازار مهم است — بدون پیش‌بینی قیمت."
            />
          )}
        />

        {/* 4. Why */}
        <section id="why" className="lp-section">
          <div className="lp-container">
            <SectionHead eyebrow="چرا RealRate" title="امن، همراه و آزاد" />
            <div className="lp-pillars">
              {PILLARS.map(({ Icon, title, text, link }) => (
                <div key={title} className="lp-pillar">
                  <span className="lp-pillar-icon"><Icon size={22} aria-hidden="true" /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <a href={link.href} className="lp-more" {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {link.external && <GithubIcon size={15} />}
                    <span>{link.label}</span>
                    <ArrowLeft size={15} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Questions */}
        <section id="faq" className="lp-section">
          <div className="lp-container lp-narrow">
            <SectionHead eyebrow="سؤالات" title="پرسش‌های پرتکرار" />
            <div className="lp-faq">
              {LANDING_FAQS.map((faq) => (
                <details key={faq.q} className="lp-faq-item">
                  <summary>{faq.q}</summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
            <a href="/faq" className="lp-more">
              <span>همه‌ی سؤالات</span>
              <ArrowLeft size={15} />
            </a>
          </div>
        </section>

        {/* Closing call */}
        <section className="lp-section">
          <div className="lp-container">
            <div className="lp-cta">
              <h2>همین حالا رایگان شروع کن</h2>
              <p>چند ثانیه با حساب گوگل — بدون کارت بانکی و بدون تبلیغ.</p>
              {startButtons}
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <a href="/" className="lp-brand">
              <span className="lp-brand-icon"><TrendingUp size={16} /></span>
              <span>RealRate</span>
            </a>
            <p>ابزار رایگان و متن‌باز برای دیدن ارزش واقعی دارایی‌ها و مدیریت مالی شخصی.</p>
          </div>
          <nav className="lp-footer-links" aria-label="پیوندها">
            <a href="/features">امکانات</a>
            <a href="/news">اخبار</a>
            <a href="/android">اپ اندروید</a>
            <a href="/about">درباره</a>
            <a href="/faq">سؤالات</a>
            {DEMO_ENABLED && <a href="/demo">دمو</a>}
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
        </div>
        <div className="lp-container lp-footer-bottom">
          © {toPersianDigits('2026')} RealRate · متن‌باز با مجوز MIT
        </div>
      </footer>
    </div>
  );
}
