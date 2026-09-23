import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Lock, Key, ServerOff, EyeOff, CheckCircle2 } from 'lucide-react';

const SECURITY_POINTS = [
  {
    icon: Key,
    title: 'تولید کلید رمز در مرورگر شما',
    desc: 'کلید رمزنگاری با استفاده از استاندارد WebCrypto اختصاصاً روی دستگاه شما ساخته و نگهداری می‌شود.',
  },
  {
    icon: ServerOff,
    title: 'سرور ما فقط متن رمزنگاری‌شده می‌بیند',
    desc: 'داده‌ها قبل از خروج از مرورگر رمز می‌شوند؛ هیچ مهندس، دیتابیس یا سروری در ریلریت متن دارایی شما را نمی‌خواند.',
  },
  {
    icon: EyeOff,
    title: 'معماری دانایی صفر (Zero-Knowledge)',
    desc: 'حتی در صورت نقض احتمالی سرور، داده‌های ذخیره‌شده بدون کلید محلی شما چیزی جز نویزهای غیرقابل رمزگشایی نیستند.',
  },
  {
    icon: ShieldCheck,
    title: 'الگوریتم نظامی AES-256-GCM',
    desc: 'همان استاندارد رمزنگاری مورد تایید موسسات مالی بین‌المللی و دولت‌ها برای حفاظت از محرمانه‌ترین داده‌ها.',
  },
];

export default function LandingSecurityVault() {
  return (
    <section className="landing-security-section" id="security">
      <div className="landing-container">
        <div className="security-glass-box">
          <div className="security-content-grid">
            {/* Left: Security Narrative */}
            <motion.div
              className="security-narrative-col"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="section-tag-badge security-badge">
                <ShieldCheck size={14} />
                <span>حریم خصوصی بی‌قید و شرط</span>
              </div>

              <h2 className="security-title">
                رمز و دارایی شما فقط روی دستگاه شما می‌ماند؛{' '}
                <span className="text-gradient-sky">حتی ما هم نمی‌توانیم داده‌هایتان را ببینیم</span>
              </h2>

              <p className="security-desc">
                ما معتقدیم موجودی طلا، ارز و ثروت شما خصوصی‌ترین اطلاعات زندگی شماست. به همین دلیل
                قابلیت <strong>گاوصندوق رمزنگاری سرتاسری (E2EE Vault)</strong> را پیاده‌سازی کردیم تا خیالتان
                برای همیشه از امنیت و محرمانگی آسوده باشد.
              </p>

              {/* 4 Security Badges */}
              <div className="security-points-list">
                {SECURITY_POINTS.map((pt, idx) => {
                  const PtIcon = pt.icon;
                  return (
                    <div className="security-point-item" key={idx}>
                      <div className="point-icon-box">
                        <PtIcon size={18} />
                      </div>
                      <div className="point-text">
                        <h4>{pt.title}</h4>
                        <p>{pt.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Right: Interactive Vault CSS/SVG Illustration */}
            <motion.div
              className="security-visual-col"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="vault-visual-wrapper">
                {/* Vault Door Outer Ring */}
                <div className="vault-door-outer">
                  <div className="vault-door-bolts">
                    <span className="bolt b-1"></span>
                    <span className="bolt b-2"></span>
                    <span className="bolt b-3"></span>
                    <span className="bolt b-4"></span>
                    <span className="bolt b-5"></span>
                    <span className="bolt b-6"></span>
                    <span className="bolt b-7"></span>
                    <span className="bolt b-8"></span>
                  </div>

                  {/* Vault Wheel Handle */}
                  <div className="vault-door-center">
                    <div className="vault-spokes"></div>
                    <div className="vault-core-shield">
                      <Lock size={36} className="vault-center-lock-icon" />
                    </div>
                  </div>

                  {/* Orbiting Security Pills */}
                  <div className="orbit-pill pill-top">
                    <span className="dot green"></span>
                    <span>E2EE Active</span>
                  </div>
                  <div className="orbit-pill pill-bottom">
                    <span className="dot cyan"></span>
                    <span>AES-256</span>
                  </div>
                </div>

                <div className="vault-glow-ambient"></div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
