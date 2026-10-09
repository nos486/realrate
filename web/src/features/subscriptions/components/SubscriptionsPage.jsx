/**
 * SubscriptionsPage.jsx — The user's subscriptions («اشتراک‌ها»): what each costs and when it renews
 *
 * - Headline figures: the monthly total (every running subscription as a monthly equivalent, dollar
 *   ones in tomans at today's rate, with their dollar part), a year of it, what renews this Shamsi
 *   month, and the nearest renewal
 * - The monthly total by category
 * - The list, soonest renewal first; a card says when it renews (or that it ran out), and offers
 *   «ثبت پرداخت»: an everyday expense in «اینترنت و اشتراک‌ها», in the subscription's currency,
 *   naming it — a subscription renewed by hand then runs a cycle longer (renewedAfter)
 * - Pause / resume, cancel, edit and delete; cancelled ones are hidden unless shown
 * The figures come from utils/subscriptionDocument.js; renewal reminders are the alert center's,
 * the Android notifications' and the email digest's (shared/alerts, domain/reminders.js).
 */

import React, { useMemo, useState } from 'react';
import { CalendarSync, Plus, Eye, EyeOff } from 'lucide-react';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { AlertBanner, Button, EmptyState, FeaturePageHeader, SplitPageLayout } from '../../../shared/ui/index.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { ensureDailyGroup, getExpenseGroups, saveExpense } from '../../../shared/vault/vaultExpenses.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { shamsiMonthOf, shamsiMonthRange, formatShamsiMonth } from '../../../shared/flow/flowYear.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { useDemo } from '../../demo/index.js';
import { usePricing } from '../../market/index.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import ExpenseForm from '../../expenses/components/ExpenseForm.jsx';
import {
  SUBSCRIPTION_EXPENSE_CATEGORY, compareSubscriptions, renewedAfter, subscriptionCategoryOf,
  subscriptionTotals, subscriptionView,
} from '../../../utils/subscriptionDocument.js';
import { useSubscriptionsContext } from '../context/SubscriptionsContext.jsx';
import SubscriptionForm from './SubscriptionForm.jsx';
import SubscriptionCard from './SubscriptionCard.jsx';
import SubscriptionSummary from './SubscriptionSummary.jsx';
import { subscriptionIcon } from '../constants/subscriptionDisplay.js';

const HEADER = {
  icon: <CalendarSync size={24} />,
  title: 'اشتراک‌ها',
  subtitle: 'هزینه‌ی ماهانه و یادآوری قبل از هر تمدید',
};

const fa = (n) => Number(n).toLocaleString('fa-IR');

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
  const [formState, setFormState] = useState(null);
  const [paying, setPaying] = useState(null); // { sub, view }
  const [showInactive, setShowInactive] = useState(false);

  const today = todayIso();
  const month = useMemo(() => shamsiMonthOf(today), [today]);
  const monthLabel = formatShamsiMonth(month.jy, month.jm);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const totals = useMemo(() => {
    const { from, to } = shamsiMonthRange(month.jy, month.jm);
    return subscriptionTotals(subscriptions, { today, usdToman, monthFrom: from, monthTo: to });
  }, [subscriptions, today, usdToman, month]);

  const rows = useMemo(
    () => [...subscriptions].sort(compareSubscriptions(today)).map((sub) => ({ sub, view: subscriptionView(sub, today) })),
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

  const handleSave = (input) => saveSubscription(input, formState?.subscription || null);

  const handleStatus = async (sub, status) => {
    if (status === 'cancelled') {
      const ok = await confirm({
        title: 'لغو اشتراک',
        message: `«${sub.name}» لغو شود؟ دیگر تمدیدی برایش حساب و یادآوری نمی‌شود؛ اگر تا پایان دوره فعال است، به‌جای لغو «پایان» را در ویرایش بگذارید.`,
        confirmLabel: 'لغو اشتراک',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await saveSubscription({ status, cancelledOn: status === 'cancelled' ? today : '' }, sub);
    } catch (err) {
      toast.error(err.message || 'ذخیره‌ی اشتراک ممکن نشد.');
    }
  };

  const handleDelete = async (sub) => {
    const ok = await confirm({
      title: 'حذف اشتراک',
      message: `«${sub.name}» حذف شود؟ پرداخت‌هایی که برایش ثبت کرده‌اید در هزینه‌ها می‌مانند.`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSubscription(sub.id);
    } catch (err) {
      toast.error(err.message || 'حذف اشتراک ممکن نشد.');
    }
  };

  // «ثبت پرداخت»: an everyday expense naming the subscription, then the subscription moves on
  const handlePay = async (input) => {
    const sub = paying.sub;
    const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
    await saveExpense({ ...input, groupId: group.id, subscriptionId: sub.id });
    await saveSubscription(renewedAfter(sub, input.date), sub);
    toast.success(sub.autoRenew ? 'پرداخت ثبت شد.' : 'پرداخت ثبت شد و اعتبار اشتراک یک دوره تمدید شد.');
  };

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="اشتراک‌های شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  const hasAny = subscriptions.length > 0;
  const sidebar = (
    <>
      <SubscriptionSummary totals={totals} monthLabel={monthLabel} nearest={nearest} usdMissing={!usdToman} hideValues={hideValues} />
      {donutItems.length > 0 && <DonutChart title="ماهانه به تفکیک دسته" items={donutItems} centerLabel="جمع ماهانه" masked={hideValues} />}
    </>
  );

  return (
    <div className="incomes-page-container subscriptions-page">
      <FeaturePageHeader
        {...HEADER}
        actions={(
          <Button icon={<Plus size={16} />} onClick={openNew} disabled={readOnly} title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}>
            اشتراک جدید
          </Button>
        )}
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={!hasAny && <Button size="sm" variant="secondary" onClick={fetchSubscriptions}>تلاش مجدد</Button>}
        />
      )}

      <SplitPageLayout sidebar={sidebar}>
        <div className="portfolio-table-card">
          <div className="portfolio-table-header">
            <div className="table-title">
              <div className="table-title-main">
                <h3>لیست اشتراک‌ها</h3>
              </div>
            </div>
            {inactive.length > 0 && (
              <Button size="sm" variant="ghost" icon={showInactive ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => setShowInactive((v) => !v)}>
                {showInactive ? 'پنهان کردن لغوشده‌ها' : `لغوشده و پایان‌یافته (${fa(inactive.length)})`}
              </Button>
            )}
          </div>
          <div className="table-card-body">
            {loading && !hasAny ? (
              <SkeletonRows rows={4} />
            ) : !hasAny ? (
              <EmptyState
                icon={<CalendarSync size={38} strokeWidth={1.5} />}
                title="هنوز اشتراکی ثبت نکرده‌اید"
                description="نتفلیکس، ChatGPT، فیلیمو، اینترنت، باشگاه… را اضافه کنید تا جمع ماهانه را ببینید و قبل از هر تمدید یادآوری بگیرید."
                action={!readOnly && <Button icon={<Plus size={16} />} onClick={openNew}>اشتراک جدید</Button>}
              />
            ) : listed.length === 0 ? (
              <EmptyState title="اشتراک فعالی ندارید" description="اشتراک‌های لغوشده و پایان‌یافته پنهان هستند." />
            ) : (
              <ul className="sub-list">
                {listed.map(({ sub, view }) => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    view={view}
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
