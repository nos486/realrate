/**
 * MergeAccountsModal.jsx — «ادغام حساب‌ها»: one account merged into another
 *
 * For a duplicate (typically one a bank SMS made beside an account the user already had): pick
 * the account that stays; every expense, income, cheque, subscription and transfer of this one
 * moves to it, its card and account digits are kept so later bank SMS still find it, and this
 * account is deleted (utils/accountMerge.js, shared/vault/mergeAccounts.js).
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { Merge } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { PickerRow } from '../../../shared/form/index.js';
import { canMergeAccounts } from '../../../utils/accountMerge.js';
import { tracksBalance } from '../../../utils/accountBalance.js';
import { accountLabel } from '../constants/accountDisplay.js';
import { t } from '../../../utils/i18n.js';

/**
 * @param {{ account: object, accounts: object[], onMerge: (keep: object, merged: object) => Promise<void>,
 *   onClose: () => void }} props — `account`: the one merged away; `accounts`: all of them
 */
export default function MergeAccountsModal({ account, accounts, onMerge, onClose }) {
  const targets = accounts.filter((a) => canMergeAccounts(a, account));
  const [keepId, setKeepId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const keep = targets.find((a) => a.id === keepId) || null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!keep || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onMerge(keep, account);
      onClose();
    } catch (err) {
      setError(err.message || t('ادغام حساب‌ها ممکن نشد.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('ادغام حساب «{name}»', { name: account.name })}
      subtitle={t('همه‌ی رکوردهای این حساب به حساب انتخابی منتقل می‌شود')}
      icon={<Merge size={18} />}
      maxWidth="520px"
      onSubmit={submit}
      footer={(
        <>
          <Button type="submit" disabled={!keep} loading={submitting}>{t('ادغام و حذف این حساب')}</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>{t('انصراف')}</Button>
        </>
      )}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}
        <PickerRow
          label={t('ادغام در حساب')}
          value={keepId}
          options={targets.map((a) => ({ value: a.id, label: accountLabel(a) }))}
          onChange={setKeepId}
        />
        <p className="expense-form-hint">
          {t('هزینه‌ها، درآمدها، چک‌ها، اشتراک‌ها و انتقال‌های این حساب به حساب انتخابی می‌روند و این حساب حذف می‌شود. شماره کارت و حساب آن هم نگه داشته می‌شود تا پیامک‌های بعدی بانک به حساب انتخابی بخورد. انتقال‌های بین این دو حساب حذف می‌شوند. این کار برگشت‌پذیر نیست.')}
        </p>
        {keep && tracksBalance(account) && tracksBalance(keep) && (
          <p className="expense-form-hint">{t('هر دو حساب موجودی دارند؛ موجودی اعلام‌شده‌ی حساب انتخابی می‌ماند و موجودی اعلام‌شده‌ی این حساب کنار گذاشته می‌شود.')}</p>
        )}
      </div>
    </Modal>
  );
}
