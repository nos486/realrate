/**
 * AppUpdatePrompt.jsx — «نسخه‌ی جدید»: the Android app's update banner and prompt
 * (shared/native/appUpdate.js)
 *
 * AppUpdatePrompt starts the automatic checks once the app shell is up (every time the app
 * opens). A newer release shows AppUpdateBanner at the top; tapping it opens the prompt: the
 * release notes, then a download with progress and Android's installer. WebBundleProgress is the
 * bar shown while newer pages (a web bundle, no new APK) download.
 */

import { getLocale, intlLocale, t } from '../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { Download, ShieldCheck, RefreshCw, X } from 'lucide-react';
import { Button, Modal, AlertBanner } from '../ui/index.js';
import { useAppUpdate } from '../native/useAppUpdate.js';
import {
  startAutoUpdateCheck,
  snoozeUpdate,
  downloadAndInstall,
  openInstallPermission,
  releaseNotesText,
  openUpdatePrompt,
  hideUpdateBanner,
  hasUpdate,
} from '../native/appUpdate.js';
import { getWebBundleProgress, WEB_BUNDLE_EVENT } from '../native/webBundle.js';

const faVersion = (v) => (getLocale() === 'fa' ? String(v || '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(v || '')); // i18n-ignore
const faMb = (bytes) => (Number(bytes) / 1024 / 1024).toLocaleString(intlLocale(), { maximumFractionDigits: 1 });

/** «نسخه‌ی … آماده است»: shown while a newer version is known, until its × (or the update) */
export function AppUpdateBanner() {
  const update = useAppUpdate();
  if (!hasUpdate(update) || update.bannerHidden) return null;
  return (
    <div className="app-update-banner" role="status">
      <Download size={16} aria-hidden="true" />
      <button type="button" className="app-update-banner-text" onClick={openUpdatePrompt}>
        <strong>{t('نسخه‌ی {version} آماده است', { version: faVersion(update.release.version) })}</strong>
        <span>{t('برای به‌روزرسانی بزنید')}</span>
      </button>
      <button type="button" className="app-update-banner-close" onClick={hideUpdateBanner} aria-label={t('بستن')}>
        <X size={16} />
      </button>
    </div>
  );
}

export default function AppUpdatePrompt() {
  const update = useAppUpdate();
  useEffect(() => startAutoUpdateCheck(), []);

  const { release, status, progress, error, installedVersion } = update;
  if (!release) return null;
  const notes = releaseNotesText(release.notes);
  const downloading = status === 'downloading';
  const percent = Math.round((progress || 0) * 100);

  let footer;
  if (status === 'permission') {
    footer = (
      <>
        <Button variant="ghost" onClick={snoozeUpdate}>{t('بعداً')}</Button>
        <Button icon={<ShieldCheck size={16} />} onClick={openInstallPermission}>{t('اجازه‌ی نصب')}</Button>
      </>
    );
  } else {
    footer = (
      <>
        <Button variant="ghost" onClick={snoozeUpdate}>{downloading ? t('لغو') : t('بعداً')}</Button>
        <Button
          icon={status === 'error' ? <RefreshCw size={16} /> : <Download size={16} />}
          loading={downloading || status === 'ready'}
          onClick={downloadAndInstall}
        >
          {status === 'error' ? t('تلاش دوباره') : t('به‌روزرسانی')}
        </Button>
      </>
    );
  }

  return (
    <Modal
      isOpen={update.open}
      onClose={snoozeUpdate}
      icon={<Download size={20} />}
      title={t('نسخه‌ی جدید RealRate')}
      subtitle={[t('نسخه‌ی {version}', { version: faVersion(release.version) }), installedVersion && t('نسخه‌ی فعلی {version}', { version: faVersion(installedVersion) }), release.size && t('{size} مگابایت', { size: faMb(release.size) })].filter(Boolean).join(' · ')}
      footer={footer}
      className="app-update-modal"
    >
      {notes ? <p className="app-update-notes">{notes}</p> : <p className="app-update-notes">{t('نسخه‌ی جدید اپ آماده‌ی نصب است.')}</p>}

      {downloading && (
        <div className="app-update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="app-update-progress-track"><span style={{ width: `${percent}%` }} /></div>
          <small>{t('در حال دانلود… {percent}٪', { percent: percent.toLocaleString(intlLocale()) })}</small>
        </div>
      )}
      {status === 'ready' && (
        <AlertBanner type="info" message={t('دانلود تمام شد؛ نصب‌کننده‌ی اندروید با بازگشت به اپ باز می‌شود.')} />
      )}
      {status === 'installing' && (
        <AlertBanner type="info" message={t('نصب‌کننده‌ی اندروید باز شد؛ «نصب» یا «به‌روزرسانی» را بزنید. اطلاعات شما سر جایش می‌ماند.')} />
      )}
      {status === 'permission' && (
        <AlertBanner
          type="info"
          message={t('برای نصب به‌روزرسانی، اندروید یک بار اجازه‌ی «نصب برنامه‌های ناشناس» را برای RealRate می‌خواهد. آن را روشن کنید و به اپ برگردید.')}
        />
      )}
      {status === 'error' && error && <AlertBanner type="error" message={error} />}
    </Modal>
  );
}

/** «در حال دریافت نسخه‌ی تازه»: a bar at the top while a web bundle downloads (shared/native/webBundle.js) */
export function WebBundleProgress() {
  const [state, setState] = useState(getWebBundleProgress);
  useEffect(() => {
    const refresh = () => setState(getWebBundleProgress());
    window.addEventListener(WEB_BUNDLE_EVENT, refresh);
    return () => window.removeEventListener(WEB_BUNDLE_EVENT, refresh);
  }, []);
  if (!state.downloading) return null;
  const percent = Math.round((state.progress || 0) * 100);
  return (
    <div className="app-update-banner web-bundle-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <Download size={16} aria-hidden="true" />
      <div className="app-update-progress">
        <small>{t('در حال دریافت نسخه‌ی تازه… {percent}٪', { percent: percent.toLocaleString(intlLocale()) })}</small>
        <div className="app-update-progress-track"><span style={{ width: `${percent}%` }} /></div>
      </div>
    </div>
  );
}
