/**
 * TransferPairSheet.jsx — «انتقال بین حساب‌های خودم»: pick the other side's message by hand
 *
 * Shown when no waiting message pairs with this one on its own (the same amount or a fee below
 * 1%, within a day) but others of the opposite direction wait: the user may pick the one that is
 * the other side (the gap becomes the fee), or go on with this message alone. Nothing is recorded
 * here; the transfer form opens next for the user to confirm.
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/index.js';
import { resolveBank } from '../../shared/banks/resolveBank.js';
import { toPersianDigits } from '../../shared/utils/formatters.js';
import { formatAmount } from '../expenses/utils/format.js';
import { formatShamsiDisplay } from '../portfolio/components/ShamsiDatePicker.jsx';

/** The most messages offered (the nearest in time first) */
const MAX_CHOICES = 20;

export default function TransferPairSheet({ item, candidates = [], onPick, onAlone, onClose }) {
  const day = Date.parse(`${item.tx.date}T00:00:00Z`);
  const choices = [...candidates]
    .sort((a, b) => Math.abs(Date.parse(`${a.tx.date}T00:00:00Z`) - day) - Math.abs(Date.parse(`${b.tx.date}T00:00:00Z`) - day))
    .slice(0, MAX_CHOICES);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('انتقال بین حساب‌های خودم')}
      subtitle={t('پیامک طرف دیگر این انتقال کدام است؟ اختلاف مبلغ‌ها کارمزد ثبت می‌شود.')}
      icon={<ArrowLeftRight size={18} />}
      maxWidth="460px"
    >
      <div className="loan-deposit-body">
        <ul className="loan-deposit-list">
          {choices.map((p) => {
            const isDebit = p.tx.direction === 'debit';
            return (
              <li key={p.fingerprint}>
                <button type="button" className="loan-deposit-option" onClick={() => onPick(p)}>
                  {isDebit ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  <span>
                    <strong>{isDebit ? t('برداشت') : t('واریز')} {formatAmount(p.tx.amount)} {t('تومان')}</strong>
                    <small>
                      {resolveBank({ bankId: p.tx.bankId }).shortName}
                      {p.tx.date && ` · ${formatShamsiDisplay(`${p.tx.date}T00:00:00`)}`}
                      {p.tx.time && ` · ${toPersianDigits(p.tx.time)}`}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button block variant="secondary" onClick={onAlone}>{t('فقط همین پیامک')}</Button>
      </div>
    </Modal>
  );
}
