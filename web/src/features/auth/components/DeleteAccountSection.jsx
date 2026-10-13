/**
 * DeleteAccountSection.jsx — Delete the account and all its data for good (account settings)
 *
 * Google Play requires deleting an account from inside the app. Guarded like the vault reset: a
 * list of what goes, the typed confirmation phrase, and the account password when it has one (the
 * server checks it too). Not shown for the demo account or an admin (the server refuses them).
 */

import React, { useState } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { AlertBanner, Button, Input } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { useDemo } from '../../demo/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteAccount } from '../api/authApi.js';
import PasswordInput from './PasswordInput.jsx';

/** What the user types to confirm */
export const ACCOUNT_DELETE_PHRASE = 'حذف حساب';

const normalize = (text) => String(text || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();

export default function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const { toast } = useFeedback();
  const demo = useDemo();
  const hasPassword = Boolean(user?.hasPassword);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user || user.isAdmin || demo?.isDemo) return null;

  const confirmed = normalize(phrase) === ACCOUNT_DELETE_PHRASE && (!hasPassword || password.length > 0);

  const close = () => {
    setOpen(false);
    setPhrase('');
    setPassword('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteAccount({ password: hasPassword ? password : undefined });
      toast.success('حساب و همه‌ی اطلاعات آن حذف شد.');
      // Signs out and clears what this device kept (the session no longer exists on the server)
      await logout();
    } catch (err) {
      setError(err.message || 'حذف حساب انجام نشد.');
      setBusy(false);
    }
  };

  return (
    <section className="vault-settings vault-reset" id="delete-account" aria-labelledby="delete-account-title">
      <div className="section-title">
        <span id="delete-account-title">
          <Trash2 size={18} className="vault-settings-title-icon" />
          حذف حساب
        </span>
      </div>
      <p className="vault-settings-text">
        با حذف حساب، ایمیل، ورود و همه‌ی اطلاعاتتان از سرور برای همیشه پاک می‌شود.
      </p>

      {!open ? (
        <div className="vault-settings-actions">
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setOpen(true)}>
            حذف حساب و همه اطلاعات
          </Button>
        </div>
      ) : (
        <form className="vault-reset-form" onSubmit={submit}>
          <div className="vault-reset-warning" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <div>
              <strong>این کار برگشت‌پذیر نیست. این‌ها برای همیشه حذف می‌شوند:</strong>
              <ul>
                <li>حساب کاربری، ایمیل و روش‌های ورود (گوگل و رمز عبور)</li>
                <li>همه پورتفوها، وام‌ها، درآمدها، چک‌ها، هزینه‌ها، بودجه‌ها و حساب‌های بانکی</li>
                <li>رمزنگاری سرتاسری، یادآوری‌ها و اشتراک اعلان‌ها</li>
              </ul>
              <span>پیش از حذف، در صورت نیاز از «پشتیبان‌گیری» خروجی بگیرید.</span>
            </div>
          </div>

          {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}

          <Input
            id="delete-account-phrase"
            label={`برای تأیید، عبارت «${ACCOUNT_DELETE_PHRASE}» را بنویسید`}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
          {hasPassword && (
            <PasswordInput
              id="delete-account-password"
              label="رمز عبور ورود به حساب"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          )}

          <div className="vault-settings-actions">
            <Button type="submit" variant="danger" size="sm" icon={<Trash2 size={14} />} loading={busy} disabled={!confirmed}>
              حذف همیشگی حساب
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={close} disabled={busy}>
              انصراف
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
