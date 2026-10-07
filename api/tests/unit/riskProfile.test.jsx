// @vitest-environment happy-dom
/**
 * riskProfile.test.jsx — the risk-tolerance test: scoring, profile bands, validation and the modal
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  RISK_RATIOS,
  RISK_PROFILES,
  RISK_ASSET_CLASSES,
  scoreRisk,
  profileOf,
  mixItemsOf,
  outcomeOf,
  validateRiskResult,
} from '../../src/domain/riskProfile.js';
import RiskMixPie from '../../../web/src/features/portfolio/components/RiskMixPie.jsx';
import RiskToleranceModal from '../../../web/src/features/portfolio/components/RiskToleranceModal.jsx';

afterEach(cleanup);

describe('scoreRisk', () => {
  it('is the mean share of the amount at risk', () => {
    expect(scoreRisk(Array(6).fill(500), 1000)).toBe(50);
    expect(scoreRisk([1000, 1000, 1000, 0, 0, 0], 1000)).toBe(50);
    expect(scoreRisk([0, 0, 0, 0, 0, 0], 1000)).toBe(0);
  });
  it('clamps answers and tolerates a bad total or missing answers', () => {
    expect(scoreRisk(Array(6).fill(5000), 1000)).toBe(100);
    expect(scoreRisk([1000], 1000)).toBe(16.7);
    expect(scoreRisk([1, 2], 0)).toBe(0);
  });
});

describe('profiles', () => {
  it('cover 0–100 without gaps and each suggests a mix adding up to 100', () => {
    expect(RISK_PROFILES[0].from).toBe(0);
    expect(RISK_PROFILES.at(-1).to).toBe(100);
    RISK_PROFILES.forEach((p, i) => {
      if (i > 0) expect(p.from).toBe(RISK_PROFILES[i - 1].to);
      expect(Object.values(p.allocation).reduce((s, v) => s + v, 0)).toBe(100);
      Object.keys(p.allocation).forEach((k) => expect(RISK_ASSET_CLASSES[k]).toBeTruthy());
    });
  });
  it('maps scores to their band', () => {
    expect(profileOf(0).id).toBe('conservative');
    expect(profileOf(20).id).toBe('cautious');
    expect(profileOf(75).id).toBe('bold');
    expect(profileOf(100).id).toBe('aggressive');
  });
  it('hold the standard five-level mixes', () => {
    expect(RISK_PROFILES.map((p) => Object.values(p.allocation))).toEqual([
      [80, 10, 10, 0], [60, 15, 23, 2], [40, 15, 40, 5], [20, 15, 55, 10], [5, 10, 65, 20],
    ]);
  });
  it('gives the gain as ratio × loss', () => {
    expect(outcomeOf(1000, 2.75)).toEqual({ loss: 1000, gain: 2750 });
  });
});

describe('validateRiskResult', () => {
  it('computes score and profile and bounds the answers', () => {
    const { value } = validateRiskResult({ totalAsset: 1000, answers: [500, 500, 500, 500, 500, 9999] });
    expect(value.answers[5]).toBe(1000);
    expect(value.score).toBe(58.3);
    expect(value.profile).toBe('balanced');
  });
  it('refuses an incomplete test or a missing amount', () => {
    expect(validateRiskResult({ totalAsset: 0, answers: Array(6).fill(0) }).error).toBeTruthy();
    expect(validateRiskResult({ totalAsset: 1000, answers: [1, 2] }).error).toBeTruthy();
    expect(validateRiskResult({ totalAsset: 1000, answers: [1, 2, 3, 4, 5, -1] }).error).toBeTruthy();
  });
});

describe('RiskToleranceModal', () => {
  it('walks through every question, saves once and shows the result', async () => {
    const onSave = vi.fn(async (input) => validateRiskResult(input).value);
    render(<RiskToleranceModal portfolioValue={1000000} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByText('شروع آزمون'));
    fireEvent.click(screen.getByText(/فهمیدم/));
    for (let i = 0; i < RISK_RATIOS.length; i += 1) {
      fireEvent.change(screen.getByRole('slider'), { target: { value: '500' } });
      fireEvent.click(screen.getByText(i === RISK_RATIOS.length - 1 ? 'تأیید و نتیجه' : 'تأیید و بعدی'));
    }
    await waitFor(() => expect(screen.getByText('نتیجهٔ آزمون')).toBeTruthy());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({ totalAsset: 1000000, answers: Array(6).fill(500000) });
    expect(screen.getByRole('heading', { name: 'متعادل' })).toBeTruthy();
  });

  it('opens on the saved result and can start over', () => {
    const result = validateRiskResult({ totalAsset: 1000, answers: Array(6).fill(750) }).value;
    render(<RiskToleranceModal result={result} onSave={vi.fn()} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'ریسک‌پذیر' })).toBeTruthy();
    fireEvent.click(screen.getByText('از نو'));
    expect(screen.getByText('چقدر ریسک‌پذیر هستید؟')).toBeTruthy();
  });

  it('starts from the portfolio value and lets the user change it', () => {
    render(<RiskToleranceModal portfolioValue={2500000} onSave={vi.fn()} onClose={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input.value.replace(/\D/g, '')).toBe('2500000');
    fireEvent.change(input, { target: { value: '4000000' } });
    expect(screen.getByText(/برگشت به ارزش پورتفو/)).toBeTruthy();
    expect(screen.getByText('شروع آزمون').closest('button').disabled).toBe(false);
  });

  it('asks for an amount when the portfolio is empty', () => {
    render(<RiskToleranceModal portfolioValue={0} onSave={vi.fn()} onClose={() => {}} />);
    const start = screen.getByText('شروع آزمون').closest('button');
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1000000' } });
    expect(start.disabled).toBe(false);
  });
});

describe('RiskMixPie', () => {
  it('lists the profile mix with its shares', () => {
    render(<RiskMixPie items={mixItemsOf(profileOf(30).allocation)} />);
    expect(screen.getByText('درآمد ثابت')).toBeTruthy();
    expect(screen.getByText('۶۰٪')).toBeTruthy();
    expect(screen.getByText('ارز دیجیتال')).toBeTruthy();
    // A class with a zero share is left out of the pie
    cleanup();
    render(<RiskMixPie items={mixItemsOf(profileOf(0).allocation)} />);
    expect(screen.queryByText('ارز دیجیتال')).toBeNull();
  });
});
