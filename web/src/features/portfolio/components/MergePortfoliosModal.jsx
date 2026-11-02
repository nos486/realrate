/**
 * MergePortfoliosModal.jsx — «ادغام پورتفوها»: this portfolio merged into another
 *
 * Pick the portfolio that stays; every asset and transaction of this one moves to it with its
 * whole history (the same asset of both becomes one row), expenses, incomes and goals linked to
 * this portfolio follow it, and this portfolio is deleted (utils/portfolioMerge.js,
 * shared/vault/mergePortfolios.js). Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { Merge } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { PickerRow } from '../../../shared/form/index.js';
import { canMergePortfolios } from '../../../utils/portfolioMerge.js';
import { isAccountVaultPortfolio } from '../../../shared/vault/vaultStore.js';
import { intlLocale, t } from '../../../utils/i18n.js';

/** «۳ دارایی، ۱۲ تراکنش» of a portfolio, as the list reports them */
function countsLabel(p) {
  const parts = [];
  if (Number(p.itemCount) > 0) parts.push(t('{n} دارایی', { n: Number(p.itemCount).toLocaleString(intlLocale()) }));
  if (Number(p.transactionCount) > 0) parts.push(t('{n} تراکنش', { n: Number(p.transactionCount).toLocaleString(intlLocale()) }));
  return parts.join(t('، '));
}

/**
 * @param {{ portfolio: object, portfolios: object[], onMerge: (keep: object, merged: object) => Promise<void>,
 *   onClose: () => void }} props — `portfolio`: the one merged away; `portfolios`: all of them
 */
export default function MergePortfoliosModal({ portfolio, portfolios, onMerge, onClose }) {
  const targets = portfolios.filter((p) => canMergePortfolios(p, portfolio) && isAccountVaultPortfolio(p));
  const [keepId, setKeepId] = useState(targets.length === 1 ? targets[0].id : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const keep = targets.find((p) => p.id === keepId) || null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!keep || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onMerge(keep, portfolio);
    } catch (err) {
      setError(err.message || t('ادغام پورتفوها ممکن نشد.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => !submitting && onClose()}
      title={t('ادغام پورتفوی «{name}»', { name: portfolio.name })}
      subtitle={t('همه‌ی دارایی‌ها و تراکنش‌های این پورتفو به پورتفوی انتخابی منتقل می‌شود')}
      icon={<Merge size={18} />}
      maxWidth="520px"
      onSubmit={submit}
      footer={(
        <>
          <Button type="submit" disabled={!keep} loading={submitting}>{t('ادغام و حذف این پورتفو')}</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>{t('انصراف')}</Button>
        </>
      )}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}
        <PickerRow
          label={t('ادغام در پورتفوی')}
          value={keepId}
          options={targets.map((p) => ({ value: p.id, label: p.name, hint: countsLabel(p) || undefined }))}
          onChange={setKeepId}
        />
        <p className="expense-form-hint">
          {t('دارایی‌ها و تراکنش‌های این پورتفو با همه‌ی تاریخچه‌شان به پورتفوی انتخابی می‌روند و هر دارایی یکسان در یک ردیف جمع می‌شود. هزینه‌ها، درآمدها و اهدافی که به این پورتفو وصل‌اند هم به پورتفوی انتخابی وصل می‌شوند. سپس این پورتفو حذف می‌شود. این کار برگشت‌پذیر نیست.')}
        </p>
        <p className="expense-form-hint">{t('دسته‌بندی‌ها و هدف‌های تخصیص پورتفوی انتخابی همان‌طور می‌ماند.')}</p>
        {keep && portfolio.isDefault && !keep.isDefault && (
          <p className="expense-form-hint">{t('این پورتفو پیش‌فرض است؛ پس از ادغام، پورتفوی انتخابی پیش‌فرض می‌شود.')}</p>
        )}
      </div>
    </Modal>
  );
}
