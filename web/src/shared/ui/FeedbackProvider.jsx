import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

/**
 * FeedbackProvider — in-app replacements for window.confirm / window.alert plus toasts.
 *
 *   const { confirm, alert, toast } = useFeedback();
 *   if (!(await confirm({ title: 'حذف دارایی', message: '...', danger: true }))) return;
 *   toast.error('خطا در حذف');
 *
 * Native dialogs block the page, ignore the app's RTL styling and look like a phishing prompt on
 * mobile browsers; these follow the app's design and keep keyboard/screen-reader support.
 */

const FeedbackContext = createContext(null);

const TOAST_DURATION_MS = 4500;

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const openDialog = useCallback((options, kind) => new Promise((resolve) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    setDialog({ ...opts, kind, resolve });
  }), []);

  const closeDialog = useCallback((result) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type, message, { duration = TOAST_DURATION_MS } = {}) => {
    if (!message) return;
    const id = ++toastIdRef.current;
    setToasts((list) => [...list.slice(-3), { id, type, message }]);
    if (duration > 0) window.setTimeout(() => dismissToast(id), duration);
  }, [dismissToast]);

  const value = useMemo(() => {
    const info = (message, options) => showToast('info', message, options);
    const toast = Object.assign(info, {
      info,
      success: (message, options) => showToast('success', message, options),
      error: (message, options) => showToast('error', message, options),
      warning: (message, options) => showToast('warning', message, options),
    });
    return {
      /** Resolves true when confirmed, false when cancelled/dismissed */
      confirm: (options) => openDialog(options, 'confirm'),
      /** Resolves once the user acknowledges the message */
      alert: (options) => openDialog(options, 'alert').then(() => undefined),
      toast,
    };
  }, [openDialog, showToast]);

  const isConfirm = dialog?.kind === 'confirm';

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <Modal
        isOpen={Boolean(dialog)}
        onClose={() => closeDialog(false)}
        title={dialog?.title || (isConfirm ? 'تأیید' : 'پیام')}
        icon={dialog?.danger ? <AlertTriangle size={18} /> : <Info size={18} />}
        maxWidth="420px"
        className={`feedback-dialog ${dialog?.danger ? 'is-danger' : ''}`}
        footer={
          <div className="feedback-dialog-actions">
            {isConfirm && (
              <Button variant="secondary" onClick={() => closeDialog(false)}>
                {dialog?.cancelLabel || 'انصراف'}
              </Button>
            )}
            <Button
              variant={dialog?.danger ? 'danger' : 'primary'}
              onClick={() => closeDialog(true)}
              autoFocus
            >
              {dialog?.confirmLabel || (isConfirm ? 'تأیید' : 'متوجه شدم')}
            </Button>
          </div>
        }
      >
        <p className="feedback-dialog-message">{dialog?.message}</p>
      </Modal>

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast-item ${t.type}`}>
              <Icon size={17} className="toast-icon" />
              <span className="toast-message">{t.message}</span>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismissToast(t.id)}
                aria-label="بستن پیام"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

/**
 * Access confirm / alert / toast. Falls back to the native dialogs outside the provider
 * (e.g. isolated component tests) so callers never have to null-check.
 */
export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (ctx) return ctx;
  const nativeAlert = (message) => { if (message) window.alert(message); };
  const nativeToast = Object.assign(nativeAlert, {
    info: nativeAlert,
    success: nativeAlert,
    error: nativeAlert,
    warning: nativeAlert,
  });
  return {
    confirm: async (options) => window.confirm(typeof options === 'string' ? options : options?.message),
    alert: async (options) => { window.alert(typeof options === 'string' ? options : options?.message); },
    toast: nativeToast,
  };
}
