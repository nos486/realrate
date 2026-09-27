// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { ChequeScanButton } from '../../../web/src/features/cheques/components/scan/ChequeScanButton.jsx';
import { ChequeScanResult } from '../../../web/src/features/cheques/components/scan/ChequeScanResult.jsx';

const mockUseAuth = vi.fn();
vi.mock('../../../web/src/features/auth/index.js', () => ({
  useAuth: () => mockUseAuth(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChequeScanButton Component', () => {
  it('does not render for regular user without cheque_scan feature', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'regular@example.com', features: [] },
    });

    const { container } = render(<ChequeScanButton onClick={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the button for a user with the cheque_scan feature', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'user@realrate.ir', role: 'user', features: ['cheque_scan'] },
    });

    render(<ChequeScanButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /اسکن چک/i })).toBeDefined();
  });

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn();
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', email: 'admin@realrate.ir', role: 'admin', features: ['cheque_scan'] },
    });

    render(<ChequeScanButton onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button', { name: /اسکن چک/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('ChequeScanResult Component', () => {
  const mockResult = {
    success: true,
    fields: {
      amount: 50000000,
      dueDate: '2026-10-15',
      sayadId: '1234567890123456',
      chequeNumber: '987654',
      bankId: 'melli',
      bankName: 'بانک ملی ایران',
      counterparty: 'شرکت تجارت فردا',
      notes: 'شعبه مرکزی',
    },
    confidence: {
      amount: 'high',
      dueDate: 'high',
      sayadId: 'high',
      chequeNumber: 'medium',
      bankName: 'high',
      counterparty: 'low',
    },
    warnings: ['مبلغ چک بالا است'],
    raw: '{"amount": 500000000}',
    model: 'gemini-3.5-flash',
    durationMs: 1420,
  };

  const imageMeta = {
    originalBytes: 2500000,
    bytes: 280000,
    width: 1600,
    height: 900,
  };

  const asAdmin = () => mockUseAuth.mockReturnValue({
    user: { id: 'admin-1', role: 'admin', features: ['cheque_scan', 'cheque_scan_debug'] },
  });
  const asUser = () => mockUseAuth.mockReturnValue({
    user: { id: 'user-1', role: 'user', features: ['cheque_scan'] },
  });

  it('renders extracted fields and warnings correctly', () => {
    asUser();
    render(
      <ChequeScanResult
        result={mockResult}
        imageMeta={imageMeta}
        onFillForm={() => {}}
        onNewPhoto={() => {}}
      />
    );

    expect(screen.getByText('مبلغ چک بالا است')).toBeDefined();
    expect(screen.getByText(/تومان/)).toBeDefined();
    expect(screen.getByText('1234567890123456')).toBeDefined();
    expect(screen.getByText('بانک ملی ایران')).toBeDefined();
    expect(screen.getByText('شرکت تجارت فردا')).toBeDefined();
    expect(screen.getByText('پایین')).toBeDefined(); // low confidence badge
  });

  it('hides the accuracy tools and raw answer from regular users', () => {
    asUser();
    render(<ChequeScanResult result={mockResult} imageMeta={imageMeta} onFillForm={() => {}} onNewPhoto={() => {}} />);
    expect(screen.queryAllByTitle('درست است')).toHaveLength(0);
    expect(screen.queryByText(/خروجی خام/)).toBeNull();
  });

  it('allows marking fields as confirmed or rejected for admin accuracy rating', () => {
    asAdmin();
    render(
      <ChequeScanResult
        result={mockResult}
        imageMeta={imageMeta}
        onFillForm={() => {}}
        onNewPhoto={() => {}}
      />
    );

    const checkButtons = screen.getAllByTitle('درست است');
    fireEvent.click(checkButtons[0]);

    expect(screen.getByText(/[1۱] از [7۷] فیلد تأیید شد/)).toBeDefined();
  });

  it('calls onFillForm when "پر کردن فرم چک" button is clicked', () => {
    const handleFill = vi.fn();
    asUser();
    render(
      <ChequeScanResult
        result={mockResult}
        imageMeta={imageMeta}
        onFillForm={handleFill}
        onNewPhoto={() => {}}
      />
    );

    const fillButton = screen.getByRole('button', { name: /پر کردن فرم چک/i });
    fireEvent.click(fillButton);

    expect(handleFill).toHaveBeenCalledWith(mockResult.fields, mockResult.confidence);
  });
});
