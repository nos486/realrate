import { describe, it, expect } from 'vitest';
import {
  wordsToNumberPersian,
  parseChequeScanJson,
  parseAndConvertShamsiDate,
  jalaliToGregorian,
  normalizeChequeScan,
} from '../../src/domain/chequeScan.js';

describe('wordsToNumberPersian', () => {
  it('converts at least 10 Persian verbal number phrases accurately', () => {
    // 1. Simple tens of millions in Rials
    const s1 = wordsToNumberPersian('پنجاه میلیون ریال');
    expect(s1).toEqual({ amountRials: 50000000, rawNumber: 50000000, unit: 'rial' });

    // 2. Hundreds and tens in Rials
    const s2 = wordsToNumberPersian('صد و بیست و پنج میلیون ریال');
    expect(s2).toEqual({ amountRials: 125000000, rawNumber: 125000000, unit: 'rial' });

    // 3. Billions in Rials
    const s3 = wordsToNumberPersian('یک میلیارد ریال');
    expect(s3).toEqual({ amountRials: 1000000000, rawNumber: 1000000000, unit: 'rial' });

    // 4. Tens of millions in Tomans (1 Toman = 10 Rials)
    const s4 = wordsToNumberPersian('ده میلیون تومان');
    expect(s4).toEqual({ amountRials: 100000000, rawNumber: 10000000, unit: 'toman' });

    // 5. Hundreds of thousands in Rials
    const s5 = wordsToNumberPersian('دویست و پنجاه هزار ریال');
    expect(s5).toEqual({ amountRials: 250000, rawNumber: 250000, unit: 'rial' });

    // 6. Compound millions and thousands in Rials
    const s6 = wordsToNumberPersian('سی میلیون و چهارصد و پنجاه هزار ریال');
    expect(s6).toEqual({ amountRials: 30450000, rawNumber: 30450000, unit: 'rial' });

    // 7. Millions and thousands without currency suffix (default rial)
    const s7 = wordsToNumberPersian('یک میلیون و پانصد هزار');
    expect(s7).toEqual({ amountRials: 1500000, rawNumber: 1500000, unit: 'rial' });

    // 8. With "تمام" noise word
    const s8 = wordsToNumberPersian('پانصد هزار ریال تمام');
    expect(s8).toEqual({ amountRials: 500000, rawNumber: 500000, unit: 'rial' });

    // 9. Detailed compound phrase
    const s9 = wordsToNumberPersian('هفتاد و هشت میلیون و نهصد و بیست هزار ریال');
    expect(s9).toEqual({ amountRials: 78920000, rawNumber: 78920000, unit: 'rial' });

    // 10. Sixteens in Rials
    const s10 = wordsToNumberPersian('شانزده میلیون و چهارصد هزار ریال');
    expect(s10).toEqual({ amountRials: 16400000, rawNumber: 16400000, unit: 'rial' });

    // 11. Alternative spelling یکصد
    const s11 = wordsToNumberPersian('یکصد و ده میلیون ریال');
    expect(s11).toEqual({ amountRials: 110000000, rawNumber: 110000000, unit: 'rial' });

    // 12. Billions and hundreds of millions
    const s12 = wordsToNumberPersian('سه میلیارد و دویست میلیون ریال');
    expect(s12).toEqual({ amountRials: 3200000000, rawNumber: 3200000000, unit: 'rial' });

    // 13. Mixed digits and words: ۵۰ میلیون ریال
    const s13 = wordsToNumberPersian('۵۰ میلیون ریال');
    expect(s13).toEqual({ amountRials: 50000000, rawNumber: 50000000, unit: 'rial' });
  });

  it('handles invalid or empty verbal numbers gracefully', () => {
    expect(wordsToNumberPersian('')).toBeNull();
    expect(wordsToNumberPersian(null)).toBeNull();
    expect(wordsToNumberPersian('متن بدون هیچ عددی')).toBeNull();
  });
});

describe('parseChequeScanJson', () => {
  it('parses direct JSON string', () => {
    const jsonStr = '{"amount": 50000000, "dueDate": "1404/07/15"}';
    expect(parseChequeScanJson(jsonStr)).toEqual({ amount: 50000000, dueDate: '1404/07/15' });
  });

  it('parses markdown code fence JSON', () => {
    const md = 'درود، اطلاعات چک به شرح زیر است:\n```json\n{\n  "amount": 25000000,\n  "sayadId": "1234567890123456"\n}\n```\nامیدوارم مفید باشد.';
    expect(parseChequeScanJson(md)).toEqual({ amount: 25000000, sayadId: '1234567890123456' });
  });

  it('extracts embedded JSON with text around it', () => {
    const text = 'خروجی مدل: {"notACheque": true} پایان.';
    expect(parseChequeScanJson(text)).toEqual({ notACheque: true });
  });

  it('returns null for broken text', () => {
    expect(parseChequeScanJson('بدون جی‌سان')).toBeNull();
    expect(parseChequeScanJson(null)).toBeNull();
  });
});

