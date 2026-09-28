// @vitest-environment happy-dom
/**
 * smsImportForm.test.jsx — pasting a bank SMS: what it says, the account it matches, and the
 * expense draft it continues to
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import SmsImportForm, { smsExpenseDraft } from '../../../web/src/features/expenses/components/SmsImportForm.jsx';
import { parseBankSms } from '../../../web/src/utils/bankSms.js';
import { BANK_SMS_TEMPLATES } from '../../../web/src/utils/bankSmsTemplates.js';

const DEBIT = '30101540968603\nمبلغ:397,500-\nمانده:81,294,045\n07/06\n14:49';
const CREDIT = '30101540968603\nمبلغ:2,582,800,000+\nمانده:2,616,820,545\n07/04\n09:22';
const accounts = [{ id: 'acc_1', name: 'پارسیان حقوق', bankId: 'parsian', accountNumber: '30101540968603' }];

afterEach(cleanup);

const paste = (text) => fireEvent.change(screen.getByLabelText('متن پیامک'), { target: { value: text } });

describe('SmsImportForm', () => {
  it('reads a withdrawal and continues with the expense draft', () => {
    const onContinue = vi.fn();
    render(<SmsImportForm accounts={accounts} onContinue={onContinue} onClose={() => {}} />);
    paste(DEBIT);
    expect(screen.getByText('برداشت')).toBeTruthy();
    expect(screen.getByText('پارسیان حقوق')).toBeTruthy();
    fireEvent.submit(screen.getByText('ادامه و ثبت هزینه').closest('form'));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      amount: 39750, accountId: 'acc_1', source: 'sms', bankId: 'parsian',
    }));
  });

  it('a deposit is shown but not recorded as an expense', () => {
    const onContinue = vi.fn();
    render(<SmsImportForm accounts={accounts} onContinue={onContinue} onClose={() => {}} />);
    paste(CREDIT);
    expect(screen.getByText('واریز')).toBeTruthy();
    expect(screen.getByText('ادامه و ثبت هزینه').closest('button').disabled).toBe(true);
  });

  it('an unknown message and one already recorded are flagged', () => {
    const tx = parseBankSms(DEBIT, BANK_SMS_TEMPLATES);
    render(<SmsImportForm accounts={accounts} recorded={[{ smsFingerprint: tx.fingerprint }]} onContinue={() => {}} onClose={() => {}} />);
    paste(DEBIT);
    expect(screen.getByText('این پیامک قبلاً ثبت شده است.')).toBeTruthy();
    paste('سلام');
    expect(screen.getByText(/این پیامک شناخته نشد/)).toBeTruthy();
  });

  it('the draft notes the bank and time', () => {
    const tx = parseBankSms(DEBIT, BANK_SMS_TEMPLATES);
    expect(smsExpenseDraft(tx, []).notes).toBe('پیامک پارسیان · ساعت ۱۴:۴۹');
  });
});
