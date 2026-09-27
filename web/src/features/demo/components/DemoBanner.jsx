/**
 * DemoBanner.jsx — Sticky Top Banner for Demo View and Edit Sessions
 */

import React, { useState } from 'react';
import { Eye, Edit3, ArrowLeft, ShieldAlert, CornerUpRight } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';

export default function DemoBanner() {
  const { isDemo, isDemoView, isDemoEdit, demoNotReady, exitDemoToRegister, exitDemoToAdmin } = useDemo();
  const [exiting, setExiting] = useState(false);

  if (!isDemo) return null;

  const handleRegister = async () => {
    setExiting(true);
    try {
      await exitDemoToRegister();
    } finally {
      setExiting(false);
    }
  };

  const handleReturnToAdmin = async () => {
    setExiting(true);
    try {
      await exitDemoToAdmin();
    } finally {
      setExiting(false);
    }
  };

  if (demoNotReady && isDemoView) {
    return (
      <aside className="demo-sticky-bar demo-bar-warning" role="region" aria-label="وضعیت دمو">
        <div className="demo-bar-inner">
          <div className="demo-bar-info">
            <ShieldAlert size={16} className="demo-bar-icon" />
            <span className="demo-bar-text">دمو هنوز آماده نیست. لطفا دقایقی دیگر مراجعه فرمایید یا حساب جدید بسازید.</span>
          </div>
          <button
            type="button"
            className="demo-bar-action demo-action-amber"
            onClick={handleRegister}
            disabled={exiting}
          >
            <span>ثبت‌نام</span>
            <ArrowLeft size={14} />
          </button>
        </div>
      </aside>
    );
  }

  if (isDemoView) {
    return (
      <aside className="demo-sticky-bar demo-bar-view" role="region" aria-label="نسخه دمو">
        <div className="demo-bar-inner">
          <div className="demo-bar-info">
            <Eye size={16} className="demo-bar-icon" />
            <span className="demo-bar-text">نسخه دمو — فقط مشاهده. برای ثبت اطلاعات خودتان ثبت‌نام کنید.</span>
          </div>
          <button
            type="button"
            className="demo-bar-action demo-action-accent"
            onClick={handleRegister}
            disabled={exiting}
          >
            <span>ثبت‌نام</span>
            <ArrowLeft size={14} />
          </button>
        </div>
      </aside>
    );
  }

  if (isDemoEdit) {
    return (
      <aside className="demo-sticky-bar demo-bar-edit" role="region" aria-label="ویرایش دمو">
        <div className="demo-bar-inner">
          <div className="demo-bar-info">
            <Edit3 size={16} className="demo-bar-icon" />
            <span className="demo-bar-text">در حال ویرایش داده‌های دمو</span>
          </div>
          <button
            type="button"
            className="demo-bar-action demo-action-purple"
            onClick={handleReturnToAdmin}
            disabled={exiting}
          >
            <CornerUpRight size={14} />
            <span>بازگشت به حساب ادمین</span>
          </button>
        </div>
      </aside>
    );
  }

  return null;
}
