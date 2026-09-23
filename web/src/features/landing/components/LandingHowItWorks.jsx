import React from 'react';
import { motion } from 'framer-motion';
import { LogIn, PlusCircle, LineChart, Sparkles, CheckCircle } from 'lucide-react';

const STEPS = [
  {
    stepNum: '۱',
    title: 'ورود آسان و امن با گوگل',
    desc: 'تنها با یک کلیک و بدون نیاز به پر کردن فرم‌های طولانی یا سپردن رمز عبور، حساب اختصاصی شما آماده استفاده است.',
    icon: LogIn,
    badge: 'گام اول',
  },
  {
    stepNum: '۲',
    title: 'افزودن دارایی‌ها، وام‌ها و درآمدها',
    desc: 'طلای آب‌شده، سکه، ارز، سهام و وام‌های بانکی خود را به صورت دستی یا با ایمپورت سریع اکسل/CSV در چند لحظه وارد کنید.',
    icon: PlusCircle,
    badge: 'گام دوم',
  },
  {
    stepNum: '۳',
    title: 'دیدن ارزش واقعی و گزارش‌های تحلیلی',
    desc: 'ارزش پورتفو، حباب لحظه‌ای، سود/زیان محقق‌شده و موعد پرداخت اقساط را شفاف، بدون خطا و به زبان ساده رصد کنید.',
    icon: LineChart,
    badge: 'گام سوم',
  },
];

export default function LandingHowItWorks() {
  return (
    <section className="landing-how-section" id="how-it-works">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="section-tag-badge">
            <Sparkles size={14} />
            <span>ساده، سریع و بدون سردرگمی</span>
          </div>
          <h2 className="section-title">
            شروع استفاده از ریلریت در ۳ گام ساده
          </h2>
          <p className="section-subtitle">
            بدون نیاز به آموزش، بدون تنظیمات پیچیده؛ در کمتر از دو دقیقه مسلط شوید
          </p>
        </div>

        {/* Steps Grid with Connector Path */}
        <div className="landing-steps-wrapper">
          {/* Background Connecting SVG Line for Desktop */}
          <div className="steps-connector-line" aria-hidden="true">
            <svg viewBox="0 0 900 60" preserveAspectRatio="none" className="connector-svg">
              <path
                d="M 50,30 L 850,30"
                fill="none"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth="2"
                strokeDasharray="6 6"
              />
            </svg>
          </div>

          <div className="landing-steps-grid">
            {STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <motion.div
                  key={idx}
                  className="landing-step-card"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.6, delay: idx * 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="step-card-top">
                    <div className="step-number-circle">{step.stepNum}</div>
                    <span className="step-badge">{step.badge}</span>
                  </div>

                  <div className="step-icon-wrap">
                    <StepIcon size={26} />
                  </div>

                  <h3 className="step-card-title">{step.title}</h3>
                  <p className="step-card-desc">{step.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
