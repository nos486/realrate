/**
 * ExpenseForm.jsx — Modal to record or edit an expense, in tomans or dollars
 *
 * For a project section (`group`) the title is required. For everyday expenses (`daily`) a
 * category is picked instead and the title is optional (the category's name when left empty).
 * A dollar expense may carry the toman rate of its day; left empty, totals convert it at
 * today's rate. With `accounts`, the account it was paid from can be picked (a new everyday
 * expense starts from the last one used). A new expense may start from a `draft` (a bank SMS:
 * amount, day, account, note, and its source). «تأمین از» says whether it was paid from the user's
 * own money or from a loan (loanFunding.js) — offered while there is a loan not yet settled.
 * «دنگ»: the amount was paid for others too — only «سهم من» counts as the user's expense, the rest
 * is owed back (what comes back is recorded on the expense, ReimbursementsModal.jsx, not as income).
 * A dollar expense is paid from a portfolio's dollars instead of an account (and has no loan): the
 * dollars leave that portfolio as a «spend» transaction at the expense's rate (portfolioFunds.js),
 * which is filled in from that day's price history.
 * Mounted only while open, so its state starts from props.
 */

import React, { useEffect, useState } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber, formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { EXPENSE_CURRENCIES, EXPENSE_LIMITS, isSharedExpense, expenseReceivable } from '../../../utils/expenseDocument.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { fundingLoanOptions } from '../../../utils/loanFunding.js';
import { useAssetFunds } from '../../../shared/vault/useAssetFunds.js';
import { CURRENCY_ASSET, newSpendTxId, rateOnDay } from '../../../shared/vault/portfolioFunds.js';
import { todayIso } from '../../../shared/utils/dates.js';

const LAST_ACCOUNT_KEY = 'realrate_last_expense_account';

function readLastAccount() {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) || '';
  } catch {
    return '';
  }
}

const SHARE_OPTIONS = [
  { value: 'own', label: 'همه‌اش سهم من' },
  { value: 'shared', label: 'با دیگران (دنگ)' },
];

const CURRENCY_OPTIONS = EXPENSE_CURRENCIES.map(({ value, label }) => ({ value, label }));

