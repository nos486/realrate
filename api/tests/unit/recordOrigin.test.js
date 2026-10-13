import { describe, it, expect } from 'vitest';
import { recordOriginOf } from '../../../web/src/shared/ui/recordOrigin.js';

describe('recordOriginOf', () => {
  it('knows a record the user typed', () => {
    expect(recordOriginOf({ id: 'exp_1', title: 'نان' }).kind).toBe('manual');
    expect(recordOriginOf(null).kind).toBe('manual');
  });

  it('knows what was read automatically', () => {
    expect(recordOriginOf({ source: 'import', importKey: 'imp|x' })).toMatchObject({ kind: 'import', label: expect.stringContaining('فایل بانک') });
    expect(recordOriginOf({ source: 'sms', smsKey: 'k' })).toMatchObject({ kind: 'sms', label: expect.stringContaining('پیامک') });
    // An income from an SMS has only its key
    expect(recordOriginOf({ smsKey: 'k' }).kind).toBe('sms');
  });

  it('knows what another feature recorded, and what is linked to one', () => {
    expect(recordOriginOf({ recordedBy: 'loan' })).toMatchObject({ kind: 'system', label: expect.stringContaining('وام‌ها') });
    expect(recordOriginOf({ loanInstallment: { loanId: 'l', installmentId: 'i' } })).toMatchObject({ kind: 'linked', label: 'وصل به وام' });
    expect(recordOriginOf({ subscriptionId: 's' }).label).toBe('وصل به اشتراک');
    expect(recordOriginOf({ chequeId: 'c' }).label).toBe('وصل به چک');
  });

  it('puts the owner before the source', () => {
    expect(recordOriginOf({ recordedBy: 'cheque', source: 'import' }).kind).toBe('system');
  });
});
