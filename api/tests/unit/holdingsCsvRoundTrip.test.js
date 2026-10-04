/**
 * holdingsCsvRoundTrip.test.js — A portfolio exported to CSV (one row per ledger entry) imports
 * back: purchases and holdings as the buy side, sales as sales, expense payments skipped; the
 * "paid with another asset" fields survive; older files (one row per manual holding) still import
 */

import { describe, it, expect } from 'vitest';
import { buildHoldingsCsv, parseCsvText, buildRows } from '../../../web/src/features/portfolio/utils/holdingsCsv.js';
import { buildAssetLedgers } from '../../../web/src/features/portfolio/utils/assetLedger.js';

function importCsv(csv) {
  const [headerRow, ...dataRows] = parseCsvText(csv.replace(/^﻿/, '')).filter((r) => r.length > 1);
  const headerIndex = Object.fromEntries(headerRow.map((h, i) => [h.trim(), i]));
  return buildRows(headerIndex, dataRows);
}

const { assets } = buildAssetLedgers({
  priceMap: { gold_18k: 8_000_000, usd: 100_000 },
  holdings: [
    {
      id: 'h1', assetId: 'gold_18k', amount: 5, buyPrice: 6_000_000, buyDate: '1404/01/15', notes: 'خرید با دلار',
      referenceAssetId: 'usd', referenceQuantity: 512,
    },
    { id: 'h2', assetId: 'usd', amount: 100, buyPrice: 0, buyDate: '' },
  ],
  transactions: [
    { id: 't1', assetId: 'gold_18k', transactionType: 'sell', quantity: 2, unitPrice: 9_000_000, transactionDate: '1404/06/01', notes: 'فروش' },
    { id: 't2', assetId: 'usd', transactionType: 'spend', quantity: 30, unitPrice: 95_000, transactionDate: '1404/07/01', expenseId: 'exp_1' },
  ],
});

describe('portfolio CSV round trip', () => {
  const csv = buildHoldingsCsv(assets);

  it('writes every entry, with what is left of each purchase and its own profit or loss', () => {
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(1 + 4);
    expect(csv).toContain('"فروش"');
    expect(csv).toContain('"پرداخت هزینه"');
    expect(csv).toContain('"موجودی"');
    // The gold purchase: 3 grams left; open (3 × 2,000,000) + realized (2 × 3,000,000)
    const gold = lines.find((l) => l.startsWith('"خرید"'));
    expect(gold).toContain('"3"');
    expect(gold).toContain('"12000000"');
  });

  it('imports purchases and holdings as the buy side and sales as sales; expense payments are skipped', () => {
    const rows = importCsv(csv);
    const byKind = (k) => rows.filter((r) => r.kind === k);
    expect(byKind('buy')).toHaveLength(2);
    expect(byKind('sell')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'skipped')).toHaveLength(1);

    expect(byKind('buy').find((r) => r.holding.assetId === 'gold_18k').holding).toMatchObject({
      amount: 5, buyPrice: 6_000_000, buyDate: '1404/01/15', notes: 'خرید با دلار',
      referenceAssetId: 'usd', referenceQuantity: 512,
    });
    expect(byKind('buy').find((r) => r.holding.assetId === 'usd').holding).toMatchObject({ amount: 100, buyPrice: 0, buyDate: '' });
    expect(byKind('sell')[0].transaction).toMatchObject({
      assetId: 'gold_18k', transactionType: 'sell', quantity: 2, unitPrice: 9_000_000, transactionDate: '1404/06/01', notes: 'فروش',
    });
  });

  it('a file of an older version (one row per manual holding) still imports', () => {
    const old = '﻿"نام دارایی","مقدار","قیمت خرید (تومان)","تاریخ خرید","شناسه سیستمی","منبع"\r\n'
      + '"دلار","100","50000","1403/01/01","usd","دستی"\r\n'
      + '"طلا","2","","","gold_18k","تراکنش‌ها"';
    const rows = importCsv(old);
    expect(rows[0]).toMatchObject({ status: 'ok', kind: 'buy', holding: { assetId: 'usd', amount: 100, buyPrice: 50000, buyDate: '1403/01/01' } });
    expect(rows[1].status).toBe('skipped');
  });

  it('a sale without a price or a day is not imported', () => {
    const bad = '"نوع ثبت","نام دارایی","شناسه سیستمی","مقدار","قیمت واحد (تومان)","تاریخ"\r\n"فروش","دلار","usd","5","",""';
    expect(importCsv(bad)[0].status).toBe('invalid');
  });
});
