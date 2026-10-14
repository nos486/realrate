/**
 * ChequesPage.jsx — Received and issued cheques: due dates and tracking
 *
 * - Register / edit / delete cheques (direction, amount, due date, counterparty, bank, number,
 *   Sayad ID, notes)
 * - Tracking: every status change or follow-up note is logged with its date
 * - Summary (open receivables / payables, nearest due date, bounced) and due reminders
 * - Filters by direction and state, and search
 */

import { t, intlLocale } from '../../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { ReceiptText, Plus } from 'lucide-react';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import {
  AlertBanner,
  Button,
  EmptyState,
  FeaturePageHeader,
  SearchBar,
  SplitPageLayout,
} from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { toEnglishDigits } from '../../../shared/utils/formatters.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { summarizeCheques, isChequeOpen, compareChequesByDue } from '../../../utils/chequeDocument.js';
import { useChequesContext } from '../context/ChequesContext.jsx';
import { getStatusDisplay, getDirectionDisplay } from '../constants/chequeDisplay.js';
import ChequeForm from './ChequeForm.jsx';
import ChequeTrackingModal from './ChequeTrackingModal.jsx';
import ChequesTable from './ChequesTable.jsx';
import ChequeSummaryCards from './ChequeSummaryCards.jsx';
import ChequeCsvExportButton from './ChequeCsvExportButton.jsx';
import { ChequeScanButton, ChequeScanModal } from './scan/index.js';
import { useDemo } from '../../demo/index.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';

const DIRECTION_FILTERS = [
  { value: 'all', label: t('همه') },
  { value: 'received', label: t('دریافتی') },
  { value: 'issued', label: t('صادره') },
];

const STATE_FILTERS = [
  { value: 'open', label: t('در جریان'), match: isChequeOpen },
  { value: 'bounced', label: t('برگشتی'), match: (c) => c.status === 'bounced' },
  { value: 'done', label: t('تسویه‌شده'), match: (c) => !isChequeOpen(c) && c.status !== 'bounced' },
  { value: 'all', label: t('همه'), match: () => true },
];

const HEADER = {
  icon: <ReceiptText size={24} />,
  title: t('چک‌ها'),
  help: 'cheques',
  subtitle: t('چک‌های دریافتی و صادره، سررسیدها و پیگیری وضعیت'),
};

