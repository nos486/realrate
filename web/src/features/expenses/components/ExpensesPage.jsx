/**
 * ExpensesPage.jsx — Expense sections (a project, a trip, ...) and the expenses recorded in them
 *
 * - Sections as a row of chips on top (the selected one is in the URL: /expenses/:groupId)
 * - The selected section: its totals (everything in tomans, and per currency as recorded) and
 *   its expenses, in tomans or dollars, newest first
 * - Everything is end-to-end encrypted (vault records); admin-only while in beta (`expenses`)
 *
 * The data model already leaves room for what comes next — daily expenses with categories and
 * expenses read from bank SMS (see utils/expenseDocument.js).
 */

import React, { useMemo, useState } from 'react';
import { HandCoins, Plus, FolderKanban, Pencil, Trash2 } from 'lucide-react';
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
import { summarizeExpenses } from '../../../utils/expenseDocument.js';
import { usePricing } from '../../market/index.js';
import { useDemo } from '../../demo/index.js';
import { useExpenses } from '../hooks/useExpenses.js';
import { formatAmount } from '../utils/format.js';
import ExpenseGroupForm from './ExpenseGroupForm.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import ExpensesTable from './ExpensesTable.jsx';
import ExpenseSummaryCards from './ExpenseSummaryCards.jsx';

const HEADER = {
  icon: <HandCoins size={24} />,
  title: 'هزینه‌ها',
  subtitle: 'بخش‌های هزینه (پروژه، سفر، ...) با ثبت هزینه به تومان یا دلار',
};

