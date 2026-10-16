/**
 * GoalsPage.jsx — The user's savings goals («اهداف»): what they save for and how far each is
 *
 * - Headline figures: everything saved against all the targets, the goals reached, the nearest
 *   goal with a day
 * - The list, goals with the nearest day first and reached ones last; a card shows what is saved
 *   (deposits at today's rates, plus the portfolio assets reserved for it at today's prices), the bar,
 *   what is left and the monthly amount a date asks for or the estimate from the deposits' pace
 *   (utils/goalDocument.js goalProgress)
 * - «واریز» sets money aside for a goal (in any currency, or takes some back) or reserves a quantity
 *   or percent of a portfolio's asset for it; nothing is recorded as an expense, sale or purchase
 * Everything is decrypted and worked out in the browser.
 */

import React, { useMemo, useState } from 'react';
import { Target, Plus } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { AlertBanner, Button, EmptyState, FeaturePageHeader, SplitPageLayout } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { useDemo } from '../../demo/index.js';
import { compareGoals, goalTotals } from '../../../utils/goalDocument.js';
import { useGoals } from '../hooks/useGoals.js';
import { useGoalProgress } from '../hooks/useGoalProgress.js';
import GoalForm from './GoalForm.jsx';
import GoalContributionForm from './GoalContributionForm.jsx';
import GoalCard from './GoalCard.jsx';
import GoalSummary from './GoalSummary.jsx';

const HEADER = {
  icon: <Target size={24} />,
  title: t('اهداف'),
  help: 'goals',
  subtitle: t('برای چیزهای بزرگ پس‌انداز کنید و پیشرفتتان را ببینید'),
};

export default function GoalsPage() {
  const { readOnly } = useDemo();
  const hideValues = usePrivacyMode();
  const { confirm, toast } = useFeedback();
  const { goals, vaultLocked, loading, submitting, error, clearError, fetchGoals, saveGoal, deleteGoal } = useGoals();
  const { progressOf, resolved, assets } = useGoalProgress(goals, { enabled: !vaultLocked, withPortfolios: true });
  const [formState, setFormState] = useState(null);
  const [depositing, setDepositing] = useState(null);

  const rows = useMemo(
    () => [...goals].sort(compareGoals(progressOf)).map((goal) => ({ goal, progress: progressOf(goal) })),
    [goals, progressOf],
  );
  const totals = useMemo(() => goalTotals(goals, progressOf), [goals, progressOf]);
  const nearest = rows.find((r) => !r.progress.reached && r.progress.daysLeft !== null && r.progress.daysLeft >= 0) || null;

  const openNew = () => setFormState({ goal: null });
  // The app's "+" button: /goals?add=goal
  useQuickAddParam('goal', openNew, !vaultLocked && !readOnly);

  const handleContribution = ({ deposit, allocation }) => saveGoal({
    deposits: deposit ? [...depositing.deposits, deposit] : depositing.deposits,
    allocations: allocation ? [...(depositing.allocations || []), allocation] : depositing.allocations || [],
  }, depositing);

  const handleDelete = async (goal) => {
    const ok = await confirm({
      title: t('حذف هدف'),
      message: t('«{name}» با همه‌ی واریزهایش حذف شود؟', { name: goal.name }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGoal(goal.id);
    } catch (err) {
      toast.error(err.message || t('حذف هدف ممکن نشد.'));
    }
  };

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title={t('اهداف شما رمزنگاری شده‌اند')} />
      </div>
    );
  }

  const hasAny = goals.length > 0;
  return (
    <div className="incomes-page-container goals-page">
      <FeaturePageHeader
        {...HEADER}
        actions={(
          <Button icon={<Plus size={16} />} onClick={openNew} disabled={readOnly} title={readOnly ? t('در نسخه دمو غیرفعال است') : undefined}>
            {t('هدف جدید')}
          </Button>
        )}
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={!hasAny && <Button size="sm" variant="secondary" onClick={fetchGoals}>{t('تلاش مجدد')}</Button>}
        />
      )}

      <SplitPageLayout sidebar={hasAny ? <GoalSummary totals={totals} nearest={nearest} hideValues={hideValues} /> : null}>
        <div className="portfolio-table-card">
          <div className="portfolio-table-header">
            <div className="table-title">
              <div className="table-title-main">
                <h3>{t('لیست اهداف')}</h3>
              </div>
            </div>
          </div>
          <div className="table-card-body">
            {loading && !hasAny ? (
              <SkeletonRows rows={3} />
            ) : !hasAny ? (
              <EmptyState
                icon={<Target size={38} strokeWidth={1.5} />}
                title={t('هنوز هدفی ثبت نکرده‌اید')}
                description={t('پیش‌پرداخت خانه، سفر، خرید ماشین، اسپرسوساز… را با مبلغ هدف (به تومان یا دلار) اضافه کنید، پول کنار بگذارید یا بخشی از دارایی‌های پورتفو را به آن اختصاص دهید تا پیشرفت را ببینید.')}
                action={!readOnly && <Button icon={<Plus size={16} />} onClick={openNew}>{t('هدف جدید')}</Button>}
              />
            ) : (
              <ul className="row-card-list">
                {rows.map(({ goal, progress }) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    progress={progress}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    onDeposit={setDepositing}
                    onEdit={(g) => setFormState({ goal: g })}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </SplitPageLayout>

      {formState && (
        <GoalForm
          goal={formState.goal}
          onSubmit={(input) => saveGoal(input, formState.goal)}
          onClose={() => setFormState(null)}
          submitting={submitting}
        />
      )}
      {depositing && (
        <GoalContributionForm
          goal={depositing}
          assets={assets}
          leftOf={resolved.leftOf}
          onSubmit={handleContribution}
          onClose={() => setDepositing(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}
