import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const triggerPwaInstall = () => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      alert('جهت نصب اپلیکیشن روی آیفون:\n۱. دکمه Share 🔗 در پایین مرورگر Safari را بزنید.\n۲. گزینه "Add to Home Screen" ➕ را انتخاب کنید.');
    } else {
      alert('جهت نصب اپلیکیشن روی گوشی:\n۱. منوی ۳ نقطه مرورگر را بزنید.\n۲. گزینه "Add to Home Screen" یا "Install app" را انتخاب کنید.');
    }
  };

  return (
    <footer style={{
      marginTop: 'auto',
      padding: '24px clamp(16px, 3.5vw, 64px) 24px clamp(16px, 3.5vw, 64px)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px',
      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      color: 'var(--text-muted)',
      fontSize: '12px',
      width: '100%'
    }}>
      <p>منبع اطلاعات: قیمت روز بازار طلا و نرخ برابری ارزهای جهان</p>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={triggerPwaInstall}
          title="نصب اپلیکیشن RealRate روی صفحه اصلی گوشی"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--gold-light)',
            transition: 'opacity 0.2s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
            <path d="M12 6v6m-3-3l3 3 3-3"></path>
          </svg>
        </button>

        <a
          href="https://github.com/nos486/realrate"
          target="_blank"
          rel="noreferrer"
          title="مشاهده سورس در گیت‌هاب"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold-light)',
            transition: 'opacity 0.2s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
        </a>

        <Link
          to="/admin"
          title="ورود به پنل مدیریت"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold-light)',
            transition: 'opacity 0.2s',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </Link>
      </div>
    </footer>
  );
}
