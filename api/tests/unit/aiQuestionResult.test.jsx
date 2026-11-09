// @vitest-environment happy-dom
/**
 * aiQuestionResult.test.jsx — A spoken question is answered on the device, one answer per sentence
 * the assistant rewrote, and the `question` intent changes nothing (no review, no undo)
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const ask = vi.fn();
vi.mock('../../../web/src/features/reports/useAsk.js', () => ({
  useAsk: () => ({
    state: { status: 'done', query: {}, records: [], error: '' },
    answer: { count: 2, total: 300000, average: 150000, byCategory: [], top: [{ id: 'a', title: 'نان', date: '2026-11-08', amount: 100000 }] },
    query: { intent: 'sum', period: { key: 'thisMonth', params: {} } },
    ask,
  }),
}));

import QuestionResult from '../../../web/src/features/ai/QuestionResult.jsx';
import { AI_INTENTS } from '../../../web/src/features/ai/aiIntents.js';

describe('question intent', () => {
  afterEach(() => { cleanup(); ask.mockClear(); });

  it('is read-only', () => {
    expect(AI_INTENTS.question.readOnly).toBe(true);
    expect(AI_INTENTS.question.apply).toBeUndefined();
  });

  it('asks each sentence once and shows its answer', async () => {
    render(<QuestionResult answer={{ questions: ['خرج خوراک این ماه', 'خرج خوراک مهر ۱۴۰۴'] }} />);
    expect(screen.getByText('خرج خوراک این ماه')).toBeTruthy();
    expect(screen.getByText('خرج خوراک مهر ۱۴۰۴')).toBeTruthy();
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask).toHaveBeenCalledWith('خرج خوراک این ماه');
  });
});