describe('Shamsi to Gregorian conversion', () => {
  it('converts valid Shamsi dates accurately', () => {
    // 1404/07/15 -> 2025-10-07
    const r1 = parseAndConvertShamsiDate('1404/07/15');
    expect(r1).toEqual({ isoDate: '2025-10-07', shamsiDate: '1404/07/15' });

    // Persian digits support: ۱۴۰۴/۰۱/۰۱ -> 2025-03-21
    const r2 = parseAndConvertShamsiDate('۱۴۰۴/۰۱/۰۱');
    expect(r2).toEqual({ isoDate: '2025-03-21', shamsiDate: '1404/01/01' });
  });

  it('rejects invalid Shamsi dates', () => {
    expect(parseAndConvertShamsiDate('1404/13/01')).toBeNull(); // month > 12
    expect(parseAndConvertShamsiDate('1404/07/32')).toBeNull(); // day > 30 in 2nd half
    expect(parseAndConvertShamsiDate('invalid-date')).toBeNull();
  });
});

describe('normalizeChequeScan', () => {
  it('converts cheque amount in Rials to Tomans for ChequeForm', () => {
    const raw = {
      amount: '500,000,000', // 500M Rials
      amountWords: 'پنجاه میلیون تومان', // 50M Tomans = 500M Rials
      sayadId: '1234567890123456',
      dueDate: '1404/08/20',
      bankName: 'بانک پاسارگاد',
      payee: 'شرکت فناوری نوین',
      chequeNumber: '123456/78',
    };

    const res = normalizeChequeScan(raw);
    expect(res.success).toBe(true);
    expect(res.notACheque).toBe(false);
    // 500,000,000 Rials / 10 = 50,000,000 Tomans
    expect(res.fields.amount).toBe(50000000);
    expect(res.fields.sayadId).toBe('1234567890123456');
    expect(res.fields.dueDate).toBe('2025-11-11');
    expect(res.fields.bankId).toBe('pasargad');
    expect(res.fields.bankName).toBe('بانک پاسارگاد');
    expect(res.fields.counterparty).toBe('شرکت فناوری نوین');
    expect(res.fields.chequeNumber).toBe('123456/78');
    expect(res.warnings).toEqual([]);
  });

  it('handles Persian digits and normalizes bank aliases', () => {
    const raw = {
      amount: '۱۰۰۰۰۰۰۰۰', // 100M Rials = 10M Tomans
      sayadId: '۱۱۲۲۳۳۴۴۵۵۶۶۷۷۸۸',
      dueDate: '۱۴۰۴/۰۹/۰۱',
      bankName: 'مهر اقتصاد', // Alias for Bank Sepah
      drawer: 'علی رضایی',
    };

    const res = normalizeChequeScan(raw);
    expect(res.success).toBe(true);
    expect(res.fields.amount).toBe(10000000); // 10M Tomans
    expect(res.fields.sayadId).toBe('1122334455667788');
    expect(res.fields.bankId).toBe('sepah');
    expect(res.fields.bankName).toBe('بانک سپه');
    expect(res.fields.counterparty).toBe('علی رضایی');
  });

  it('flags warning when amount and amountWords do not match', () => {
    const raw = {
      amount: 50000000, // 50M Rials
      amountWords: 'شصت میلیون ریال', // 60M Rials
      sayadId: '1234567890123456',
      dueDate: '1404/07/15',
    };

    const res = normalizeChequeScan(raw);
    expect(res.warnings).toContain('مبلغ عددی و حروفی یکی نیست');
    expect(res.confidence.amount).toBe('low');
  });

  it('invalidates 15-digit Sayad ID with low confidence', () => {
    const raw = {
      amount: 10000000,
      sayadId: '123456789012345', // 15 digits
      dueDate: '1404/07/15',
    };

    const res = normalizeChequeScan(raw);
    expect(res.fields.sayadId).toBeNull();
    expect(res.confidence.sayadId).toBe('low');
    expect(res.warnings).toContain('شناسه صیادی باید دقیقاً ۱۶ رقم باشد.');
  });

  it('handles notACheque responses properly', () => {
    const res1 = normalizeChequeScan({ notACheque: true });
    expect(res1.success).toBe(false);
    expect(res1.notACheque).toBe(true);

    const res2 = normalizeChequeScan('این عکس یک فنجان چای است و چک نیست.');
    expect(res2.success).toBe(false);
    expect(res2.notACheque).toBe(true);
  });
});

describe('cheque scan: dates and confidence', () => {
  it('accepts Esfand 30 only in a leap year', () => {
    expect(parseAndConvertShamsiDate('1403/12/30')?.isoDate).toBe('2025-03-20');
    expect(parseAndConvertShamsiDate('1404/12/30')).toBeNull();
  });

  it('keeps the model\'s confidence for a well-formed Sayad id and a known bank', () => {
    const res = normalizeChequeScan({
      amount: 1000000, sayadId: '1234567890123456', bankName: 'بانک ملت', dueDate: '1404/08/15',
      confidence: { sayadId: 'medium', bankName: 'medium' },
    });
    expect(res.fields.sayadId).toBe('1234567890123456');
    expect(res.confidence.sayadId).toBe('medium');
    expect(res.confidence.bankName).toBe('medium');
  });
});
