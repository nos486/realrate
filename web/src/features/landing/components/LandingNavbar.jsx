import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Menu, X, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../auth/index.js';

export default function LandingNavbar() {
  const { triggerLogin } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <header className={`landing-nav-wrapper ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="landing-nav-container">
        {/* Brand Logo */}
        <div className="landing-brand-group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="landing-brand-icon">
            <span className="landing-logo-gem">RR</span>
            <div className="landing-brand-glow"></div>
          </div>
          <div className="landing-brand-text">
            <span className="landing-brand-name">RealRate</span>
            <span className="landing-brand-tagline">ریلریت | ارزش واقعی دارایی</span>
          </div>
        </div>

        {/* Desktop Nav Links */}
        <nav className="landing-desktop-links" aria-label="ناوبری اصلی">
          <button type="button" onClick={() => scrollToSection('features')} className="landing-nav-link">
            امکانات
          </button>
          <button type="button" onClick={() => scrollToSection('bubble-calculator')} className="landing-nav-link">
            ماشین‌حساب حباب
          </button>
          <button type="button" onClick={() => scrollToSection('how-it-works')} className="landing-nav-link">
            نحوه کار
          </button>
          <button type="button" onClick={() => scrollToSection('security')} className="landing-nav-link">
            امنیت
          </button>
          <button type="button" onClick={() => scrollToSection('faq')} className="landing-nav-link">
            سوالات متداول
          </button>
        </nav>

        {/* Right CTA / Action */}
        <div className="landing-nav-actions">
          <button
            type="button"
            className="landing-btn-login-google"
            onClick={triggerLogin}
            id="landing-navbar-google-btn"
          >
            <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>ورود با گوگل</span>
          </button>

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            className="landing-mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'بستن منو' : 'باز کردن منو'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="landing-mobile-drawer" role="dialog" aria-modal="true">
          <div className="landing-mobile-drawer-content">
            <button type="button" onClick={() => scrollToSection('features')} className="landing-mobile-link">
              <span>امکانات</span>
              <ArrowLeft size={16} />
            </button>
            <button type="button" onClick={() => scrollToSection('bubble-calculator')} className="landing-mobile-link">
              <span>ماشین‌حساب حباب</span>
              <ArrowLeft size={16} />
            </button>
            <button type="button" onClick={() => scrollToSection('how-it-works')} className="landing-mobile-link">
              <span>نحوه کار</span>
              <ArrowLeft size={16} />
            </button>
            <button type="button" onClick={() => scrollToSection('security')} className="landing-mobile-link">
              <span>امنیت و رمزنگاری</span>
              <ArrowLeft size={16} />
            </button>
            <button type="button" onClick={() => scrollToSection('faq')} className="landing-mobile-link">
              <span>سوالات متداول</span>
              <ArrowLeft size={16} />
            </button>

            <div className="landing-mobile-drawer-footer">
              <button
                type="button"
                className="landing-btn-login-google full-width"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  triggerLogin();
                }}
              >
                <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>ورود و شروع با گوگل</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
