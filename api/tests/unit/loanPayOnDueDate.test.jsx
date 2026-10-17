// @vitest-environment happy-dom
/**
 * loanPayOnDueDate.test.jsx — A past-due unpaid installment has «در سررسید پرداخت شد»
 * (web/src/features/loans/components/LoanInstallmentsTable.jsx): it settles that installment on its
 * own due day and amount, not on today
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: async () => true, toast: { error: () => {} } }) }));
vi.mock('../../../web/src/shared/utils/dates.js', () => ({ todayIso: () => '2026-03-10' }));

const { default: LoanInstallmentsTable } = await import('../../../web/src/features/loans/components/LoanInstallmentsTable.jsx');

afterEach(cleanup);

const inst = (n, dueDate, extra = {}) => ({ id: `inst_l_${n}`, installmentNumber: n, dueDate, totalAmount: 100, isPaid: false, ...extra });

describe('paying an installment on its due day', () => {
  it('is offered only for past-due unpaid installments, and pays on the due day at its amount', async () => {
    const onMarkPaid = vi.fn(async () => ({}));
    render(<LoanInstallmentsTable
      loan={{ id: 'l', remainingBalance: 300 }}
      installments={[inst(1, '2026-01-05', { isPaid: true, paidDate: '2026-01-05' }), inst(2, '2026-02-05'), inst(3, '2026-04-05')]}
      onMarkPaid={onMarkPaid}
    />);
    const buttons = screen.getAllByText('در سررسید پرداخت شد');
    // Only installment 2 (desktop table + mobile card)
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(onMarkPaid).toHaveBeenCalledWith('inst_l_2', { paidDate: '2026-02-05', paidAmount: 100, cascade: false, accountId: '' }));
  });
});
