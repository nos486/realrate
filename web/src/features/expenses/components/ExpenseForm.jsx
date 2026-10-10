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
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { Receipt } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber, formatNum } from '../../portfolio/utils/holdingHelpers.js';
import TagInput from './TagInput.jsx';
import { EXPENSE_CURRENCIES, EXPENSE_LIMITS, isSharedExpense, expenseReceivable } from '../../../utils/expenseDocument.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
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

/** How it was paid: from an account (or cash), or with a cheque */
const PAY_WITH_OPTIONS = [
  { value: 'account', label: 'حساب یا نقد' },
  { value: 'cheque', label: 'چک' },
];

const SHARE_OPTIONS = [
  { value: 'own', label: 'همه‌اش سهم من' },
  { value: 'shared', label: 'با دیگران (دنگ)' },
];

const CURRENCY_OPTIONS = EXPENSE_CURRENCIES.map(({ value, label }) => ({ value, label }));

/** No category: only an expense in a project (it is named by its title) */
const NO_CATEGORY = { value: '', label: 'بدون دسته‌بندی' };


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
  const [category, setCategory] = useState(() => start?.category || (projectId ? '' : 'groceries'));
  const [managing, setManaging] = useState(false);
  // The user's categories (a hidden one only when this expense already has it)
  const categoryOptions = [
    ...(projectId ? [NO_CATEGORY] : []),
    ...useCategories('expense', { keep: start?.category }).map(({ value, label, Icon }) => ({
      value,
      label,
      icon: <Icon size={14} strokeWidth={2} />,
    })),
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
  const [payWith, setPayWith] = useState(start?.chequeId ? 'cheque' : 'account');
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
  const payAccounts = accountsForCurrency(accounts, currency, expense?.accountId);
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
  const isValid = (Boolean(category) || Boolean(title.trim())) && amountNum > 0 && Boolean(dateIso)
    && (!needsDayRate || dayRate > 0) && shareValid && !submitting
    && (!investing || isLinkComplete(linkValue))
    // A new subscription is named after the expense
    && (!creatingSubscription || Boolean(title.trim() && subs));
  const tomanPreview = isForeign && amountNum > 0 ? amountNum * (dayRate || todayRate) : 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitError('');
    try {
      const payAccountId = paidFromPortfolio ? '' : effectiveAccountId;
      // Its category's link (another category has none): a new subscription is made first
      let linked = link && link.target !== 'portfolio' ? linkValue || null : null;
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
        chequeId: payWith === 'cheque' && !isForeign ? chequeId : '',
        accountId: payAccountId,
        loanId: !fundAsset && fundingLoans.some((l) => l.id === loanId) ? loanId : '',
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
        title: title.trim() || getExpenseCategory(category).label,
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
      } catch {
        // Only a convenience
      }
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره هزینه');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={expense ? 'ویرایش هزینه' : project ? 'ثبت هزینه' : 'ثبت هزینه روزمره'}
      subtitle={project ? `در پروژه «${project.name}»` : 'در هزینه‌های روزمره'}
      icon={<Receipt size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>
            {expense ? 'ذخیره تغییرات' : 'ثبت هزینه'}
          </Button>
        </div>
      }
    >
      <div className="income-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}

        <div className="ui-input-group">
          <span className="ui-input-label">دسته‌بندی</span>
          <FilterPills
            options={categoryOptions}
            activeValue={category}
            onChange={changeCategory}
            size="sm"
            className="income-category-picker"
          />
          <button type="button" className="category-picker-edit" onClick={() => setManaging(true)}>ویرایش و افزودن دسته</button>
        </div>
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
          label={category ? 'عنوان (اختیاری)' : 'عنوان هزینه *'}
          placeholder={category ? `خالی: «${getExpenseCategory(category).label}»` : 'مثلاً: خرید کاشی، دستمزد نقاش'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={EXPENSE_LIMITS.titleLength}
          autoFocus={!expense && !category}
          required={!category}
        />

        <div className="ui-input-group">
          <span className="ui-input-label">ارز</span>
          <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
        </div>

        <div className="ui-input-group">
          <label htmlFor="expense-amount" className="ui-input-label">مبلغ ({unit}) *</label>
          <div className="ui-input-wrapper">
            <NumericInput
              id="expense-amount"
              value={amount}
              onValueChange={setAmount}
              allowDecimals={allowsDecimals(currency)}
              placeholder={isForeign ? 'مثلاً ۲۵۰' : 'مثلاً ۱۵,۰۰۰,۰۰۰'}
              className="ui-input-control"
              required
            />
          </div>
        </div>

        {showsRate && <DayRateHint unit={unit} rate={dayRate} state={rateFill} toman={tomanPreview} portfolio={needsDayRate} />}

        {canShare && (
          <div className="ui-input-group">
            <span className="ui-input-label">سهم</span>
            <FilterPills options={SHARE_OPTIONS} activeValue={shared ? 'shared' : 'own'} onChange={(v) => setShared(v === 'shared')} size="sm" />
            {shared && (
              <>
                <div className="ui-input-wrapper expense-share-input">
                  <NumericInput
                    id="expense-my-share"
                    value={myShare}
                    onValueChange={setMyShare}
                    allowDecimals={allowsDecimals(currency)}
                    placeholder={`سهم خودم (${unit})`}
                    className="ui-input-control"
                    aria-label="سهم من"
                  />
                </div>
                <p className="expense-form-hint">
                  {amountNum > 0 && myShare.trim() !== '' && shareNum < amountNum ? (
                    <>
                      فقط <strong>{formatNum(shareNum)}</strong> هزینه‌ی شما حساب می‌شود؛ <strong>{formatNum(amountNum - shareNum)}</strong>{' '}
                      {unit} طلب از دیگران است و دریافتش درآمد حساب نمی‌شود.
                    </>
                  ) : amountNum > 0 && shareNum >= amountNum ? (
                    'سهم شما باید کمتر از مبلغ کل باشد.'
                  ) : (
                    'مبلغ بالا کل پرداختی است؛ سهم خودتان را بنویسید (صفر: همه برای دیگران بود).'
                  )}
                  {received > 0 && ` تا حالا ${formatNum(received)} دریافت شده.`}
                </p>
              </>
            )}
          </div>
        )}

        {!isForeign && (
          <div className="ui-input-group">
            <span className="ui-input-label">پرداخت با</span>
            <FilterPills options={PAY_WITH_OPTIONS} activeValue={payWith} onChange={setPayWith} size="sm" />
          </div>
        )}
        {!isForeign && payWith === 'cheque' && (
          <ChequeLinkPicker side="expense" value={chequeId} onChange={setChequeId} onFill={fill} recordId={expense?.id || ''} />
        )}

        {payAccounts.length > 0 && (
          <div className="ui-input-group">
            <span className="ui-input-label">{fundAsset ? 'پرداخت از حساب' : 'پرداخت از'}</span>
            <FilterPills
              options={[
                { value: '', label: 'نامشخص' },
                ...payAccounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
              ]}
              activeValue={effectiveAccountId}
              onChange={(id) => {
                setAccountId(id);
                if (id) setFundId('');
              }}
              size="sm"
              className="income-category-picker"
            />
          </div>
        )}

        {fundAsset && (
          <div className="ui-input-group">
            <span className="ui-input-label">{payAccounts.length > 0 ? `یا از ${unit} پورتفو` : 'پرداخت از'}</span>
            {loadingFunds ? (
              <p className="expense-form-hint">در حال خواندن موجودی {unit} پورتفوها…</p>
            ) : (
              <FilterPills
                options={[
                  { value: '', label: 'نامشخص' },
                  ...funds
                    .filter((f) => f.amount > 0 || f.portfolioId === fundId)
                    .map((f) => ({ value: f.portfolioId, label: `${f.portfolioName} — ${formatNum(f.amount)} ${unit}` })),
                ]}
                activeValue={fundId}
                onChange={(id) => {
                  setFundId(id);
                  if (id) setAccountId('');
                }}
                size="sm"
                className="income-category-picker"
              />
            )}
            {fund ? (
              <p className={`expense-form-hint ${fundAfter < 0 ? 'is-warning' : ''}`}>
                از موجودی {unit} «{fund.portfolioName}» کم می‌شود (تراکنش «پرداخت هزینه»؛ سود یا زیانش نسبت به قیمت خرید در پورتفو ثبت می‌شود).
                {' '}موجودی پس از پرداخت: <strong>{formatNum(fundAfter)}</strong> {unit}
                {fundAfter < 0 && ' — بیشتر از موجودی است.'}
              </p>
            ) : !loadingFunds && !effectiveAccountId && funds.every((f) => !(f.amount > 0)) && (
              <p className="expense-form-hint">هیچ پورتفویی {unit} ندارد؛ هزینه بدون منبع ثبت می‌شود.</p>
            )}
          </div>
        )}

        {!fundAsset && fundingLoans.length > 0 && (
          <div className="ui-input-group">
            <span className="ui-input-label">تأمین از</span>
            <FilterPills
              options={[
                { value: '', label: 'پول خودم' },
                ...fundingLoans.map((l) => ({ value: l.id, label: l.title })),
              ]}
              activeValue={loanId}
              onChange={setLoanId}
              size="sm"
              className="income-category-picker"
            />
          </div>
        )}

        <ShamsiDatePicker label="تاریخ هزینه *" value={dateShamsi} onChange={setDateShamsi} />

        {projectOptions.length > 0 && (
          <div className="ui-input-group">
            <span className="ui-input-label">پروژه</span>
            <FilterPills
              options={[
                { value: '', label: 'روزمره (بدون پروژه)' },
                ...projectOptions.map((p) => ({ value: p.id, label: p.name })),
              ]}
              activeValue={projectId}
              onChange={changeProject}
              size="sm"
              className="income-category-picker"
            />
            {project && <p className="expense-form-hint">فقط در جمع همین پروژه حساب می‌شود، نه در جمع ماه و بودجه.</p>}
          </div>
        )}


        {projectId && <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />}

        <Input
          id="expense-notes"
          as="textarea"
          label="یادداشت (اختیاری)"
          placeholder="فروشنده، شماره فاکتور، توضیحات..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={EXPENSE_LIMITS.notesLength}
          rows={2}
        />
      </div>
    </Modal>
  );
}
