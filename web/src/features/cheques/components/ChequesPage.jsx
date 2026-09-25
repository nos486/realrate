/**
 * ChequesPage.jsx — Received and issued cheques: due dates and tracking
 *
 * - Register / edit / delete cheques (direction, amount, due date, counterparty, bank, number,
 *   Sayad ID, notes)
 * - Tracking: every status change or follow-up note is logged with its date
 * - Summary (open receivables / payables, nearest due date, bounced) and due reminders
 * - Filters by direction and state, and search
 */

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

const DIRECTION_FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'received', label: 'دریافتی' },
  { value: 'issued', label: 'صادره' },
];

const STATE_FILTERS = [
  { value: 'open', label: 'در جریان', match: isChequeOpen },
  { value: 'bounced', label: 'برگشتی', match: (c) => c.status === 'bounced' },
  { value: 'done', label: 'تسویه‌شده', match: (c) => !isChequeOpen(c) && c.status !== 'bounced' },
  { value: 'all', label: 'همه', match: () => true },
];

const HEADER = {
  icon: <ReceiptText size={24} />,
  title: 'چک‌ها',
  subtitle: 'چک‌های دریافتی و صادره، سررسیدها و پیگیری وضعیت',
};

export default function ChequesPage() {
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
  const [formState, setFormState] = useState(null); // null | { cheque: object|null }
  const [trackingId, setTrackingId] = useState(null);

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
      toast.success(`چک «${cheque.counterparty}» پاس شد.`, {
        duration: 7000,
        action: {
          label: 'بازگردانی',
          onClick: () => restoreCheque(cheque).catch((err) => toast.error(err.message || 'بازگردانی ناموفق بود.')),
        },
      });
    } catch (err) {
      toast.error(err.message || 'ثبت پاس شدن چک ناموفق بود.');
    } finally {
      setClearingId(null);
    }
  };

  const handleDelete = async (cheque) => {
    const ok = await confirm({
      title: 'حذف چک',
      message: `چک ${getDirectionDisplay(cheque.direction).label} «${cheque.counterparty}» و سوابق پیگیری آن حذف شود؟`,
      confirmLabel: 'حذف',
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
        <VaultUnlockCard title="چک‌های شما رمزنگاری شده‌اند" />
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
            <ChequeCsvExportButton cheques={cheques} disabled={!hasCheques} />
            <Button icon={<Plus size={16} />} onClick={() => setFormState({ cheque: null })}>
              ثبت چک
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
              تلاش مجدد
            </Button>
          }
        />
      ) : (
        <SplitPageLayout sidebar={<ChequeSummaryCards summary={summary} hideValues={hideValues} />}>
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>لیست چک‌ها</h3>
                </div>
              </div>
              {hasCheques && (
                <SearchBar
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در نام، شماره، شناسه صیادی یا یادداشت..."
                  badge={`${visibleCheques.length.toLocaleString('fa-IR')} مورد`}
                  className="incomes-search"
                />
              )}
            </div>

            <div className="table-card-body">
              {hasCheques && (
                <div className="cheque-filters">
                  <div className="tx-filter-pills-bar" role="group" aria-label="نوع چک">
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
                  <div className="tx-filter-pills-bar" role="group" aria-label="وضعیت">
                    {STATE_FILTERS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`tx-filter-pill ${stateFilter === opt.value ? 'active' : ''}`}
                        aria-pressed={stateFilter === opt.value}
                        onClick={() => setStateFilter(opt.value)}
                      >
                        {opt.label}
                        <span className="cheque-filter-count">{countFor(opt).toLocaleString('fa-IR')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loadingCheques && !hasCheques ? (
                <SkeletonRows rows={5} columns={4} label="در حال دریافت لیست چک‌ها" />
              ) : !hasCheques ? (
                <EmptyState
                  icon={<ReceiptText size={44} strokeWidth={1.5} />}
                  title="هنوز چکی ثبت نشده است"
                  description="چک‌های دریافتی و صادره را ثبت کنید تا سررسیدشان یادآوری شود و وضعیتشان را پیگیری کنید."
                  action={
                    <Button icon={<Plus size={16} />} onClick={() => setFormState({ cheque: null })}>
                      ثبت اولین چک
                    </Button>
                  }
                />
              ) : visibleCheques.length === 0 ? (
                <EmptyState
                  title="موردی یافت نشد"
                  description={searchQuery ? 'هیچ چکی با عبارت جستجو شده مطابقت ندارد.' : 'در این دسته چکی وجود ندارد.'}
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
                />
              )}
            </div>
          </div>
        </SplitPageLayout>
      )}

      {formState && (
        <ChequeForm
          key={formState.cheque?.id || 'new'}
          onClose={() => setFormState(null)}
          onSubmit={(data) => saveCheque(data, formState.cheque?.id)}
          editingCheque={formState.cheque}
          submitting={submitting}
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
        />
      )}
    </div>
  );
}
