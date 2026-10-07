/**
 * CashMoveTransferForm.jsx — The transfer form («انتقال بین حساب‌ها») opened from another page:
 * an income or expense in «مدیریت نقدینگی» turned into a transfer (CashMoveNotice). Loads the
 * user's accounts and saves the transfer itself (utils/transferDocument.js).
 */

import React from 'react';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { saveTransfer } from '../../../shared/vault/vaultTransfers.js';
import { useAccounts } from '../hooks/useAccounts.js';
import TransferForm from './TransferForm.jsx';

/**
 * @param {{ draft: { amount?: number, date?: string, notes?: string, fromAccountId?: string, toAccountId?: string },
 *   onClose: () => void, onSaved?: (transfer: object) => void }} props
 */
export default function CashMoveTransferForm({ draft, onClose, onSaved }) {
  const { accounts } = useAccounts();
  const { toast } = useFeedback();
  return (
    <TransferForm
      draft={draft}
      accounts={accounts.filter((a) => !a.archived)}
      onClose={onClose}
      onSubmit={async (input) => {
        const { transfer } = await saveTransfer(input);
        toast.success('انتقال بین حساب‌ها ثبت شد (جزو هزینه و درآمد نیست).');
        onSaved?.(transfer);
      }}
    />
  );
}
