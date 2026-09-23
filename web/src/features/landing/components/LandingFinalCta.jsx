import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/index.js';

export default function LandingFinalCta() {
  const { triggerLogin } = useAuth();

  return (
    <section className="landing-final-cta-section">
      <div className="landing-container">
        <motion.div
          className="final-cta-card"
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Ambient background glow inside card */}
          <div className="cta-ambient-glow" aria-hidden="true">
            <div className="cta-glow-gold"></div>
            <div className="cta-glow-blue"></div>
          </div>

          <div className="final-cta-inner">
            <div className="section-tag-badge gold-badge">
              <Sparkles size={14} />
              <span>شروع یک تحول در مدیریت مالی</span>
            </div>

            <h2 className="final-cta-headline">
              کنترل دارایی‌هایتان را با{' '}
              <span className="text-gradient-gold">ارزش واقعی</span> به دست بگیرید
            </h2>

            <p className="final-cta-subhead">
              همین امروز در چند ثانیه و کاملاً رایگان شروع کنید. تحلیل حباب طلا و مدیریت هوشمند سرمایه
              حق مسلم هر تصمیم‌گیرنده اقتصادی است.
            </p>

            <div className="final-cta-actions">
              <button
                type="button"
                className="landing-btn-primary final-btn-glow"
                onClick={triggerLogin}
                id="landing-final-google-btn"
              >
                <div className="btn-shimmer-sweep"></div>
                <svg className="google-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="btn-text">ورود با گوگل و شروع رایگان</span>
                <ArrowLeft size={18} className="btn-arrow-icon" />
              </button>
            </div>

            <div className="final-cta-features-strip">
              <span>
                <ShieldCheck size={14} className="icon-green" />
                ورود امن با گوگل
              </span>
              <span>
                <Zap size={14} className="icon-gold" />
                راه‌اندازی فوری زیر ۱ دقیقه
              </span>
              <span>
                <Sparkles size={14} className="icon-cyan" />
                ۱۰۰٪ رایگان و بدون اشتراک
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
