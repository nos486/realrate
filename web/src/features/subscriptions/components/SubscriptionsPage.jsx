/**
 * SubscriptionsPage.jsx — The user's subscriptions («اشتراک‌ها»): what each costs and when it renews
 *
 * - Headline figures: the monthly total (every running subscription as a monthly equivalent, dollar
 *   ones in tomans at today's rate, with their dollar part), a year of it, what renews this Shamsi
 *   month, and the nearest renewal
 * - The monthly total by category
 * - The list, soonest renewal first; a card says when it renews (or that it ran out), and offers
 *   «ثبت پرداخت»: an everyday expense in «اینترنت و اشتراک‌ها», in the subscription's currency,
 *   naming it — a subscription renewed by hand then runs a cycle longer (renewedAfter, through
 *   shared/vault/recordLinks.js). Every subscription's own payments are recorded in the expenses
 *   as it is saved and as its renewals come (useSubscriptions)
 * - Pause / resume, cancel, edit and delete; cancelled ones are hidden unless shown
 * The figures come from utils/subscriptionDocument.js; renewal reminders are the alert center's,
 * the Android notifications' and the email digest's (shared/alerts, domain/reminders.js).
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { CalendarSync, Plus, Eye, EyeOff } from 'lucide-react';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { AlertBanner, Button, EmptyState, FeaturePageHeader, SplitPageLayout } from '../../../shared/ui/index.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { saveExpense } from '../../../shared/vault/vaultExpenses.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { salaryMonthRange, currentSalaryMonth, formatShamsiMonth } from '../../../shared/flow/flowYear.js';
import { useSalaryMonths } from '../../../shared/salary/useSalaryMonths.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { useDemo } from '../../demo/index.js';
import { usePricing } from '../../market/index.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import ExpenseForm from '../../expenses/components/ExpenseForm.jsx';
import {
  SUBSCRIPTION_EXPENSE_CATEGORY, compareSubscriptions, subscriptionCategoryOf,
  subscriptionPeriod, subscriptionTotals, subscriptionView,
} from '../../../utils/subscriptionDocument.js';
import { useSubscriptionsContext } from '../context/SubscriptionsContext.jsx';
import SubscriptionForm from './SubscriptionForm.jsx';
import SubscriptionCard from './SubscriptionCard.jsx';
import SubscriptionSummary from './SubscriptionSummary.jsx';
import { useFxRates } from '../../market/useFxRates.js';
import { subscriptionIcon } from '../constants/subscriptionDisplay.js';

const HEADER = {
  icon: <CalendarSync size={24} />,
  title: t('اشتراک‌ها'),
  help: 'subscriptions',
  subtitle: t('هزینه‌ی ماهانه و یادآوری قبل از هر تمدید'),
};

const fa = (n) => Number(n).toLocaleString(intlLocale());

export default function SubscriptionsPage() {
  const { readOnly } = useDemo();
  const hideValues = usePrivacyMode();
  const { confirm, toast } = useFeedback();
  const {
    subscriptions, vaultLocked, loading, submitting, error, clearError,
    fetchSubscriptions, saveSubscription, deleteSubscription,
  } = useSubscriptionsContext();
  const { accounts = [] } = useAccounts();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  // Today's rates of the other currencies (the price book's; no history needed)
  const fx = useFxRates(undefined, false);
  const [formState, setFormState] = useState(null);
  const [paying, setPaying] = useState(null); // { sub, view }
  const [showInactive, setShowInactive] = useState(false);

  const today = todayIso();
  // The month is the «ماه حقوقی» while the expenses show months so (useSalaryMonths)
  const salaryStarts = useSalaryMonths().activeStarts;
  const month = useMemo(() => currentSalaryMonth(today, salaryStarts), [today, salaryStarts]);
  const monthLabel = formatShamsiMonth(month.jy, month.jm);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const totals = useMemo(() => {
    const { from, to } = salaryMonthRange(month.jy, month.jm, salaryStarts);
    return subscriptionTotals(subscriptions, { today, usdToman, ...fx, monthFrom: from, monthTo: to });
  }, [subscriptions, today, usdToman, fx, month, salaryStarts]);

  const rows = useMemo(
    () => [...subscriptions].sort(compareSubscriptions(today)).map((sub) => ({ sub, view: subscriptionView(sub, today), period: subscriptionPeriod(sub, today) })),
    [subscriptions, today],
  );
  const inactive = rows.filter((r) => r.view.state === 'cancelled' || r.view.state === 'ended');
  const listed = showInactive ? rows : rows.filter((r) => !inactive.includes(r));
  const nearest = rows.find((r) => r.view.running && r.view.nextRenewal && r.view.daysLeft >= 0) || null;

  const donutItems = totals.byCategory.map((c) => {
    const meta = subscriptionCategoryOf(c.category);
    const Icon = subscriptionIcon(c.category);
    return { key: c.category, label: meta.label, value: c.toman, icon: <Icon size={12} /> };
  });

  const openNew = () => setFormState({ subscription: null });
  // The app's "+" button: /subscriptions?add=subscription
  useQuickAddParam('subscription', openNew, !vaultLocked && !readOnly);

  // Its payments go into the expenses as it is saved (useSubscriptions)
  const handleSave = (input) => saveSubscription(input, formState?.subscription || null);

  const handleStatus = async (sub, status) => {
    if (status === 'cancelled') {
      const ok = await confirm({
        title: t('لغو اشتراک'),
        message: t('«{name}» لغو شود؟ دیگر تمدیدی برایش حساب و یادآوری نمی‌شود؛ اگر تا پایان دوره فعال است، به‌جای لغو «پایان» را در ویرایش بگذارید.', { name: sub.name }),
        confirmLabel: t('لغو اشتراک'),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await saveSubscription({ status, cancelledOn: status === 'cancelled' ? today : '' }, sub);
    } catch (err) {
      toast.error(err.message || t('ذخیره‌ی اشتراک ممکن نشد.'));
    }
  };

  const handleDelete = async (sub) => {
    const ok = await confirm({
      title: t('حذف اشتراک'),
      message: t('«{name}» حذف شود؟ پرداخت‌هایی که برایش ثبت کرده‌اید در هزینه‌ها می‌مانند.', { name: sub.name }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSubscription(sub.id);
    } catch (err) {
      toast.error(err.message || t('حذف اشتراک ممکن نشد.'));
    }
  };

  // «ثبت پرداخت»: an everyday expense naming the subscription; saving it moves the subscription
  // on (shared/vault/recordLinks.js), as for a payment recorded from the expenses page
  const handlePay = async (input) => {
    const sub = paying.sub;
    // In the everyday expenses, or the project picked in the form (vaultExpenses.js)
    await saveExpense(input);
    const renews = !sub.autoRenew && input.subscriptionId === sub.id;
    toast.success(renews ? t('پرداخت ثبت شد و اعتبار اشتراک یک دوره تمدید شد.') : t('پرداخت ثبت شد.'));
  };

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title={t('اشتراک‌های شما رمزنگاری شده‌اند')} />
      </div>
    );
  }

  const hasAny = subscriptions.length > 0;
  const sidebar = (
    <>
      <SubscriptionSummary totals={totals} monthLabel={monthLabel} nearest={nearest} rates={{ usdToman, ...fx }} hideValues={hideValues} />
      {donutItems.length > 0 && <DonutChart title={t('ماهانه به تفکیک دسته')} items={donutItems} centerLabel={t('جمع ماهانه')} masked={hideValues} />}
    </>
  );

  return (
    <div className="incomes-page-container subscriptions-page">
      <FeaturePageHeader
        {...HEADER}
        actions={(
          <Button icon={<Plus size={16} />} onClick={openNew} disabled={readOnly} title={readOnly ? t('در نسخه دمو غیرفعال است') : undefined}>
            {t('اشتراک جدید')}
          </Button>
        )}
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={!hasAny && <Button size="sm" variant="secondary" onClick={fetchSubscriptions}>{t('تلاش مجدد')}</Button>}
        />
      )}

      <SplitPageLayout sidebar={sidebar}>
        <div className="portfolio-table-card">
          <div className="portfolio-table-header">
            <div className="table-title">
              <div className="table-title-main">
                <h3>{t('لیست اشتراک‌ها')}</h3>
              </div>
            </div>
            {inactive.length > 0 && (
              <Button size="sm" variant="ghost" icon={showInactive ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => setShowInactive((v) => !v)}>
                {showInactive ? t('پنهان کردن لغوشده‌ها') : t('لغوشده و پایان‌یافته ({n})', { n: fa(inactive.length) })}
              </Button>
            )}
          </div>
          <div className="table-card-body">
            {loading && !hasAny ? (
              <SkeletonRows rows={4} />
            ) : !hasAny ? (
              <EmptyState
                icon={<CalendarSync size={38} strokeWidth={1.5} />}
                title={t('هنوز اشتراکی ثبت نکرده‌اید')}
                description={t('نتفلیکس، ChatGPT، فیلیمو، اینترنت، باشگاه… را اضافه کنید تا جمع ماهانه را ببینید و قبل از هر تمدید یادآوری بگیرید.')}
                action={!readOnly && <Button icon={<Plus size={16} />} onClick={openNew}>{t('اشتراک جدید')}</Button>}
              />
            ) : listed.length === 0 ? (
              <EmptyState title={t('اشتراک فعالی ندارید')} description={t('اشتراک‌های لغوشده و پایان‌یافته پنهان هستند.')} />
            ) : (
              <ul className="row-card-list">
                {listed.map(({ sub, view, period }) => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    view={view}
                    period={period}
                    account={accountById.get(sub.accountId)}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    onPay={(s, v) => setPaying({ sub: s, view: v })}
                    onEdit={(s) => setFormState({ subscription: s })}
                    onStatus={handleStatus}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </SplitPageLayout>

      {formState && (
        <SubscriptionForm
          subscription={formState.subscription}
          accounts={accounts}
          onSubmit={handleSave}
          onClose={() => setFormState(null)}
          submitting={submitting}
        />
      )}

      {paying && (
        <ExpenseForm
          daily
          accounts={accounts}
          usdToman={usdToman}
          draft={{
            title: paying.sub.name,
            amount: paying.sub.amount,
            currency: paying.sub.currency,
            // The day it is paid: a late renewal of one renewed by hand starts its new period then
            date: today,
            category: SUBSCRIPTION_EXPENSE_CATEGORY,
            subscriptionId: paying.sub.id,
            accountId: paying.sub.accountId,
            notes: '',
          }}
          onSubmit={handlePay}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
