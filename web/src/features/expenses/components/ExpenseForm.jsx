/**
 * ExpenseForm.jsx — Modal to record or edit an expense, in tomans or a foreign currency (dollar,
 * euro, lira, dirham: utils/currencies.js)
 *
 * Every expense has a category (what it was spent on) and a place: the everyday expenses, or a
 * project («پروژه», with `projects`: picked like the account). The project is not a category — an
 * expense in a project keeps its own category (materials, labour, ...), so a project is summed per
 * category too; choosing one only sets the section it is saved in (`groupId`: the project's id,
 * '' for the everyday expenses). Opened from a project (`group`) it starts in that project, from
 * the everyday list (`daily`) in none. The title is optional (the category's name when left
 * empty); an expense in a project may have no category («بدون دسته‌بندی»), and then needs one.
 * A foreign expense is tomans at its currency's rate on its day, from the price history — shown
 * here (DayRateHint), never typed or stored.
 * With `accounts`, the account it was paid from can be picked — only the accounts
 * that hold the expense's currency (accountsForCurrency; a new everyday expense starts from the
 * last one used). A new expense may start from a `draft` (a bank SMS:
 * amount, day, account, note, and its source). «تأمین از» says whether it was paid from the user's
 * own money or from a loan (loanFunding.js) — offered while there is a loan not yet settled.
 * «دنگ»: the amount was paid for others too — only «سهم من» counts as the user's expense, the rest
 * is owed back (what comes back is recorded on the expense, ReimbursementsModal.jsx, not as income).
 * A foreign expense is paid from an account holding its currency, or from that currency held in a
 * portfolio (and has no loan): it leaves that portfolio as a «spend» transaction at the expense's
 * rate (portfolioFunds.js), which is filled in from that day's price history.
 * An expense's category may link it to a record (utils/categoryLinks.js), picked right
 * under the category (CategoryLinkField): «سرمایه‌گذاری» the asset bought in a portfolio,
 * «پرداخت قسط» the loan installment paid, «اینترنت و اشتراک‌ها» the subscription (or a new one
 * made from the expense). A choice fills in what it knows (title, amount, currency, account);
 * what linking does to that record is the store's (shared/vault/recordLinks.js).
 * «پرداخت با چک»: a toman expense of any category (a project's too) may be paid with one of the
 * user's issued cheques (`chequeId`) — saving it clears the cheque.
 * Added to a portfolio («افزودن به پورتفو»: the asset and its quantity), an expense is a «buy»
 * there at its tomans (`investedIn`).
 *
 * Laid out as an entry form (shared/form/, the income form's too): the amount first (its currency
 * beside it, in words under it), the category as icon tiles (the last used first), the title, the
 * day («امروز»/«دیروز»/«روز دیگر»), «پرداخت با» — an account or cash, a cheque, or a loan, each
 * with its own picker row — the project, and what is rarely needed (دنگ, tags, the note) folded
 * under «جزئیات بیشتر». A new entry can be saved with «ثبت و بعدی»: the form stays open for the
 * next one, keeping its category, day, account and project.
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { CircleDashed, Receipt } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { AlertBanner, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { AmountField, CategoryGrid, DateField, EntryFormActions, MoreDetails, PickerRow, rememberCategory, recentCategories } from '../../../shared/form/index.js';
import {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber, formatNum } from '../../portfolio/utils/holdingHelpers.js';
import TagInput from './TagInput.jsx';
import { EXPENSE_LIMITS, isSharedExpense, expenseReceivable } from '../../../utils/expenseDocument.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import { listCategories } from '../../../shared/categories/categoryStore.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import AccountForm from '../../accounts/components/AccountForm.jsx';
import { useCreateAccount, withMadeAccounts } from '../../accounts/hooks/useCreateAccount.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { fundingLoanOptions } from '../../../utils/loanFunding.js';
import { useAssetFunds } from '../../../shared/vault/useAssetFunds.js';
import { CURRENCY_ASSET, newSpendTxId, newLinkTxId } from '../../../shared/vault/portfolioFunds.js';
import CategoryLinkField from '../../../shared/links/CategoryLinkField.jsx';
import { linkValueOf, isNewSubscription } from '../../../shared/links/linkValues.js';
import ChequeLinkPicker from '../../cheques/components/ChequeLinkPicker.jsx';
import { isLinkComplete } from '../../../utils/portfolioLink.js';
import { accountsForCurrency } from '../../../utils/accountDocument.js';
import { normalizeCurrency, isForeignCurrency, currencyLabel, currencyRateToday, allowsDecimals } from '../../../utils/currencies.js';
import { useFxRates } from '../../market/useFxRates.js';
import { useDayRate } from '../../../shared/currency/useDayRate.js';
import DayRateHint from '../../../shared/currency/DayRateHint.jsx';
import { categoryLinkOf } from '../../../utils/categoryLinks.js';
import { useOptionalSubscriptionsContext } from '../../subscriptions/context/SubscriptionsContext.jsx';

const LAST_ACCOUNT_KEY = 'realrate_last_expense_account';

function readLastAccount() {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) || '';
  } catch {
    return '';
  }
}

/** How it was paid: from an account (or cash), with a cheque, or with a loan's money */
const PAY_WITH = {
  account: { value: 'account', label: t('حساب یا نقد') },
  cheque: { value: 'cheque', label: t('چک') },
  loan: { value: 'loan', label: t('وام') },
};