export default function ChequesPage() {
  const { readOnly } = useDemo();
  const {
    cheques,
    vaultLocked,
    loadingCheques,
    submitting,
    deletingId,
    error,
    clearError,
    fetchCheques,
    saveCheque,
    changeStatus,
    restoreCheque,
    deleteCheque,
  } = useChequesContext();
  const hideValues = usePrivacyMode();
  const { confirm, toast } = useFeedback();
  const [clearingId, setClearingId] = useState(null);

  const [directionFilter, setDirectionFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [formState, setFormState] = useState(null); // null | { cheque: object|null, initialValues?: object, confidence?: object }
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [trackingId, setTrackingId] = useState(null);
  // The app's "+" button: /cheques?add=cheque
  useQuickAddParam('cheque', () => setFormState({ cheque: null }), !vaultLocked && !readOnly);

  const summary = useMemo(() => summarizeCheques(cheques, todayIso()), [cheques]);
  const trackingCheque = cheques.find((c) => c.id === trackingId) || null;

  const visibleCheques = useMemo(() => {
    const stateMatch = STATE_FILTERS.find((f) => f.value === stateFilter)?.match || (() => true);
    const q = toEnglishDigits(searchQuery.trim().toLowerCase());
    const list = cheques.filter((c) =>
      (directionFilter === 'all' || c.direction === directionFilter) &&
      stateMatch(c) &&
      (!q || [c.counterparty, c.notes, c.chequeNumber, c.sayadId, c.bankName, getStatusDisplay(c.status).label]
        .some((field) => String(field || '').toLowerCase().includes(q)))
    );
    // Open cheques: nearest due first; settled ones: most recent first
    return stateFilter === 'open' ? list.sort(compareChequesByDue) : list.sort((a, b) => compareChequesByDue(b, a));
  }, [cheques, directionFilter, stateFilter, searchQuery]);

  const countFor = (filter) => cheques.filter((c) =>
    (directionFilter === 'all' || c.direction === directionFilter) && filter.match(c)).length;

  const openEdit = (cheque) => {
    setTrackingId(null);
    setFormState({ cheque });
  };

  // One tap: mark an open cheque cleared today, with an undo in the toast
  const handleQuickClear = async (cheque) => {
    setClearingId(cheque.id);
    try {
      await changeStatus(cheque, 'cleared', todayIso(), '');
      toast.success(t('چک «{name}» پاس شد.', { name: cheque.counterparty }), {
        duration: 7000,
        action: {
          label: t('بازگردانی'),
          onClick: () => restoreCheque(cheque).catch((err) => toast.error(err.message || t('بازگردانی ناموفق بود.'))),
        },
      });
    } catch (err) {
      toast.error(err.message || t('ثبت پاس شدن چک ناموفق بود.'));
    } finally {
      setClearingId(null);
    }
  };

  const handleDelete = async (cheque) => {
    const ok = await confirm({
      title: t('حذف چک'),
      message: t('چک {kind} «{name}» و سوابق پیگیری آن حذف شود؟', { kind: getDirectionDisplay(cheque.direction).label, name: cheque.counterparty }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCheque(cheque.id);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title={t('چک‌های شما رمزنگاری شده‌اند')} />
      </div>
    );
  }

  const hasCheques = cheques.length > 0;

  return (
    <div className="incomes-page-container cheques-page">
      <FeaturePageHeader
        {...HEADER}
        actions={
          <>
            <ChequeScanButton
              onClick={() => setScanModalOpen(true)}
              disabled={readOnly}
            />
            <ChequeCsvExportButton cheques={cheques} disabled={!hasCheques} />
            <Button
              icon={<Plus size={16} />}
              onClick={() => setFormState({ cheque: null })}
              disabled={readOnly}
              title={readOnly ? t('در نسخه دمو غیرفعال است') : undefined}
            >
              {t('ثبت چک')}
            </Button>
          </>
        }
      />

      {error && hasCheques && <AlertBanner type="error" message={error} onClose={clearError} />}

      {error && !hasCheques ? (
        <AlertBanner
          type="error"
          message={error}
          action={
            <Button size="sm" variant="secondary" onClick={fetchCheques}>
              {t('تلاش مجدد')}
            </Button>
          }
        />
      ) : (
        <SplitPageLayout sidebar={<ChequeSummaryCards summary={summary} hideValues={hideValues} />}>
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>{t('لیست چک‌ها')}</h3>
                </div>
              </div>
              {hasCheques && (
                <SearchBar
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('جستجو در نام، شماره، شناسه صیادی یا یادداشت...')}
                  badge={t('{n} مورد', { n: visibleCheques.length.toLocaleString(intlLocale()) })}
                  className="incomes-search"
                />
              )}
            </div>

            <div className="table-card-body">
              {hasCheques && (
                <div className="cheque-filters">
                  <div className="tx-filter-pills-bar" role="group" aria-label={t('نوع چک')}>
                    {DIRECTION_FILTERS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`tx-filter-pill ${directionFilter === opt.value ? 'active' : ''}`}
                        aria-pressed={directionFilter === opt.value}
                        onClick={() => setDirectionFilter(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="tx-filter-pills-bar" role="group" aria-label={t('وضعیت')}>
                    {STATE_FILTERS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`tx-filter-pill ${stateFilter === opt.value ? 'active' : ''}`}
                        aria-pressed={stateFilter === opt.value}
                        onClick={() => setStateFilter(opt.value)}
                      >
                        {opt.label}
                        <span className="cheque-filter-count">{countFor(opt).toLocaleString(intlLocale())}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loadingCheques && !hasCheques ? (
                <SkeletonRows rows={5} columns={4} label={t('در حال دریافت لیست چک‌ها')} />
              ) : !hasCheques ? (
                <EmptyState
                  icon={<ReceiptText size={44} strokeWidth={1.5} />}
                  title={t('هنوز چکی ثبت نشده است')}
                  description={t('چک‌های دریافتی و صادره را ثبت کنید تا سررسیدشان یادآوری شود و وضعیتشان را پیگیری کنید.')}
                  action={
                    <Button icon={<Plus size={16} />} onClick={() => setFormState({ cheque: null })}>
                      {t('ثبت اولین چک')}
                    </Button>
                  }
                />
              ) : visibleCheques.length === 0 ? (
                <EmptyState
                  title={t('موردی یافت نشد')}
                  description={searchQuery ? t('هیچ چکی با عبارت جستجو شده مطابقت ندارد.') : t('در این دسته چکی وجود ندارد.')}
                />
              ) : (
                <ChequesTable
                  cheques={visibleCheques}
                  onTrack={(cheque) => setTrackingId(cheque.id)}
                  onClear={handleQuickClear}
                  clearingId={clearingId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  hideValues={hideValues}
                  readOnly={readOnly}
                />
              )}
            </div>
          </div>
        </SplitPageLayout>
      )}

      {formState && (
        <ChequeForm
          key={formState.cheque?.id || (formState.initialValues ? 'scan-prefilled' : 'new')}
          onClose={() => setFormState(null)}
          onSubmit={(data) => saveCheque(data, formState.cheque?.id)}
          editingCheque={formState.cheque}
          initialValues={formState.initialValues}
          confidence={formState.confidence}
          submitting={submitting}
        />
      )}

      {scanModalOpen && (
        <ChequeScanModal
          isOpen={scanModalOpen}
          onClose={() => setScanModalOpen(false)}
          onFillForm={(fields, confidence) => {
            setScanModalOpen(false);
            setFormState({
              cheque: null,
              initialValues: fields,
              confidence,
            });
          }}
        />
      )}

      {trackingCheque && (
        <ChequeTrackingModal
          key={trackingCheque.id}
          cheque={trackingCheque}
          onClose={() => setTrackingId(null)}
          onChangeStatus={changeStatus}
          onEdit={openEdit}
          submitting={submitting}
          hideValues={hideValues}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
