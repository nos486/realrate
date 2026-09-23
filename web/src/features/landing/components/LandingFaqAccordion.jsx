import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, HelpCircle } from 'lucide-react';

const FAQS = [
  {
    q: 'ریلریت دقیقاً چیست و چه تفاوتی با سایر اپ‌های بازار دارد؟',
    a: 'بسیاری از برنامه‌ها فقط قیمت لحظه‌ای تابلوی بازار را به شما نشان می‌دهند؛ اما ریلریت ارزش ذاتی و واقعی طلا و سکه را بر مبنای وزن و عیار استاندارد و قیمت انس جهانی محاسبه می‌کند تا بدانید چند درصد از قیمت پرداختی شما طلاست و چند درصد حباب هیجانی است. علاوه بر این، ریلریت یک سامانه جامع مدیریت پورتفو، دفتر کل تراکنش‌ها، یادآور اقساط وام و درآمدها با رمزنگاری پیشرفته است.',
  },
  {
    q: 'منظور از «حباب سکه» چیست و چرا باید قبل از خرید آن را بررسی کنم؟',
    a: 'حباب سکه اختلاف قیمت تابلوی بازار طلافروشان با ارزش طلای فیزیکی موجود در آن سکه است. در زمان‌های هیجان یا تقاضای بالا، حباب سکه به ۲۰ تا ۳۰ درصد می‌رسد؛ یعنی شما بابت سکه پولی بسیار فراتر از طلای واقعی می‌پردازید. در صورت افت بازار، این حباب به سرعت تبخیر می‌شود. با ریلریت می‌توانید سکه‌ها و طلاها را با کمترین حباب شناسایی و خریداری کنید.',
  },
  {
    q: 'امنیت داده‌های مالی و موجودی پورتفوی من چگونه تضمین می‌شود؟',
    a: 'ریلریت مجهز به سیستم «گاوصندوق رمزنگاری سرتاسری (Zero-Knowledge E2EE)» با استاندارد نظامی AES-256-GCM است. کلید رمزنگاری منحصراً در مرورگر دستگاه شما تولید و نگهداری می‌شود و داده‌ها پیش از ارسال به سرور رمز می‌شوند؛ بنابراین حتی مهندسان و سرورهای ریلریت هم دسترسی به موجودی، تراکنش‌ها یا وام‌های شما ندارند.',
  },
  {
    q: 'آیا استفاده از امکانات ریلریت رایگان است؟',
    a: 'بله! استفاده از تمامی امکانات شامل مشاهده نرخ‌های زنده و تحلیل حباب، ایجاد پورتفوهای نامحدود، گاوصندوق رمزنگاری، مدیریت وام‌ها و ثبت درآمدها برای همه کاربران کاملاً رایگان است.',
  },
  {
    q: 'چه دارایی‌ها و بازارهایی در پورتفوی ریلریت پشتیبانی می‌شوند؟',
    a: 'شما می‌توانید طلای ۱۸ و ۲۴ عیار، طلای آب‌شده، سکه تمام (امامی و بهار آزادی)، نیم سکه، ربع سکه، سکه گرمی، ارزهای اصلی (دلار، یورو، درهم و...)، رمزارزها (تتر، بیت‌کوین و...)، و تمامی نمادهای سهام و صندوق‌های طلای بورس اوراق بهادار تهران را در پورتفوی خود ثبت و رصد کنید.',
  },
  {
    q: 'آیا برای استفاده در گوشی نیاز به دانلود اپلیکیشن از بازار یا اپ‌استور است؟',
    a: 'خیر، ریلریت یک Progressive Web App (PWA) فوق‌سریع است. کافی است آدرس سایت را در مرورگر گوشی خود باز کنید و از گزینه Add to Home Screen (افزودن به صفحه اصلی) استفاده کنید تا مانند یک اپلیکیشن بومی و با حداکثر سرعت در اختیارتان قرار گیرد.',
  },
];

function FaqItem({ item, isOpen, onClick }) {
  return (
    <div className={`faq-accordion-item ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="faq-question-btn"
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <span className="faq-question-text">{item.q}</span>
        <span className={`faq-chevron-icon ${isOpen ? 'rotated' : ''}`}>
          <ChevronDown size={20} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="faq-answer-container"
          >
            <div className="faq-answer-inner">
              <p>{item.a}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingFaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggleItem = (idx) => {
    setOpenIndex(openIndex === idx ? -1 : idx);
  };

  return (
    <section className="landing-faq-section" id="faq">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="section-tag-badge">
            <HelpCircle size={14} />
            <span>پاسخ به ابهامات متداول</span>
          </div>
          <h2 className="section-title">
            سوالاتی که اغلب از ما می‌پرسند
          </h2>
          <p className="section-subtitle">
            تمام آنچه درباره نحوه کارکرد، امنیت و قابلیت‌های ریلریت نیاز دارید
          </p>
        </div>

        <motion.div
          className="faq-accordion-list"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {FAQS.map((faq, idx) => (
            <FaqItem
              key={idx}
              item={faq}
              isOpen={openIndex === idx}
              onClick={() => toggleItem(idx)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
