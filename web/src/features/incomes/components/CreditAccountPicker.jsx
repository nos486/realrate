/**
 * CreditAccountPicker.jsx — «برای کدام اعتبار»: the bank credit a «تسویه بدهی اعتباری» deposit
 * pays (the user's credit accounts, utils/accountDocument.js)
 */

import React from 'react';
import { AlertBanner, FilterPills } from '../../../shared/ui/index.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import { isCreditAccount } from '../../../utils/accountDocument.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';

/**
 * @param {{ value: string, onChange: (accountId: string) => void }} props
 */
export default function CreditAccountPicker({ value, onChange }) {
  const { accounts, loading } = useAccounts();
  // Archived credits only when this deposit already pays one
  const credits = accounts.filter((a) => isCreditAccount(a) && (!a.archived || a.id === value));
  if (loading && credits.length === 0) return null;
  if (credits.length === 0) {
    return <AlertBanner type="info" message="برای این دسته، اعتبار بانکی را در صفحه‌ی «حساب‌ها» اضافه کنید." />;
  }
  return (
    <div className="ui-input-group">
      <span className="ui-input-label">برای کدام اعتبار *</span>
      <FilterPills
        options={credits.map((a) => ({ value: a.id, label: accountLabel(a) }))}
        activeValue={value}
        onChange={onChange}
        size="sm"
        className="income-category-picker"
      />
      <p className="expense-form-hint">این واریز از بدهی همین اعتبار کم می‌شود و به‌طور پیش‌فرض در جمع درآمدها حساب نمی‌شود.</p>
    </div>
  );
}
