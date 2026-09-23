import React from 'react';
import { ArrowUp, Shield, Heart } from 'lucide-react';

export default function LandingFooter() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="landing-footer-wrap">
      <div className="landing-container">
        <div className="landing-footer-main">
          {/* Brand Info */}
          <div className="footer-brand-col">
            <div className="footer-brand-logo" onClick={scrollToTop}>
              <span className="logo-badge">RR</span>
              <strong className="brand-title">RealRate</strong>
            </div>
            <p className="footer-brand-desc">
              پلتفرم هوشمند تحلیل قیمت واقعی طلا، سکه و ارز در ایران، پایش حباب، مدیریت پورتفوی چندگانه دارایی‌ها،
              تراکنش‌ها، وام‌ها و درآمدها با رمزنگاری سرتاسری.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-links-col">
            <h4 className="footer-col-title">دسترسی سریع</h4>
            <ul className="footer-links-list">
              <li>
                <button type="button" onClick={() => scrollToSection('features')} className="footer-link-btn">
                  امکانات پلتفرم
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection('bubble-calculator')} className="footer-link-btn">
                  ماشین‌حساب حباب سکه
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection('how-it-works')} className="footer-link-btn">
                  نحوه کارکرد
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection('security')} className="footer-link-btn">
                  امنیت و Zero-Knowledge
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection('faq')} className="footer-link-btn">
                  سوالات متداول
                </button>
              </li>
            </ul>
          </div>

          {/* Security & System Info */}
          <div className="footer-security-col">
            <h4 className="footer-col-title">امنیت و حریم خصوصی</h4>
            <div className="footer-security-badge">
              <Shield size={16} className="sec-icon" />
              <div>
                <strong>Zero-Knowledge E2EE</strong>
                <p>داده‌های دارایی با استاندارد AES-256 رمزنگاری می‌شوند و فقط روی مرورگر شما در دسترس هستند.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer & Bottom Copyright */}
        <div className="landing-footer-bottom">
          <div className="footer-disclaimer">
            <strong>سلب مسئولیت: </strong>
            اطلاعات، محاسبات و قیمت‌های ارائه شده در این سامانه صرفاً جنبه تحلیلی، مقایسه‌ای و آموزشی دارد و به هیچ عنوان به منزله سیگنال خرید، فروش یا توصیه سرمایه‌گذاری تلقی نمی‌شود. مسئولیت تمامی تصمیمات مالی بر عهده کاربر است.
          </div>

          <div className="footer-bottom-row">
            <p className="footer-copyright">
              © {new Date().getFullYear()} RealRate. تمامی حقوق برای پروژه ریلریت محفوظ است.
            </p>

            <button
              type="button"
              className="footer-scroll-top-btn"
              onClick={scrollToTop}
              title="بازگشت به ابتدای صفحه"
              aria-label="بازگشت به بالا"
            >
              <span>بازگشت به بالا</span>
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
