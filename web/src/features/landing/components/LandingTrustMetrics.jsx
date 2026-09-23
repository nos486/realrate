import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Coins, RefreshCw, Shield, Award } from 'lucide-react';

const STATS = [
  {
    icon: <Coins size={24} />,
    valueTarget: 120,
    prefix: '+',
    suffix: '',
    label: 'دارایی و سورس قابل تحلیل',
    description: 'طلا، سکه، ارز، سهام بورس و انواع صندوق‌های سرمایه‌گذاری',
  },
  {
    icon: <RefreshCw size={24} />,
    valueTarget: 60,
    prefix: 'هر ',
    suffix: ' ثانیه',
    label: 'فرکانس به‌روزرسانی نرخ‌ها',
    description: 'پایش مستمر و برخط نرخ‌های بازار، حباب و قیمت‌های جهانی',
  },
  {
    icon: <Shield size={24} />,
    valueTarget: 100,
    prefix: '',
    suffix: '٪',
    label: 'رمزنگاری Zero-Knowledge',
    description: 'کلید رمزنگاری فقط در دستگاه شما؛ سرور هرگز موجودی شما را نمی‌بیند',
  },
  {
    icon: <Award size={24} />,
    valueTarget: 0,
    prefix: '',
    suffix: ' ریال',
    label: 'رایگان برای تمام کاربران',
    description: 'دسترسی نامحدود به تمامی امکانات تحلیلی، پورتفو، وام و درآمدها',
  },
];

function StatCounter({ item, shouldReduceMotion }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion || item.valueTarget === 0) {
      setCount(item.valueTarget);
      return;
    }

    let start = 0;
    const duration = 1400;
    const startTime = performance.now();

    const update = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * item.valueTarget));

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [item.valueTarget, shouldReduceMotion]);

  return (
    <div className="landing-stat-card">
      <div className="stat-card-icon-wrap">
        {item.icon}
      </div>
      <div className="stat-card-number">
        <span className="stat-prefix">{item.prefix}</span>
        <span className="stat-val">{count.toLocaleString('fa-IR')}</span>
        <span className="stat-suffix">{item.suffix}</span>
      </div>
      <h3 className="stat-card-title">{item.label}</h3>
      <p className="stat-card-desc">{item.description}</p>
    </div>
  );
}

export default function LandingTrustMetrics() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="landing-trust-section">
      <div className="landing-container">
        <motion.div
          className="landing-stats-grid"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {STATS.map((stat, idx) => (
            <StatCounter
              key={idx}
              item={stat}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
