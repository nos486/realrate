/**
 * AppUpdatePrompt.jsx — «نسخه‌ی جدید»: the Android app's update prompt (shared/native/appUpdate.js)
 *
 * Starts the automatic checks once the app shell is up, and opens when a newer release is
 * found: its notes, then a download with progress and Android's installer.
 */

import React, { useEffect } from 'react';
import { Download, ShieldCheck, RefreshCw } from 'lucide-react';
import { Button, Modal, AlertBanner } from '../ui/index.js';
import { useAppUpdate } from '../native/useAppUpdate.js';
import {
  startAutoUpdateCheck,
  snoozeUpdate,
  downloadAndInstall,
  openInstallPermission,
  releaseNotesText,
} from '../native/appUpdate.js';

const faVersion = (v) => String(v || '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const faMb = (bytes) => (Number(bytes) / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 });

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
        <Button variant="ghost" onClick={snoozeUpdate}>بعداً</Button>
        <Button icon={<ShieldCheck size={16} />} onClick={openInstallPermission}>اجازه‌ی نصب</Button>
      </>
    );
  } else {
    footer = (
      <>
        <Button variant="ghost" onClick={snoozeUpdate}>{downloading ? 'لغو' : 'بعداً'}</Button>
        <Button
          icon={status === 'error' ? <RefreshCw size={16} /> : <Download size={16} />}
          loading={downloading || status === 'installing'}
          onClick={downloadAndInstall}
        >
          {status === 'error' ? 'تلاش دوباره' : status === 'installing' ? 'نصب' : 'به‌روزرسانی'}
        </Button>
      </>
    );
  }

  return (
    <Modal
      isOpen={update.open}
      onClose={snoozeUpdate}
      icon={<Download size={20} />}
      title="نسخه‌ی جدید RealRate"
      subtitle={`نسخه‌ی ${faVersion(release.version)}${installedVersion ? ` · نسخه‌ی فعلی ${faVersion(installedVersion)}` : ''}${release.size ? ` · ${faMb(release.size)} مگابایت` : ''}`}
      footer={footer}
      className="app-update-modal"
    >
      {notes ? <p className="app-update-notes">{notes}</p> : <p className="app-update-notes">نسخه‌ی جدید اپ آماده‌ی نصب است.</p>}

      {downloading && (
        <div className="app-update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="app-update-progress-track"><span style={{ width: `${percent}%` }} /></div>
          <small>در حال دانلود… {percent.toLocaleString('fa-IR')}٪</small>
        </div>
      )}
      {status === 'installing' && (
        <AlertBanner type="info" message="نصب‌کننده‌ی اندروید باز شد؛ «نصب» یا «به‌روزرسانی» را بزنید. اطلاعات شما سر جایش می‌ماند." />
      )}
      {status === 'permission' && (
        <AlertBanner
          type="info"
          message="برای نصب به‌روزرسانی، اندروید یک بار اجازه‌ی «نصب برنامه‌های ناشناس» را برای RealRate می‌خواهد. آن را روشن کنید و به اپ برگردید."
        />
      )}
      {status === 'error' && error && <AlertBanner type="error" message={error} />}
    </Modal>
  );
}
