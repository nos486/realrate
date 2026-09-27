/**
 * AdminDemoCard.jsx — Admin Panel card for Demo Account management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  PlusCircle,
  Edit3,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Briefcase,
  Landmark,
  Wallet,
  ReceiptText,
} from 'lucide-react';
import { Button, Modal } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { useAuth } from '../../auth/index.js';
import { getToken } from '../../../shared/api/httpClient.js';
import {
  getAdminDemoStatus,
  createAdminDemo,
  createAdminDemoEditSession,
  resetAdminDemo,
} from '../api/demoApi.js';
import { toPersianDigits } from '../../../shared/utils/formatters.js';

const ADMIN_RETURN_TOKEN_KEY = 'rr_admin_return_token';

export default function AdminDemoCard() {
  const { toast } = useFeedback();
  const { completeLogin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [demoData, setDemoData] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminDemoStatus();
      setDemoData(res?.demo || null);
    } catch (err) {
      toast.error(err.message || 'خطا در دریافت وضعیت حساب دمو');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCreate = async () => {
    setBusyAction('create');
    try {
      const res = await createAdminDemo();
      toast.success(res.message || 'حساب دمو با موفقیت آماده‌سازی شد.');
      await fetchStatus();
    } catch (err) {
      toast.error(err.message || 'خطا در ساخت حساب دمو');
    } finally {
      setBusyAction(null);
    }
  };

  const handleEdit = async () => {
    setBusyAction('edit');
    try {
      const currentToken = getToken();
      if (currentToken) {
        sessionStorage.setItem(ADMIN_RETURN_TOKEN_KEY, currentToken);
      }
      const data = await createAdminDemoEditSession();
      if (data?.token && data?.user) {
        toast.info('وارد حالت ویرایش داده‌های دمو شدید.');
        completeLogin(data);
      } else {
        toast.error('ایجاد سشن ویرایش دمو ناموفق بود.');
      }
    } catch (err) {
      toast.error(err.message || 'خطا در ورود به حالت ویرایش دمو');
    } finally {
      setBusyAction(null);
    }
  };

  const handleReset = async () => {
    setBusyAction('reset');
    try {
      const res = await resetAdminDemo();
      toast.success(res.message || 'داده‌های حساب دمو با موفقیت بازنشانی شد.');
      setConfirmResetOpen(false);
      await fetchStatus();
    } catch (err) {
      toast.error(err.message || 'خطا در بازنشانی داده‌های دمو');
    } finally {
      setBusyAction(null);
    }
  };

  const exists = demoData?.exists;
  const stats = demoData?.stats;

  return (
    <div className="portfolio-stat-card admin-demo-card">
      <div className="stat-header">
        <span className="stat-label">
          <Sparkles size={15} /> حساب نمایشی (دمو)
        </span>
        <span className={`status-indicator ${exists ? 'is-active' : 'is-inactive'}`}>
          {exists ? (
            <span className="flex-center gap-1 text-emerald">
              <CheckCircle2 size={13} /> فعال
            </span>
          ) : (
            <span className="flex-center gap-1 text-slate">
              <XCircle size={13} /> ساخته نشده
            </span>
          )}
        </span>
      </div>

      <p className="admin-card-hint">
        بازدیدکنندگان بدون ثبت‌نام با یک کلیک حساب دمو را فقط برای مشاهده می‌بینند.
      </p>

      {loading ? (
        <div className="admin-demo-loading" role="status">
          <span className="spinner-glow" />
        </div>
      ) : exists ? (
        <div className="admin-demo-stats-grid">
          <div className="demo-stat-pill">
            <Briefcase size={13} />
            <span>پورتفوها: {toPersianDigits(stats?.portfolios ?? 0)}</span>
          </div>
          <div className="demo-stat-pill">
            <Landmark size={13} />
            <span>وام‌ها: {toPersianDigits(stats?.loans ?? 0)}</span>
          </div>
          <div className="demo-stat-pill">
            <Wallet size={13} />
            <span>درآمدها: {toPersianDigits(stats?.incomes ?? 0)}</span>
          </div>
          <div className="demo-stat-pill">
            <ReceiptText size={13} />
            <span>چک‌ها: {toPersianDigits(stats?.cheques ?? 0)}</span>
          </div>
        </div>
      ) : null}

      <div className="admin-demo-actions-row">
        {!exists ? (
          <Button
            size="sm"
            variant="primary"
            icon={<PlusCircle size={14} />}
            loading={busyAction === 'create'}
            disabled={Boolean(busyAction)}
            onClick={handleCreate}
          >
            ساخت حساب دمو
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              icon={<Edit3 size={14} />}
              loading={busyAction === 'edit'}
              disabled={Boolean(busyAction)}
              onClick={handleEdit}
            >
              ویرایش داده‌های دمو
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<RotateCcw size={14} />}
              disabled={Boolean(busyAction)}
              onClick={() => setConfirmResetOpen(true)}
            >
              بازنشانی داده‌ها
            </Button>
          </>
        )}
      </div>

      {confirmResetOpen && (
        <Modal
          isOpen={confirmResetOpen}
          onClose={() => !busyAction && setConfirmResetOpen(false)}
          title="بازنشانی داده‌های حساب دمو"
        >
          <div className="admin-confirm-modal-body">
            <p>
              آیا از بازنشانی داده‌های حساب دمو اطمینان دارید؟ تمام پورتفوها، تراکنش‌ها، وام‌ها،
              درآمدها و چک‌های موجود در حساب دمو حذف خواهند شد و گاوصندوق خالی می‌شود.
            </p>
            <div className="modal-actions-row" style={{ marginTop: '16px' }}>
              <Button
                variant="danger"
                loading={busyAction === 'reset'}
                onClick={handleReset}
              >
                تأیید و بازنشانی
              </Button>
              <Button
                variant="secondary"
                disabled={Boolean(busyAction)}
                onClick={() => setConfirmResetOpen(false)}
              >
                انصراف
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