export default function ExpensesPage({ groupId = null, onSelectGroup }) {
  const { readOnly } = useDemo();
  const {
    groups, expenses, vaultLocked, loading, submitting, deletingId, error, clearError, fetchAll,
    saveGroup, deleteGroup, saveExpense, deleteExpense,
  } = useExpenses();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || Number(pricing?.summary?.usdToman) || 0;
  const hideValues = usePrivacyMode();
  const { confirm } = useFeedback();
  const [groupForm, setGroupForm] = useState(null); // null | { group: object|null }
  const [expenseForm, setExpenseForm] = useState(null); // null | { expense: object|null }
  const [searchQuery, setSearchQuery] = useState('');

  // The section in the URL, or the most recent one
  const selected = groups.find((g) => g.id === groupId) || groups[groups.length - 1] || null;

  const totalsByGroup = useMemo(() => {
    const byGroup = new Map(groups.map((g) => [g.id, []]));
    for (const e of expenses) byGroup.get(e.groupId)?.push(e);
    return new Map([...byGroup].map(([id, list]) => [id, { list, summary: summarizeExpenses(list, { usdToman }) }]));
  }, [groups, expenses, usdToman]);

  const selectedData = selected ? totalsByGroup.get(selected.id) : null;
  const visibleExpenses = useMemo(() => {
    const list = selectedData?.list || [];
    const q = toEnglishDigits(searchQuery.trim().toLowerCase());
    if (!q) return list;
    return list.filter((e) => [e.title, e.notes].some((f) => String(f || '').toLowerCase().includes(q)));
  }, [selectedData, searchQuery]);

  const handleSaveGroup = async (input) => {
    const group = await saveGroup(input, groupForm?.group || null);
    if (!groupForm?.group) onSelectGroup?.(group.id);
  };

  const handleDeleteGroup = async (group) => {
    const count = totalsByGroup.get(group.id)?.summary.count || 0;
    const ok = await confirm({
      title: 'حذف بخش',
      message: count
        ? `بخش «${group.name}» و ${count.toLocaleString('fa-IR')} هزینه ثبت‌شده در آن حذف شود؟`
        : `بخش «${group.name}» حذف شود؟`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGroup(group.id);
      onSelectGroup?.(null);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  const handleDeleteExpense = async (expense) => {
    const ok = await confirm({
      title: 'حذف هزینه',
      message: `هزینه «${expense.title}» حذف شود؟`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteExpense(expense.id);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="هزینه‌های شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  const disabledTitle = readOnly ? 'در نسخه دمو غیرفعال است' : undefined;

  return (
    <div className="incomes-page-container expenses-page">
      <FeaturePageHeader
        {...HEADER}
        actions={
          <Button
            variant="secondary"
            icon={<FolderKanban size={16} />}
            onClick={() => setGroupForm({ group: null })}
            disabled={readOnly}
            title={disabledTitle}
          >
            بخش جدید
          </Button>
        }
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={groups.length === 0 ? <Button size="sm" variant="secondary" onClick={fetchAll}>تلاش مجدد</Button> : null}
        />
      )}

      {loading && groups.length === 0 ? (
        <SkeletonRows rows={4} columns={3} label="در حال دریافت هزینه‌ها" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={44} strokeWidth={1.5} />}
          title="هنوز بخشی نساخته‌اید"
          description="برای هر پروژه یا کاری که هزینه دارد یک بخش بسازید و هزینه‌هایش را به تومان یا دلار زیر آن ثبت کنید."
          action={!readOnly && (
            <Button icon={<Plus size={16} />} onClick={() => setGroupForm({ group: null })}>ساخت اولین بخش</Button>
          )}
        />
      ) : (
        <>
          <nav className="expense-group-switcher" aria-label="بخش‌های هزینه">
            {groups.map((g) => {
              const s = totalsByGroup.get(g.id)?.summary;
              const active = g.id === selected?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`expense-group-chip ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onSelectGroup?.(g.id)}
                >
                  <span className="expense-group-chip-name">{g.name}</span>
                  <span className="expense-group-chip-total">
                    {hideValues ? '****' : formatAmount(s?.totalToman || 0)} تومان
                  </span>
                </button>
              );
            })}
          </nav>

          {selected && (
            <SplitPageLayout sidebar={<ExpenseSummaryCards summary={selectedData.summary} hideValues={hideValues} />}>
              <div className="portfolio-table-card">
                <div className="portfolio-table-header">
                  <div className="table-title">
                    <div className="table-title-main">
                      <h3>{selected.name}</h3>
                      {!readOnly && (
                        <div className="row-actions-group expense-group-actions">
                          <button type="button" className="btn-table-action edit" title="ویرایش بخش" onClick={() => setGroupForm({ group: selected })}>
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className={`btn-table-action delete ${deletingId === selected.id ? 'loading' : ''}`}
                            title="حذف بخش"
                            onClick={() => handleDeleteGroup(selected)}
                            disabled={deletingId === selected.id}
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                    {selected.notes && <p className="expense-group-notes">{selected.notes}</p>}
                  </div>
                  <div className="expense-table-tools">
                    {selectedData.list.length > 0 && (
                      <SearchBar
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="جستجو در عنوان یا یادداشت..."
                        badge={`${visibleExpenses.length.toLocaleString('fa-IR')} مورد`}
                        className="incomes-search"
                      />
                    )}
                    <Button
                      icon={<Plus size={16} />}
                      onClick={() => setExpenseForm({ expense: null })}
                      disabled={readOnly}
                      title={disabledTitle}
                    >
                      ثبت هزینه
                    </Button>
                  </div>
                </div>

                <div className="table-card-body">
                  {selectedData.list.length === 0 ? (
                    <EmptyState
                      icon={<HandCoins size={40} strokeWidth={1.5} />}
                      title="هزینه‌ای در این بخش ثبت نشده"
                      description="اولین هزینه را با عنوان، مبلغ (تومان یا دلار) و تاریخش ثبت کنید."
                    />
                  ) : visibleExpenses.length === 0 ? (
                    <EmptyState title="موردی یافت نشد" description="هیچ هزینه‌ای با عبارت جستجو شده مطابقت ندارد." />
                  ) : (
                    <ExpensesTable
                      expenses={visibleExpenses}
                      usdToman={usdToman}
                      onEdit={(expense) => setExpenseForm({ expense })}
                      onDelete={handleDeleteExpense}
                      deletingId={deletingId}
                      hideValues={hideValues}
                      readOnly={readOnly}
                    />
                  )}
                </div>
              </div>
            </SplitPageLayout>
          )}
        </>
      )}

      {groupForm && (
        <ExpenseGroupForm
          key={groupForm.group?.id || 'new'}
          group={groupForm.group}
          onSubmit={handleSaveGroup}
          onClose={() => setGroupForm(null)}
          submitting={submitting}
        />
      )}
      {expenseForm && selected && (
        <ExpenseForm
          key={expenseForm.expense?.id || 'new'}
          group={selected}
          expense={expenseForm.expense}
          usdToman={usdToman}
          onSubmit={(input) => saveExpense(input, expenseForm.expense)}
          onClose={() => setExpenseForm(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}