export default function ExpenseForm({ group = null, daily = false, expense = null, draft = null, usdToman = 0, accounts = [], onSubmit, onClose, submitting = false }) {
  const start = expense || draft;
  const [accountId, setAccountId] = useState(() => {
    if (expense) return expense.accountId || '';
    if (draft?.accountId) return draft.accountId;
    const last = readLastAccount();
    return accounts.some((a) => a.id === last) ? last : '';
  });
  const [loanId, setLoanId] = useState(expense?.loanId || '');
  const fundingLoans = fundingLoanOptions(useOptionalLoans(), expense?.loanId);
  const [category, setCategory] = useState(expense?.category || 'groceries');
  const [managing, setManaging] = useState(false);
  // The user's categories (a hidden one only when this expense already has it)
  const categoryOptions = useCategories('expense', { keep: expense?.category }).map(({ value, label, Icon }) => ({
    value,
    label,
    icon: <Icon size={14} strokeWidth={2} />,
  }));
  // A daily expense titled after its category shows an empty title field (the default)
  const [title, setTitle] = useState(
    daily && expense?.title === getExpenseCategory(expense?.category).label ? '' : (expense?.title || ''));
  const [currency, setCurrency] = useState(expense?.currency || 'IRT');
  const [amount, setAmount] = useState(start?.amount ? String(start.amount) : '');
  const [usdRate, setUsdRate] = useState(expense?.usdRate ? String(expense.usdRate) : '');
  const [dateShamsi, setDateShamsi] = useState(() =>
    start?.date ? gregorianToShamsi(`${start.date}T00:00:00`) : getTodayShamsi());
  const [notes, setNotes] = useState(start?.notes || '');
  const [shared, setShared] = useState(isSharedExpense(expense));
  const [myShare, setMyShare] = useState(isSharedExpense(expense) ? String(expense.myShare) : '');
  const [submitError, setSubmitError] = useState('');

  const isUsd = currency === 'USD';
  const amountNum = parseInputNumber(amount);
  const rateNum = parseInputNumber(usdRate);
  const dateIso = shamsiToGregorian(dateShamsi);

  // A dollar expense: paid from a portfolio's dollars (not a toman account, not a loan)
  const fundAsset = CURRENCY_ASSET[currency] || '';
  const { funds, loading: loadingFunds } = useAssetFunds(fundAsset, Boolean(fundAsset));
  const [fundId, setFundId] = useState(expense?.paidFrom?.portfolioId || '');
  const fund = fundAsset ? funds.find((f) => f.portfolioId === fundId) || null : null;
  // This expense's own spend is already out of the balance shown
  const ownSpend = expense?.paidFrom && expense.paidFrom.portfolioId === fundId ? Number(expense.amount) || 0 : 0;
  const fundAvailable = fund ? fund.amount + ownSpend : 0;
  const fundAfter = fundAvailable - (amountNum || 0);

  // The day's rate, for an expense paid from a portfolio (when none was typed)
  const [rateTouched, setRateTouched] = useState(Boolean(expense?.usdRate));
  useEffect(() => {
    if (!isUsd || !fundId || rateTouched || !dateIso) return undefined;
    let cancelled = false;
    const apply = (rate) => {
      if (!cancelled && rate > 0) setUsdRate(String(Math.round(rate)));
    };
    if (dateIso === todayIso() && usdToman > 0) apply(usdToman);
    else rateOnDay(fundAsset, dateIso).then(apply);
    return () => {
      cancelled = true;
    };
  }, [isUsd, fundId, rateTouched, dateIso, usdToman, fundAsset]);
  // «دنگ» is for toman expenses only
  const canShare = !isUsd;
  const sharing = canShare && shared;
  const shareNum = parseInputNumber(myShare);
  const shareValid = !sharing || (myShare.trim() !== '' && shareNum >= 0 && shareNum < amountNum);
  const received = expenseReceivable(expense).received;
  const paidFromPortfolio = Boolean(fundAsset && fund);
  const isValid = (daily || Boolean(title.trim())) && amountNum > 0 && Boolean(dateIso) && (!usdRate || rateNum > 0)
    && (!paidFromPortfolio || rateNum > 0) && shareValid && !submitting;
  const tomanPreview = isUsd && amountNum > 0 ? amountNum * (rateNum || usdToman) : 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitError('');
    try {
      await onSubmit({
        ...(group ? { groupId: group.id } : {}),
        ...(daily ? { category } : {}),
        accountId: fundAsset ? '' : accountId,
        loanId: !fundAsset && fundingLoans.some((l) => l.id === loanId) ? loanId : '',
        paidFrom: paidFromPortfolio
          ? {
            portfolioId: fund.portfolioId,
            portfolioName: fund.portfolioName,
            assetId: fundAsset,
            txId: expense?.paidFrom?.portfolioId === fund.portfolioId ? expense.paidFrom.txId : newSpendTxId(),
          }
          : null,
        title: title.trim() || getExpenseCategory(category).label,
        amount: amountNum,
        currency,
        usdRate: isUsd && rateNum > 0 ? rateNum : null,
        date: dateIso,
        notes: notes.trim(),
        myShare: sharing ? shareNum : null,
        ...(draft && !expense ? { source: draft.source, bankId: draft.bankId, smsFingerprint: draft.smsFingerprint } : {}),
      });
      try {
        if (accountId) localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
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
      title={expense ? 'ویرایش هزینه' : daily ? 'ثبت هزینه روزمره' : 'ثبت هزینه'}
      subtitle={daily ? 'در هزینه‌های روزمره' : `در بخش «${group.name}»`}
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

        {daily && (
          <div className="ui-input-group">
            <span className="ui-input-label">دسته‌بندی</span>
            <FilterPills
              options={categoryOptions}
              activeValue={category}
              onChange={setCategory}
              size="sm"
              className="income-category-picker"
            />
            <button type="button" className="category-picker-edit" onClick={() => setManaging(true)}>ویرایش و افزودن دسته</button>
          </div>
        )}
        {managing && <CategoryManagerModal kind="expense" onClose={() => setManaging(false)} />}

        <Input
          id="expense-title"
          label={daily ? 'عنوان (اختیاری)' : 'عنوان هزینه *'}
          placeholder={daily ? `خالی: «${getExpenseCategory(category).label}»` : 'مثلاً: خرید کاشی، دستمزد نقاش'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={EXPENSE_LIMITS.titleLength}
          autoFocus={!expense && !daily}
          required={!daily}
        />

        <div className="ui-input-group">
          <span className="ui-input-label">ارز</span>
          <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
        </div>

        <div className="ui-input-group">
          <label htmlFor="expense-amount" className="ui-input-label">مبلغ ({isUsd ? 'دلار' : 'تومان'}) *</label>
          <div className="ui-input-wrapper">
            <NumericInput
              id="expense-amount"
              value={amount}
              onValueChange={setAmount}
              allowDecimals={isUsd}
              placeholder={isUsd ? 'مثلاً ۲۵۰' : 'مثلاً ۱۵,۰۰۰,۰۰۰'}
              className="ui-input-control"
              required
            />
          </div>
        </div>

        {isUsd && (
          <div className="ui-input-group">
            <label htmlFor="expense-usd-rate" className="ui-input-label expense-rate-label">
              نرخ دلار در روز هزینه (تومان{paidFromPortfolio ? ' *' : '، اختیاری'})
              {usdToman > 0 && (
                <button
                  type="button"
                  className="btn-fx-rate-refresh"
                  title="استفاده از نرخ امروز"
                  onClick={() => setUsdRate(String(Math.round(usdToman)))}
                >
                  <RefreshCw size={11} />
                </button>
              )}
            </label>
            <div className="ui-input-wrapper">
              <NumericInput
                id="expense-usd-rate"
                value={usdRate}
                onValueChange={(v) => {
                  setRateTouched(true);
                  setUsdRate(v);
                }}
                allowDecimals={false}
                placeholder={usdToman > 0 ? `خالی: نرخ امروز (${formatNum(usdToman)})` : 'نرخ هر دلار به تومان'}
                className="ui-input-control"
              />
            </div>
            {tomanPreview > 0 && (
              <p className="expense-form-hint">
                معادل حدود <strong>{formatNum(tomanPreview)}</strong> تومان
                {!rateNum && ' (به نرخ امروز)'}
              </p>
            )}
          </div>
        )}

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
                    allowDecimals={isUsd}
                    placeholder={`سهم خودم (${isUsd ? 'دلار' : 'تومان'})`}
                    className="ui-input-control"
                    aria-label="سهم من"
                  />
                </div>
                <p className="expense-form-hint">
                  {amountNum > 0 && myShare.trim() !== '' && shareNum < amountNum ? (
                    <>
                      فقط <strong>{formatNum(shareNum)}</strong> هزینه‌ی شما حساب می‌شود؛ <strong>{formatNum(amountNum - shareNum)}</strong>{' '}
                      {isUsd ? 'دلار' : 'تومان'} طلب از دیگران است و دریافتش درآمد حساب نمی‌شود.
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

        {fundAsset && (
          <div className="ui-input-group">
            <span className="ui-input-label">پرداخت از</span>
            {loadingFunds ? (
              <p className="expense-form-hint">در حال خواندن دارایی دلاری پورتفوها…</p>
            ) : (
              <FilterPills
                options={[
                  { value: '', label: 'نامشخص' },
                  ...funds
                    .filter((f) => f.amount > 0 || f.portfolioId === fundId)
                    .map((f) => ({ value: f.portfolioId, label: `${f.portfolioName} — ${formatNum(f.amount)} دلار` })),
                ]}
                activeValue={fundId}
                onChange={setFundId}
                size="sm"
                className="income-category-picker"
              />
            )}
            {fund ? (
              <p className={`expense-form-hint ${fundAfter < 0 ? 'is-warning' : ''}`}>
                از دلارهای «{fund.portfolioName}» کم می‌شود (تراکنش «پرداخت هزینه»؛ سود یا زیانش نسبت به قیمت خرید در پورتفو ثبت می‌شود).
                {' '}موجودی پس از پرداخت: <strong>{formatNum(fundAfter)}</strong> دلار
                {fundAfter < 0 && ' — بیشتر از موجودی است.'}
              </p>
            ) : !loadingFunds && funds.every((f) => !(f.amount > 0)) && (
              <p className="expense-form-hint">هیچ پورتفویی دلار ندارد؛ هزینه بدون منبع ثبت می‌شود.</p>
            )}
          </div>
        )}

        {!fundAsset && accounts.length > 0 && (
          <div className="ui-input-group">
            <span className="ui-input-label">پرداخت از</span>
            <FilterPills
              options={[
                { value: '', label: 'نامشخص' },
                ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
              ]}
              activeValue={accountId}
              onChange={setAccountId}
              size="sm"
              className="income-category-picker"
            />
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
