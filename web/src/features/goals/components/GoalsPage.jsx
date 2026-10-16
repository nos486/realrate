/**
 * GoalsPage.jsx — The user's savings goals («اهداف»): what they save for and how far each is
 *
 * - Headline figures: everything saved against all the targets, the goals reached, the nearest
 *   goal with a day
 * - The list, goals with the nearest day first and reached ones last; a card shows what is saved
 *   (deposits set aside by hand, plus the value of a linked portfolio at today's prices), the bar,
 *   what is left and the monthly amount a date asks for or the estimate from the deposits' pace
 *   (utils/goalDocument.js goalProgress)
 * - «واریز» sets money aside for a goal (or takes some back); nothing is recorded as an expense
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
import { todayIso } from '../../../shared/utils/dates.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { useDemo } from '../../demo/index.js';
import { compareGoals, goalProgress, goalTotals } from '../../../utils/goalDocument.js';
import { useGoals } from '../hooks/useGoals.js';
import { usePortfolioValues } from '../hooks/usePortfolioValues.js';
import GoalForm from './GoalForm.jsx';
import GoalDepositForm from './GoalDepositForm.jsx';
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
  const { portfolios, valueOf } = usePortfolioValues({ enabled: !vaultLocked });
  const [formState, setFormState] = useState(null);
  const [depositing, setDepositing] = useState(null);

  const today = todayIso();
  const progressOf = useMemo(() => (goal) => goalProgress(goal, { today, portfolioValue: valueOf(goal.portfolioId) }), [today, valueOf]);
  const rows = useMemo(
    () => [...goals].sort(compareGoals(progressOf)).map((goal) => ({ goal, progress: progressOf(goal) })),
    [goals, progressOf],
  );
  const totals = useMemo(() => goalTotals(goals, progressOf), [goals, progressOf]);
  const nearest = rows.find((r) => !r.progress.reached && r.progress.daysLeft !== null && r.progress.daysLeft >= 0) || null;

  const openNew = () => setFormState({ goal: null });
  // The app's "+" button: /goals?add=goal
  useQuickAddParam('goal', openNew, !vaultLocked && !readOnly);

  const handleDeposit = (deposit) => saveGoal({ deposits: [...depositing.deposits, deposit] }, depositing);

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
                description={t('پیش‌پرداخت خانه، سفر، خرید ماشین… را با مبلغ هدف اضافه کنید، واریزهایتان را ثبت کنید یا ارزش یک پورتفو را وصل کنید تا پیشرفت را ببینید.')}
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
          portfolios={portfolios}
          onSubmit={(input) => saveGoal(input, formState.goal)}
          onClose={() => setFormState(null)}
          submitting={submitting}
        />
      )}
      {depositing && (
        <GoalDepositForm goal={depositing} onSubmit={handleDeposit} onClose={() => setDepositing(null)} submitting={submitting} />
      )}
    </div>
  );
}
