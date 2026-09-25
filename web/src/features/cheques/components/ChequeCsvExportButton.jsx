import React from 'react';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getStatusDisplay, getDirectionDisplay } from '../constants/chequeDisplay.js';

const HEADERS = ['نوع', 'طرف حساب', 'مبلغ (تومان)', 'سررسید', 'وضعیت', 'بانک', 'شماره چک', 'شناسه صیادی', 'یادداشت'];

export default function ChequeCsvExportButton({ cheques = [], disabled = false }) {
  return (
    <GenericCsvExportButton
      items={cheques}
      headers={HEADERS}
      mapRow={(cheque) => [
        getDirectionDisplay(cheque.direction).label,
        cheque.counterparty,
        cheque.amount,
        cheque.dueDate,
        getStatusDisplay(cheque.status).label,
        cheque.bankName || cheque.bankId || '',
        cheque.chequeNumber || '',
        cheque.sayadId || '',
        cheque.notes || '',
      ]}
      fileBaseName="cheques"
      disabled={disabled}
      title="دریافت خروجی اکسل / CSV از چک‌ها"
    />
  );
}
