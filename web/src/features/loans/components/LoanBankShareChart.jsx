/**
 * LoanBankShareChart.jsx — How the loans split across banks
 */

import React, { useMemo, useState } from 'react';
import { BankLogo } from '../../../shared/banks/index.js';
import DonutChart, { ChartToggle } from '../../../shared/ui/DonutChart.jsx';

const MEASURES = [
  { id: 'principal', label: 'مبلغ وام', field: 'totalPrincipal', centerLabel: 'کل وام‌ها' },
  { id: 'remaining', label: 'مانده بدهی', field: 'totalRemaining', centerLabel: 'کل بدهی' },
];

const otherBanksLabel = (count) => `سایر (${count.toLocaleString('fa-IR')} بانک)`;

/**
 * @param {{ groups: Array<{ key: string, name: string, bank: object,
 *   totalPrincipal: number, totalRemaining: number }> }} props
 */
export default function LoanBankShareChart({ groups = [], hideValues = false }) {
  const [measureId, setMeasureId] = useState('principal');
  const measure = MEASURES.find((m) => m.id === measureId) || MEASURES[0];

  // Ordered by total loan amount in both views, so a bank keeps its slice color while switching
  const ranked = useMemo(() => [...groups].sort((a, b) => b.totalPrincipal - a.totalPrincipal), [groups]);
  const items = useMemo(
    () =>
      ranked.map((g) => ({
        key: g.key,
        label: g.name,
        shortLabel: g.bank?.shortName || g.name,
        value: g[measure.field],
        icon: <BankLogo bank={g.bank} size={22} />,
      })),
    [ranked, measure.field]
  );

  return (
    <DonutChart
      title="سهم بانک‌ها از وام‌ها"
      items={items}
      masked={hideValues}
      centerLabel={measure.centerLabel}
      otherLabel={otherBanksLabel}
      emptyMessage="همه وام‌ها تسویه شده‌اند — بدهی باقیمانده‌ای وجود ندارد."
      headerExtra={<ChartToggle options={MEASURES} value={measureId} onChange={setMeasureId} label="معیار نمودار" />}
    />
  );
}
