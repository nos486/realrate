import React from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, ShieldCheck } from 'lucide-react';

export default function Footer() {
  const triggerPwaInstall = () => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      alert('جهت نصب اپلیکیشن روی آیفون:\n۱. دکمه اشتراک (Share) در پایین مرورگر Safari را بزنید.\n۲. گزینه "Add to Home Screen" را انتخاب کنید.');
    } else {
      alert('جهت نصب اپلیکیشن روی گوشی:\n۱. منوی ۳ نقطه مرورگر را بزنید.\n۲. گزینه "Add to Home Screen" یا "Install app" را انتخاب کنید.');
    }
  };

  return (
    <footer className="w-full mt-auto py-5 border-t border-white/5 light:border-slate-200 bg-app text-slate-400 light:text-slate-500 text-xs select-none">
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-8 lg:px-12 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0">ارزش‌گذاری بر مبنای نرخ روز طلا، سکه و ارز</p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={triggerPwaInstall}
            title="نصب اپلیکیشن RealRate روی صفحه اصلی گوشی"
            className="text-amber-400 hover:text-amber-300 transition-colors p-1 cursor-pointer"
            aria-label="نصب اپلیکیشن"
          >
            <Smartphone size={18} strokeWidth={2} />
          </button>

          <a
            href="https://github.com/nos486/realrate"
            target="_blank"
            rel="noreferrer"
            title="مشاهده سورس در گیت‌هاب"
            className="text-amber-400 hover:text-amber-300 transition-colors p-1"
            aria-label="گیت‌هاب"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          </a>

          <Link
            to="/admin"
            title="ورود به پنل مدیریت"
            className="text-amber-400 hover:text-amber-300 transition-colors p-1"
            aria-label="پنل مدیریت"
          >
            <ShieldCheck size={18} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
