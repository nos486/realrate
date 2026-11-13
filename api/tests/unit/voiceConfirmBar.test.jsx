// @vitest-environment happy-dom
/**
 * voiceConfirmBar.test.jsx — the bar after a voice note on a bank message: shows what was understood and
 * waits for «ثبت» (confirm) or «اصلاح» (listen again)
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoiceConfirmBar from '../../../web/src/features/sms-inbox/VoiceConfirmBar.jsx';

const review = (extra = {}) => ({ item: { tx: { direction: 'debit' } }, answer: { title: 'پیتزا', category: 'dining' }, saving: false, ...extra });

describe('VoiceConfirmBar', () => {
  it('renders nothing without a review', () => {
    const { container } = render(<VoiceConfirmBar review={null} onConfirm={() => {}} onCorrect={() => {}} onDismiss={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the title and category and calls the right handler', () => {
    const onConfirm = vi.fn();
    const onCorrect = vi.fn();
    const onDismiss = vi.fn();
    render(<VoiceConfirmBar review={review()} onConfirm={onConfirm} onCorrect={onCorrect} onDismiss={onDismiss} />);
    expect(screen.getByText('پیتزا')).toBeTruthy();
    expect(screen.getByText('رستوران و کافه')).toBeTruthy();
    fireEvent.click(screen.getByText('ثبت'));
    fireEvent.click(screen.getByText('اصلاح'));
    fireEvent.click(screen.getByLabelText('بستن'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
