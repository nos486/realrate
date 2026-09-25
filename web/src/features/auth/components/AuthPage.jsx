/**
 * AuthPage.jsx — Sign in, sign up, forgot / reset password and email verification
 *
 * One page for every sign-in route (see AUTH_PATHS): the mode follows the URL, so each step has
 * its own link (the emailed links open /verify-email and /reset-password). Google stays one tap
 * away on the sign-in and sign-up forms.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Mail, MailCheck, KeyRound, UserPlus, LogIn, ArrowRight } from 'lucide-react';
import { AlertBanner, Button, Input } from '../../../shared/ui/index.js';
import { APP_BASE, AUTH_PATHS, LANDING_PATH } from '../../../shared/routes.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  loginWithPassword,
  register,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
} from '../api/authApi.js';
import GoogleIcon from './GoogleIcon.jsx';
import PasswordInput from './PasswordInput.jsx';
import { PASSWORD_HINT, checkNewPassword } from './passwordRules.js';

const MODE_BY_PATH = Object.fromEntries(Object.entries(AUTH_PATHS).map(([mode, path]) => [path, mode]));
const RESEND_COOLDOWN_SECONDS = 60;

/** Read a one-time token from the URL once, then drop it from the address bar and history */
function useUrlToken() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  useEffect(() => {
    if (token) window.history.replaceState({}, document.title, window.location.pathname);
  }, [token]);
  return token;
}

function Card({ icon, title, subtitle, children }) {
  return (
    <div className="auth-card">
      <div className="auth-card-head">
        <span className="auth-card-icon" aria-hidden="true">{icon}</span>
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function GoogleButton({ label }) {
  const { loginWithGoogle } = useAuth();
  return (
    <>
      <button type="button" className="auth-google-btn" onClick={loginWithGoogle}>
        <GoogleIcon size={18} />
        <span>{label}</span>
      </button>
      <div className="auth-divider"><span>یا با ایمیل</span></div>
    </>
  );
}

/** Resend button with a cooldown, for the "check your email" screens */
function ResendButton({ onResend }) {
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const resend = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onResend();
      setMessage('لینک دوباره ارسال شد.');
      setSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setMessage(err.message || 'ارسال دوباره ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-resend">
      <Button variant="secondary" block onClick={resend} disabled={seconds > 0 || busy} loading={busy}>
        {seconds > 0 ? `ارسال دوباره (${seconds.toLocaleString('fa-IR')} ثانیه)` : 'ارسال دوباره لینک'}
      </Button>
      {message && <span className="auth-muted" role="status">{message}</span>}
    </div>
  );
}

function CheckEmail({ email, title, text, onResend, onBack }) {
  return (
    <Card icon={<MailCheck size={22} />} title={title} subtitle={email}>
      <p className="auth-text">{text}</p>
      <p className="auth-muted">ایمیل را پیدا نمی‌کنید؟ پوشه اسپم را هم ببینید.</p>
      {onResend && <ResendButton onResend={onResend} />}
      {onBack && (
        <button type="button" className="auth-link-btn" onClick={onBack}>
          ایمیل را اشتباه وارد کرده‌ام
        </button>
      )}
    </Card>
  );
}

// ── Modes ───────────────────────────────────────────────────────────────────

function LoginForm() {
  const { completeLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setUnverified(false);
    try {
      completeLogin(await loginWithPassword(email.trim(), password));
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') setUnverified(true);
      setError(err.message || 'ورود ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card icon={<LogIn size={22} />} title="ورود به RealRate" subtitle="با گوگل یا ایمیل و رمز عبور">
      <GoogleButton label="ورود با گوگل" />
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && <AlertBanner type={unverified ? 'warning' : 'error'} message={error} />}
        {unverified && <ResendButton onResend={() => resendVerification(email.trim())} />}
        <Input id="auth-email" type="email" label="ایمیل" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required />
        <PasswordInput id="auth-password" label="رمز عبور" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <div className="auth-row-end">
          <Link to={AUTH_PATHS.forgot} className="auth-link">رمز عبور را فراموش کرده‌اید؟</Link>
        </div>
        <Button type="submit" block loading={busy} disabled={!email.trim() || !password}>ورود</Button>
      </form>
      <p className="auth-switch">
        حساب ندارید؟ <Link to={AUTH_PATHS.register} className="auth-link">ثبت‌نام کنید</Link>
      </p>
    </Card>
  );
}

function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [touched, setTouched] = useState(false);

  const passwordError = touched ? checkNewPassword(password, confirm) : '';

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (checkNewPassword(password, confirm)) return;
    setBusy(true);
    setError('');
    try {
      const res = await register({ name: name.trim(), email: email.trim(), password });
      setSentTo(res.email || email.trim());
    } catch (err) {
      setError(err.message || 'ثبت‌نام ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <CheckEmail
        email={sentTo}
        title="ایمیل خود را تأیید کنید"
        text="لینک تأیید به این ایمیل ارسال شد. با باز کردن لینک (تا ۲۴ ساعت)، حساب شما فعال می‌شود و وارد برنامه می‌شوید."
        onResend={() => resendVerification(sentTo)}
        onBack={() => setSentTo('')}
      />
    );
  }

  return (
    <Card icon={<UserPlus size={22} />} title="ساخت حساب RealRate" subtitle="رایگان؛ ایمیل شما با یک لینک تأیید می‌شود">
      <GoogleButton label="ثبت‌نام با گوگل" />
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && <AlertBanner type="error" message={error} />}
        <Input id="auth-name" label="نام (اختیاری)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
        <Input id="auth-email" type="email" label="ایمیل" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required />
        <PasswordInput id="auth-password" label="رمز عبور" hint={PASSWORD_HINT} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <PasswordInput id="auth-password-confirm" label="تکرار رمز عبور" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={passwordError} required />
        <Button type="submit" block loading={busy} disabled={!email.trim() || !password || !confirm}>ساخت حساب</Button>
      </form>
      <p className="auth-switch">
        حساب دارید؟ <Link to={AUTH_PATHS.login} className="auth-link">وارد شوید</Link>
      </p>
    </Card>
  );
}

function ForgotForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const send = async (address) => {
    await requestPasswordReset(address);
    setSentTo(address);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await send(email.trim());
    } catch (err) {
      setError(err.message || 'ارسال لینک ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <CheckEmail
        email={sentTo}
        title="لینک بازیابی ارسال شد"
        text="اگر حسابی با این ایمیل وجود داشته باشد، لینک تعیین رمز جدید (با اعتبار یک ساعت) برایش ارسال شد. حساب‌هایی که با گوگل ساخته شده‌اند هم از همین راه رمز عبور می‌گیرند."
        onResend={() => requestPasswordReset(sentTo)}
        onBack={() => setSentTo('')}
      />
    );
  }

  return (
    <Card icon={<KeyRound size={22} />} title="فراموشی رمز عبور" subtitle="لینک تعیین رمز جدید به ایمیل شما ارسال می‌شود">
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && <AlertBanner type="error" message={error} />}
        <Input id="auth-email" type="email" label="ایمیل" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required />
        <Button type="submit" block loading={busy} disabled={!email.trim()}>ارسال لینک</Button>
      </form>
      <p className="auth-switch">
        <Link to={AUTH_PATHS.login} className="auth-link">بازگشت به ورود</Link>
      </p>
    </Card>
  );
}

