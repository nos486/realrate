import React from 'react';
import { t } from '../../../utils/i18n.js';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getStatusDisplay, getDirectionDisplay } from '../constants/chequeDisplay.js';

const HEADERS = [t('نوع'), t('طرف حساب'), t('مبلغ (تومان)'), t('سررسید'), t('وضعیت'), t('بانک'), t('شماره چک'), t('شناسه صیادی'), t('یادداشت')];

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
      title={t('دریافت خروجی اکسل / CSV از چک‌ها')}
    />
  );
}
