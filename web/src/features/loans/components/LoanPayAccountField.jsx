/**
 * LoanPayAccountField.jsx — «پرداخت از»: the account a loan payment (an installment, an extra
 * payment) was paid from, asked whenever one is recorded on the loans page
 *
 * The payment's expense is tied to the account it picks, so the account's balance follows. Only
 * the accounts holding tomans are offered, and nothing is shown without the accounts feature or
 * without an account. The account used last is remembered for the next payment (this page load);
 * with a single account, that one is the default.
 */

import { t } from '../../../utils/i18n.js';
import React from 'react';
import { PickerRow } from '../../../shared/form/index.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { useLoanPayAccounts } from '../hooks/useLoanPayAccounts.js';

/**
 * @param {{ value: string, onChange: (accountId: string) => void }} props
 */
export default function LoanPayAccountField({ value, onChange }) {
  const { accounts } = useLoanPayAccounts();
  if (accounts.length === 0) return null;
  return (
    <PickerRow
      label={t('پرداخت از')}
      value={value}
      options={[{ value: '', label: t('نامشخص') }, ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
      onChange={onChange}
      placeholder={t('نامشخص')}
    />
  );
}