function ResetForm() {
  const token = useUrlToken();
  const { completeLogin } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  if (!token) return <InvalidLink kind="reset" />;

  const passwordError = touched ? checkNewPassword(password, confirm) : '';

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (checkNewPassword(password, confirm)) return;
    setBusy(true);
    setError('');
    try {
      completeLogin(await resetPassword(token, password));
    } catch (err) {
      setError(err.message || 'تعیین رمز ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card icon={<KeyRound size={22} />} title="تعیین رمز عبور جدید" subtitle="پس از ثبت، از دستگاه‌های دیگر خارج می‌شوید">
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && <AlertBanner type="error" message={error} />}
        <PasswordInput id="auth-password" label="رمز عبور جدید" hint={PASSWORD_HINT} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <PasswordInput id="auth-password-confirm" label="تکرار رمز عبور" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={passwordError} required />
        <Button type="submit" block loading={busy} disabled={!password || !confirm}>ثبت رمز و ورود</Button>
      </form>
      {error && (
        <p className="auth-switch">
          <Link to={AUTH_PATHS.forgot} className="auth-link">درخواست لینک جدید</Link>
        </p>
      )}
    </Card>
  );
}

function VerifyEmail() {
  const token = useUrlToken();
  const { completeLogin } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Once only (a token is single-use; StrictMode would otherwise spend it twice)
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(completeLogin)
      .catch((err) => setError(err.message || 'تأیید ایمیل ناموفق بود.'));
  }, [token, completeLogin]);

  if (!token) return <InvalidLink kind="verify" />;
  if (error) return <InvalidLink kind="verify" message={error} />;

  return (
    <Card icon={<Mail size={22} />} title="در حال تأیید ایمیل…" subtitle="چند لحظه صبر کنید">
      <div className="auth-spinner"><div className="spinner-glow" /></div>
    </Card>
  );
}

function InvalidLink({ kind, message }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const isVerify = kind === 'verify';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await (isVerify ? resendVerification(email.trim()) : requestPasswordReset(email.trim()));
      setSent(true);
    } catch (err) {
      setError(err.message || 'ارسال ناموفق بود.');
    }
  };

  return (
    <Card
      icon={<Mail size={22} />}
      title="لینک معتبر نیست"
      subtitle={message || 'این لینک استفاده شده، منقضی شده یا ناقص کپی شده است.'}
    >
      {sent ? (
        <AlertBanner type="success" message="اگر این ایمیل قابل استفاده باشد، لینک جدید برایش ارسال شد." />
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          {error && <AlertBanner type="error" message={error} />}
          <Input id="auth-email" type="email" label="ایمیل" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required />
          <Button type="submit" block disabled={!email.trim()}>{isVerify ? 'ارسال لینک تأیید جدید' : 'ارسال لینک بازیابی جدید'}</Button>
        </form>
      )}
      <p className="auth-switch">
        <Link to={AUTH_PATHS.login} className="auth-link">بازگشت به ورود</Link>
      </p>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode = MODE_BY_PATH[pathname] || 'login';

  // Already signed in: sign-in and sign-up have nothing to do (links in emails still work)
  if (!loading && user && (mode === 'login' || mode === 'register' || mode === 'forgot')) {
    return <Navigate to={APP_BASE} replace />;
  }

  return (
    <div className="auth-page" dir="rtl">
      <header className="auth-top">
        <button type="button" className="auth-back" onClick={() => navigate(LANDING_PATH)}>
          <ArrowRight size={16} />
          <span>RealRate</span>
        </button>
      </header>
      <main className="auth-main">
        {mode === 'register' && <RegisterForm />}
        {mode === 'forgot' && <ForgotForm />}
        {mode === 'reset' && <ResetForm />}
        {mode === 'verify' && <VerifyEmail />}
        {mode === 'login' && <LoginForm />}
      </main>
    </div>
  );
}
