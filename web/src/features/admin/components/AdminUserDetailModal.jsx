/**
 * AdminUserDetailModal.jsx — One user's account facts, usage counts and the admin actions
 * (resend the verification email, sign out everywhere, block / unblock)
 *
 * Only counts are shown: the admin sees how much someone uses the app, never their records.
 */

import React, { useEffect, useState } from 'react';
import { UserRound, Ban, LogOut, MailCheck, ShieldCheck, Lock, RotateCcw } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { getAdminUserDetail, resendAdminVerification, setAdminUserBlocked, signOutAdminUser } from '../api/adminApi.js';
import { faNum, formatDateTime, displayName } from '../utils/adminFormat.js';
import GoogleIcon from '../../auth/components/GoogleIcon.jsx';
import { UserBadges } from './AdminUsersCard.jsx';

const USAGE_LABELS = [
  ['portfolios', 'پورتفو'],
  ['holdings', 'دارایی'],
  ['transactions', 'تراکنش'],
  ['loans', 'وام'],
  ['cheques', 'چک'],
  ['incomes', 'درآمد'],
  ['recurringIncomes', 'درآمد ثابت'],
];

function Fact({ label, children }) {
  return (
    <div className="admin-fact">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export default function AdminUserDetailModal({ userId, fallback, onClose, onChanged }) {
  const { confirm, toast } = useFeedback();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // action in progress

  useEffect(() => {
    let active = true;
    getAdminUserDetail(userId)
      .then((data) => {
        if (active) setDetail(data.user);
      })
      .catch((err) => {
        if (active) setError(err.message || 'دریافت اطلاعات کاربر ناموفق بود.');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const run = async (action, fn) => {
    setBusy(action);
    try {
      const res = await fn();
      if (res.user) setDetail(res.user);
      toast.success(res.message || 'انجام شد.');
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  const handleBlock = async () => {
    const blocking = !detail.disabled;
    if (blocking) {
      const ok = await confirm({
        title: 'مسدود کردن کاربر',
        message: `«${displayName(detail)}» از همه دستگاه‌ها خارج می‌شود و تا رفع مسدودی نمی‌تواند وارد شود. اطلاعات او حذف نمی‌شود.`,
        confirmLabel: 'مسدود شود',
        danger: true,
      });
      if (!ok) return;
    }
    run('block', () => setAdminUserBlocked(detail.id, blocking));
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'خروج از همه دستگاه‌ها',
      message: `همه نشست‌های «${displayName(detail)}» بسته می‌شود و باید دوباره وارد شود.`,
      confirmLabel: 'خروج از همه دستگاه‌ها',
    });
    if (ok) run('signout', () => signOutAdminUser(detail.id));
  };

  const user = detail || fallback;

  const footer = detail ? (
    <div className="admin-detail-actions">
      {!detail.emailVerified && detail.hasPassword && (
        <Button
          variant="secondary"
          size="sm"
          icon={<MailCheck size={14} />}
          loading={busy === 'resend'}
          disabled={Boolean(busy)}
          onClick={() => run('resend', () => resendAdminVerification(detail.id))}
        >
          ارسال دوباره ایمیل تأیید
        </Button>
      )}
      <Button
        variant="secondary"
        size="sm"
        icon={<LogOut size={14} />}
        loading={busy === 'signout'}
        disabled={Boolean(busy) || detail.activeSessions === 0}
        onClick={handleSignOut}
      >
        خروج از همه دستگاه‌ها
      </Button>
      {!detail.isAdmin && (
        <Button
          variant={detail.disabled ? 'primary' : 'danger'}
          size="sm"
          icon={detail.disabled ? <RotateCcw size={14} /> : <Ban size={14} />}
          loading={busy === 'block'}
          disabled={Boolean(busy)}
          onClick={handleBlock}
        >
          {detail.disabled ? 'رفع مسدودی' : 'مسدود کردن'}
        </Button>
      )}
    </div>
  ) : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={displayName(user)}
      subtitle={user?.email}
      icon={<UserRound size={18} />}
      footer={footer}
      maxWidth="560px"
      className="admin-detail-modal"
    >
      {error ? (
        <AlertBanner type="error" message={error} />
      ) : !detail ? (
        <SkeletonRows rows={5} columns={2} label="در حال دریافت اطلاعات کاربر" />
      ) : (
        <div className="admin-detail">
          {detail.disabled && (
            <AlertBanner type="error" icon={<Ban size={16} />} message="این حساب مسدود است و نمی‌تواند وارد شود." />
          )}

          <div className="admin-detail-chips">
            <UserBadges user={detail} />
            {detail.emailVerified && <span className="admin-chip is-green">ایمیل تأییدشده</span>}
            {detail.googleLinked && (
              <span className="admin-chip">
                <GoogleIcon size={11} /> ورود با گوگل
              </span>
            )}
            {detail.hasPassword && <span className="admin-chip">ورود با ایمیل و رمز</span>}
            {detail.vaultEnabled && (
              <span className="admin-chip is-blue">
                <Lock size={11} /> رمزنگاری فعال
              </span>
            )}
            {detail.isAdmin && (
              <span className="admin-chip is-blue">
                <ShieldCheck size={11} /> قابل مسدود کردن نیست
              </span>
            )}
          </div>

          <section>
            <h4 className="admin-detail-title">حساب</h4>
            <div className="admin-facts">
              <Fact label="ثبت‌نام">{formatDateTime(detail.createdAt)}</Fact>
              <Fact label="آخرین ورود">{formatDateTime(detail.lastLogin)}</Fact>
              <Fact label="تعداد ورود">{faNum(detail.loginCount)}</Fact>
              <Fact label="روزهای فعال (۳۰ روز)">{faNum(detail.activeDays30)}</Fact>
              <Fact label="نشست‌های فعال">{faNum(detail.activeSessions)}</Fact>
              <Fact label="شناسه">
                <bdi className="admin-mono">{detail.id}</bdi>
              </Fact>
            </div>
          </section>

          <section>
            <h4 className="admin-detail-title">استفاده از برنامه</h4>
            <div className="admin-usage">
              {USAGE_LABELS.map(([key, label]) => (
                <div key={key} className={`admin-usage-item ${detail.usage?.[key] ? '' : 'is-zero'}`}>
                  <strong>{faNum(detail.usage?.[key] || 0)}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="admin-detail-note">فقط تعداد نمایش داده می‌شود؛ محتوای اطلاعات مالی کاربر در دسترس مدیر نیست.</p>
          </section>
        </div>
      )}
    </Modal>
  );
}