/** A portfolio among the «پرداخت از» choices (an account's is its id) */
const FUND_PREFIX = 'pf:';
/** The «حساب جدید» option of «پرداخت از» */
const NEW_ACCOUNT = '__new_account__';

const SHARE_OPTIONS = [
  { value: 'own', label: t('همه‌اش سهم من') },
  { value: 'shared', label: t('با دیگران (دنگ)') },
];

/** No category: only an expense in a project (it is named by its title) */
const NO_CATEGORY = { value: '', label: t('بدون دسته‌بندی'), Icon: CircleDashed };

/** A new everyday expense starts in the category used last, else «خوراک و خواربار» */
function startingCategory() {
  const offered = new Set(listCategories('expense').map((c) => c.value));
  return recentCategories('expense').find((v) => offered.has(v)) || 'groceries';
}


export default function ExpenseForm({ group = null, daily = false, projects = [], expense = null, draft = null, usdToman = 0, accounts = [], onSubmit, onClose, submitting = false, tagSuggestions = [] }) {
  const start = expense || draft;
  // Its project ('': the everyday expenses): the one it is in, else the one it was opened from
  const [projectId, setProjectId] = useState(() => {
    if (start?.groupId && projects.some((p) => p.id === start.groupId)) return start.groupId;
    return group && !daily ? group.id : '';
  });
  // The open projects to pick from (its own stays, even archived); the one it was opened from too
  const projectOptions = [
    ...(group && !daily && !projects.some((p) => p.id === group.id) ? [group] : []),
    ...projects.filter((p) => !p.archived || p.id === projectId),
  ];
  const project = projectOptions.find((p) => p.id === projectId) || null;
  const [accountId, setAccountId] = useState(() => {
    if (expense) return expense.accountId || '';
    if (draft?.accountId) return draft.accountId;
    const last = readLastAccount();
    return accounts.some((a) => a.id === last) ? last : '';
  });
  const [loanId, setLoanId] = useState(expense?.loanId || '');
  const fundingLoans = fundingLoanOptions(useOptionalLoans(), expense?.loanId);
  // In a project an expense may have none (it is named by its title): a new one starts so
  const [category, setCategory] = useState(() => start?.category || (projectId ? '' : startingCategory()));
  const [managing, setManaging] = useState(false);
  // The user's categories (a hidden one only when this expense already has it)
  const categoryOptions = [
    ...(projectId ? [NO_CATEGORY] : []),
    ...useCategories('expense', { keep: start?.category }),
  ];
  // An expense titled after its category shows an empty title field (the default)
  const [title, setTitle] = useState(
    start?.category && start?.title === getExpenseCategory(start.category).label ? '' : (start?.title || ''));
  // A draft may be in a foreign currency too (a dollar subscription's payment)
  const [currency, setCurrency] = useState(normalizeCurrency(start?.currency));
  const [amount, setAmount] = useState(start?.amount ? String(start.amount) : '');
  const [dateShamsi, setDateShamsi] = useState(() =>
    start?.date ? gregorianToShamsi(`${start.date}T00:00:00`) : getTodayShamsi());
  // A project's expense may carry tags (summed per tag beside the list)
  const [tags, setTags] = useState(() => (Array.isArray(start?.tags) ? start.tags : []));
  const [notes, setNotes] = useState(start?.notes || '');
  const [shared, setShared] = useState(isSharedExpense(expense));
  const [myShare, setMyShare] = useState(isSharedExpense(expense) ? String(expense.myShare) : '');
  const [submitError, setSubmitError] = useState('');
  // «سرمایه‌گذاری»: the asset bought with it, in a portfolio (null: not added)
  // The record its category links it to (categoryLinks.js), as the record stores it
  const link = category ? categoryLinkOf('expense', category) : null;
  const [linkValue, setLinkValue] = useState(() => linkValueOf('expense', start?.category, start));
  const changeCategory = (next) => {
    setCategory(next);
    // Back to its own category: the link it had
    setLinkValue(linkValueOf('expense', next, start));
  };
  const changeProject = (next) => {
    setProjectId(next);
    // The everyday expenses are summed per category: one is needed there
    if (!next && !category) changeCategory('other');
  };
  const investing = link?.target === 'portfolio' && Boolean(linkValue);
  // «پرداخت با چک»: the issued cheque it was paid with (any category)
  // «وام»: paid with a loan's money (`loanId`)
  const [payWith, setPayWith] = useState(start?.chequeId ? 'cheque' : expense?.loanId ? 'loan' : 'account');
  const [chequeId, setChequeId] = useState(start?.chequeId || '');
  const creatingSubscription = link?.target === 'subscription' && isNewSubscription(linkValue);

  // A new subscription made with the expense is saved through the shared list
  const subs = useOptionalSubscriptionsContext();

  const isForeign = isForeignCurrency(currency);
  const unit = currencyLabel(currency);
  const amountNum = parseInputNumber(amount);
  const dateIso = shamsiToGregorian(dateShamsi);
  // Today's rate of its currency (the dollar's from the page, another's from the price book)
  const fx = useFxRates(undefined, false);
  const todayRate = isForeign ? currencyRateToday(currency, { usdToman, ...fx }) : 0;

  // A foreign expense: paid from that currency in a portfolio (not an account, not a loan)
  const fundAsset = CURRENCY_ASSET[currency] || '';
  const { funds, loading: loadingFunds } = useAssetFunds(fundAsset, Boolean(fundAsset));
  const [fundId, setFundId] = useState(expense?.paidFrom?.portfolioId || '');
  const fund = fundAsset ? funds.find((f) => f.portfolioId === fundId) || null : null;
  // The accounts that hold the expense's currency (the one it already names stays)
  const accountsEnabled = useFeature('bank_accounts');
  const { made, create: createAccount } = useCreateAccount();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const payAccounts = accountsForCurrency(withMadeAccounts(accounts, made), currency, expense?.accountId);
  const effectiveAccountId = payAccounts.some((a) => a.id === accountId) ? accountId : '';
  // A link chosen fills in what it knows (a new expense only: an edit keeps what was typed)
  const fill = (fields) => {
    if (expense) return;
    if (fields.title && !title.trim()) setTitle(fields.title);
    if (fields.amount) setAmount(String(fields.amount));
    if (fields.currency) setCurrency(normalizeCurrency(fields.currency));
    if (fields.accountId) {
      setAccountId(fields.accountId);
      setFundId('');
    }
  };
  // This expense's own spend is already out of the balance shown
  const ownSpend = expense?.paidFrom && expense.paidFrom.portfolioId === fundId ? Number(expense.amount) || 0 : 0;
  const fundAvailable = fund ? fund.amount + ownSpend : 0;
  const fundAfter = fundAvailable - (amountNum || 0);

  // A foreign expense's rate on its date comes from its currency's price history (dailyHistory.js)
  // and is never stored or typed: it is shown here, with the tomans it makes. A portfolio
  // transaction it writes (paid from a portfolio, bought into one) is priced from the same
  // history when saved (recordRates.js), so it needs that day's rate to be known.
  // A toman expense has no rate: it is seen in dollars at its day's rate in the lists.
  const showsRate = isForeign;
  const { rate: dayRate, state: rateFill } = useDayRate(currency, dateIso, todayRate);

  // «دنگ» is for toman expenses only (and not for one added to a portfolio)
  const canShare = !isForeign && !investing;
  const sharing = canShare && shared;
  const shareNum = parseInputNumber(myShare);
  const shareValid = !sharing || (myShare.trim() !== '' && shareNum >= 0 && shareNum < amountNum);
  const received = expenseReceivable(expense).received;
  const paidFromPortfolio = Boolean(fundAsset && fund);
  // A portfolio transaction is priced at the expense's rate: it is stored with it
  // A portfolio transaction is priced at the day's rate: it must be known
  const needsDayRate = isForeign && (paidFromPortfolio || investing);
  // How it may be paid: a cheque and a loan are in tomans; a loan while one is not yet settled
  const payOptions = isForeign
    ? [PAY_WITH.account]
    : [PAY_WITH.account, PAY_WITH.cheque, ...(fundingLoans.length > 0 ? [PAY_WITH.loan] : [])];
  const paidWith = payOptions.some((o) => o.value === payWith) ? payWith : 'account';
  const loanChosen = paidWith === 'loan' && fundingLoans.some((l) => l.id === loanId);
  // Every expense is tied to an account: one is picked or made, unless it is paid from a
  // portfolio, a cheque or a loan, or is an older expense that never had one
  const accountRequired = accountsEnabled && paidWith === 'account' && !paidFromPortfolio && (!expense || Boolean(expense.accountId));
  const isValid = (Boolean(category) || Boolean(title.trim())) && amountNum > 0 && Boolean(dateIso)
    && (!accountRequired || Boolean(effectiveAccountId))
    && (!needsDayRate || dayRate > 0) && shareValid && !submitting
    && (paidWith !== 'loan' || loanChosen)
    && (!investing || isLinkComplete(linkValue))
    // A new subscription is named after the expense
    && (!creatingSubscription || Boolean(title.trim() && subs));
  const tomanPreview = isForeign && amountNum > 0 ? amountNum * (dayRate || todayRate) : 0;

  // «ثبت و بعدی»: the next entry keeps the category, day, currency, account and project
  const [saved, setSaved] = useState('');
  const [round, setRound] = useState(0);
  const startNext = (savedTitle) => {
    setAmount('');
    setTitle('');
    setNotes('');
    setShared(false);
    setMyShare('');
    setTags([]);
    setChequeId('');
    setLinkValue(linkValueOf('expense', category, null));
    setSaved(savedTitle);
    // The amount field again, focused
    setRound((r) => r + 1);
  };

  const handleSubmit = async (e, next = false) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitError('');
    setSaved('');
    try {
      const payAccountId = paidFromPortfolio ? '' : effectiveAccountId;
      // Its category's link (another category has none): a new subscription is made first
      let linked = link && link.target !== 'portfolio' ? linkValue || null : null;
      const savedTitle = title.trim() || getExpenseCategory(category).label;
      if (creatingSubscription) {
        const created = await subs.saveSubscription({
          name: title.trim(),
          category: 'other',
          amount: amountNum,
          currency,
          cycleMonths: linkValue.create.cycleMonths,
          startDate: dateIso,
          autoRenew: true,
          accountId: payAccountId,
          // This payment is its first: saving the expense doesn't move it on
          lastPaidOn: dateIso,
        });
        linked = created.id;
      }
      await onSubmit({
        // Its project, or '' (the everyday expenses: the caller's daily section)
        groupId: projectId,
        category,
        ...(link && link.target !== 'portfolio' ? { [link.field]: linked } : {}),
        // Paid with a cheque (a toman expense), or not
        chequeId: paidWith === 'cheque' ? chequeId : '',
        accountId: payAccountId,
        loanId: loanChosen ? loanId : '',
        paidFrom: paidFromPortfolio
          ? {
            portfolioId: fund.portfolioId,
            portfolioName: fund.portfolioName,
            assetId: fundAsset,
            txId: expense?.paidFrom?.portfolioId === fund.portfolioId ? expense.paidFrom.txId : newSpendTxId(),
          }
          : null,
        investedIn: investing
          ? {
            portfolioId: linkValue.portfolioId,
            portfolioName: linkValue.portfolioName,
            assetId: linkValue.assetId,
            quantity: Number(linkValue.quantity),
            txId: expense?.investedIn?.portfolioId === linkValue.portfolioId ? expense.investedIn.txId : newLinkTxId(),
          }
          : null,
        title: savedTitle,
        amount: amountNum,
        currency,
        date: dateIso,
        notes: notes.trim(),
        myShare: sharing ? shareNum : null,
        // Tags group a project's expenses; an everyday one keeps those it had
        tags: projectId ? tags : (expense?.tags || []),
        ...(draft && !expense ? { source: draft.source, bankId: draft.bankId, smsFingerprint: draft.smsFingerprint } : {}),
      });
      try {
        if (effectiveAccountId) localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId);
        rememberCategory('expense', category);
      } catch {
        // Only a convenience
      }
      if (next) startNext(savedTitle);
      else onClose();
    } catch (err) {
      setSubmitError(err.message || t('خطا در ذخیره هزینه'));
    }
  };

  // «پرداخت از»: the accounts holding its currency, and that currency held in a portfolio
  const payFromOptions = [
    ...(accountRequired ? [] : [{ value: '', label: t('نامشخص') }]),
    ...payAccounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
    ...(fundAsset ? funds.filter((f) => f.amount > 0 || f.portfolioId === fundId).map((f) => ({
      value: `${FUND_PREFIX}${f.portfolioId}`,
      label: t('پورتفو «{name}»', { name: f.portfolioName }),
      hint: t('موجودی {amount} {unit}', { amount: formatNum(f.amount), unit }),
    })) : []),
    ...(accountsEnabled ? [{ value: NEW_ACCOUNT, label: t('+ حساب جدید') }] : []),
  ];
  const payFrom = fund ? `${FUND_PREFIX}${fund.portfolioId}` : effectiveAccountId;
  const choosePayFrom = (value) => {
    if (value === NEW_ACCOUNT) {
      setCreatingAccount(true);
      return;
    }
    const portfolioId = value.startsWith(FUND_PREFIX) ? value.slice(FUND_PREFIX.length) : '';
    setFundId(portfolioId);
    setAccountId(portfolioId ? '' : value);
  };
  const detailsFilled = [
    ...(sharing ? [t('دنگ')] : []),
    ...(projectId && tags.length > 0 ? [t('برچسب')] : []),
    ...(notes.trim() ? [t('یادداشت')] : []),
  ];

  return (
    <>
    <Modal
      isOpen
      onClose={onClose}
      title={expense ? t('ویرایش هزینه') : project ? t('ثبت هزینه') : t('ثبت هزینه روزمره')}
      subtitle={project ? t('در پروژه «{name}»', { name: project.name }) : t('در هزینه‌های روزمره')}
      icon={<Receipt size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={
        <EntryFormActions
          submitLabel={expense ? t('ذخیره تغییرات') : t('ثبت هزینه')}
          valid={isValid}
          submitting={submitting}
          onCancel={onClose}
          onNext={expense || draft ? null : () => handleSubmit(null, true)}
        />
      }
    >
      <div className="entry-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}
        {saved && <p className="entry-form-saved" role="status">{t('«{title}» ثبت شد؛ هزینه‌ی بعدی را وارد کنید.', { title: saved })}</p>}

        <AmountField
          key={round}
          id="expense-amount"
          value={amount}
          onValueChange={setAmount}
          currency={currency}
          onCurrencyChange={setCurrency}
          placeholder={isForeign ? t('مثلاً ۲۵۰') : t('مثلاً ۱۵,۰۰۰,۰۰۰')}
          autoFocus={!expense}
        >
          {showsRate && <DayRateHint unit={unit} rate={dayRate} state={rateFill} toman={tomanPreview} portfolio={needsDayRate} />}
        </AmountField>

        <CategoryGrid
          kind="expense"
          options={categoryOptions}
          value={category}
          onChange={changeCategory}
          onManage={() => setManaging(true)}
        />
        {managing && <CategoryManagerModal kind="expense" onClose={() => setManaging(false)} />}

        {link && (
          <CategoryLinkField
            side="expense"
            category={category}
            value={linkValue}
            onChange={setLinkValue}
            onFill={fill}
            recordId={expense?.id || ''}
            keepId={expense?.[link.field] || ''}
            title={title}
            toman={isForeign ? (amountNum || 0) * (dayRate || 0) : amountNum || 0}
          />
        )}

        <Input
          id="expense-title"
          label={category ? t('عنوان (اختیاری)') : t('عنوان هزینه *')}
          placeholder={category ? t('خالی: «{label}»', { label: getExpenseCategory(category).label }) : t('مثلاً: خرید کاشی، دستمزد نقاش')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={EXPENSE_LIMITS.titleLength}
          required={!category}
        />

        <DateField label={t('تاریخ هزینه *')} value={dateShamsi} onChange={setDateShamsi} />

        <div className="entry-form-section">
          {payOptions.length > 1 && (
            <div className="ui-input-group">
              <span className="ui-input-label">{t('پرداخت با')}</span>
              <FilterPills variant="segmented" size="sm" options={payOptions} activeValue={paidWith} onChange={setPayWith} />
            </div>
          )}
          {paidWith === 'cheque' && (
            <ChequeLinkPicker side="expense" value={chequeId} onChange={setChequeId} onFill={fill} recordId={expense?.id || ''} />
          )}
          {paidWith === 'loan' && (
            <PickerRow
              label={t('کدام وام')}
              value={loanChosen ? loanId : ''}
              options={fundingLoans.map((l) => ({ value: l.id, label: l.title }))}
              onChange={setLoanId}
            >
              <p className="expense-form-hint">{t('از پول این وام خرج شده؛ در «وام‌ها» جزو خرج‌شده‌ی آن حساب می‌شود.')}</p>
            </PickerRow>
          )}
          {paidWith !== 'cheque' && (payFromOptions.length > 1 || accountRequired) && (
            <PickerRow label={t('پرداخت از')} value={payFrom} options={payFromOptions} onChange={choosePayFrom} placeholder={accountRequired ? t('یک حساب انتخاب کنید') : t('نامشخص')}>
              {accountRequired && !effectiveAccountId && (
                <p className="expense-form-hint is-warning">{t('هر هزینه باید به یک حساب وصل باشد؛ حسابی را انتخاب کنید یا «حساب جدید» بسازید.')}</p>
              )}
              {fundAsset && loadingFunds && <p className="expense-form-hint">{t('در حال خواندن موجودی {unit} پورتفوها…', { unit })}</p>}
              {fund && (
                <p className={`expense-form-hint ${fundAfter < 0 ? 'is-warning' : ''}`}>
                  {t('از موجودی {unit} «{name}» کم می‌شود (تراکنش «پرداخت هزینه»؛ سود یا زیانش نسبت به قیمت خرید در پورتفو ثبت می‌شود).', { unit, name: fund.portfolioName })}
                  {' '}{t('موجودی پس از پرداخت:')} <strong>{formatNum(fundAfter)}</strong> {unit}
                  {fundAfter < 0 && ` ${t('— بیشتر از موجودی است.')}`}
                </p>
              )}
            </PickerRow>
          )}
        </div>

        {projectOptions.length > 0 && (
          <PickerRow
            label={t('پروژه')}
            value={projectId}
            options={[
              { value: '', label: t('روزمره (بدون پروژه)') },
              ...projectOptions.map((p) => ({ value: p.id, label: p.name })),
            ]}
            onChange={changeProject}
          >
            {project && <p className="expense-form-hint">{t('فقط در جمع همین پروژه حساب می‌شود، نه در جمع ماه و بودجه.')}</p>}
          </PickerRow>
        )}

        <MoreDetails filled={detailsFilled}>
          {canShare && (
            <div className="ui-input-group">
              <span className="ui-input-label">{t('سهم')}</span>
              <FilterPills variant="segmented" options={SHARE_OPTIONS} activeValue={shared ? 'shared' : 'own'} onChange={(v) => setShared(v === 'shared')} size="sm" />
              {shared && (
                <>
                  <div className="ui-input-wrapper expense-share-input">
                    <NumericInput
                      id="expense-my-share"
                      value={myShare}
                      onValueChange={setMyShare}
                      allowDecimals={allowsDecimals(currency)}
                      placeholder={t('سهم خودم ({unit})', { unit })}
                      className="ui-input-control"
                      aria-label={t('سهم من')}
                    />
                  </div>
                  <p className="expense-form-hint">
                    {amountNum > 0 && myShare.trim() !== '' && shareNum < amountNum ? (
                      <>
                        {t('فقط')} <strong>{formatNum(shareNum)}</strong> {t('هزینه‌ی شما حساب می‌شود؛')} <strong>{formatNum(amountNum - shareNum)}</strong>{' '}
                        {unit} {t('طلب از دیگران است و دریافتش درآمد حساب نمی‌شود.')}
                      </>
                    ) : amountNum > 0 && shareNum >= amountNum ? (
                      t('سهم شما باید کمتر از مبلغ کل باشد.')
                    ) : (
                      t('مبلغ بالا کل پرداختی است؛ سهم خودتان را بنویسید (صفر: همه برای دیگران بود).')
                    )}
                    {received > 0 && ` ${t('تا حالا {n} دریافت شده.', { n: formatNum(received) })}`}
                  </p>
                </>
              )}
            </div>
          )}

          {projectId && <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />}

          <Input
            id="expense-notes"
            as="textarea"
            label={t('یادداشت')}
            placeholder={t('فروشنده، شماره فاکتور، توضیحات...')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={EXPENSE_LIMITS.notesLength}
            rows={2}
          />
        </MoreDetails>
      </div>
    </Modal>
      {creatingAccount && (
        <AccountForm
          onSubmit={async (input) => {
            const account = await createAccount(input);
            setFundId('');
            setAccountId(account.id);
          }}
          onClose={() => setCreatingAccount(false)}
        />
      )}
    </>
  );
}
