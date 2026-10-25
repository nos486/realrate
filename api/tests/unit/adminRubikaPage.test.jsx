// @vitest-environment happy-dom
/**
 * adminRubikaPage.test.jsx — The admin's Rubika bot page: the token is never shown back, saving
 * sends the settings together, and the link code is shown for the admin to send to the bot
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const api = { getRubikaSettings: vi.fn(), saveRubikaSettings: vi.fn(), testRubika: vi.fn(), runRubikaNow: vi.fn(), newRubikaLinkCode: vi.fn() };
vi.mock('../../../web/src/features/admin/api/adminApi.js', () => ({
  getRubikaSettings: (...a) => api.getRubikaSettings(...a),
  saveRubikaSettings: (...a) => api.saveRubikaSettings(...a),
  testRubika: (...a) => api.testRubika(...a),
  runRubikaNow: (...a) => api.runRubikaNow(...a),
  newRubikaLinkCode: (...a) => api.newRubikaLinkCode(...a),
}));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));
import AdminRubikaPage from '../../../web/src/features/admin/components/AdminRubikaPage.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CONFIG = { enabled: false, channel: '', feeds: null, tokenSet: false, tokenSource: '', adminLinked: false, linkCode: '', dailyReport: false };
const DATA = {
  config: CONFIG, status: null,
  feeds: [{ id: 'bbc', title: 'BBC', enabled: true }],
  channels: [{ id: 'tasnimnews', title: 'tasnimnews', enabled: true }, { id: 'akhbarefori', title: 'akhbarefori', enabled: true }],
};
const TOKEN = 'BCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';

describe('AdminRubikaPage', () => {
  it('saves the token, channel and switch together, then forgets the typed token', async () => {
    api.getRubikaSettings.mockResolvedValue(DATA);
    api.saveRubikaSettings.mockResolvedValue({ ...DATA, config: { ...CONFIG, enabled: true, channel: '@realrate_news', tokenSet: true, tokenSource: 'admin' } });
    render(<AdminRubikaPage />);
    fireEvent.change(await screen.findByLabelText(/توکن ربات روبیکا/), { target: { value: TOKEN } });
    fireEvent.change(screen.getByLabelText('کانال روبیکا'), { target: { value: '@realrate_news' } });
    fireEvent.click(screen.getByRole('switch', { name: 'فعال بودن ربات روبیکا' }));
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }));
    await waitFor(() => expect(api.saveRubikaSettings).toHaveBeenCalled());
    expect(api.saveRubikaSettings.mock.calls[0][0]).toMatchObject({ enabled: true, channel: '@realrate_news', feeds: null, token: TOKEN });
    await waitFor(() => expect(screen.getByLabelText(/توکن ربات روبیکا/).value).toBe(''));
    expect(screen.getByText(/توکن تنظیم است/)).toBeTruthy();
  });

  it('makes a link code only while the bot is on, and shows it', async () => {
    api.getRubikaSettings.mockResolvedValueOnce({ ...DATA, config: { ...CONFIG, tokenSet: true, tokenSource: 'admin' } });
    render(<AdminRubikaPage />);
    expect((await screen.findByRole('button', { name: /ساخت کد اتصال/ })).disabled).toBe(true);
    cleanup();
    const on = { ...CONFIG, enabled: true, channel: '@realrate_news', tokenSet: true, tokenSource: 'admin' };
    api.getRubikaSettings.mockResolvedValue({ ...DATA, config: on });
    api.newRubikaLinkCode.mockResolvedValue({ code: '123456', config: { ...on, linkCode: '123456' } });
    render(<AdminRubikaPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ساخت کد اتصال/ }));
    expect(await screen.findByText('123456')).toBeTruthy();
  });

  it('shows what the connection check found', async () => {
    api.getRubikaSettings.mockResolvedValue({ ...DATA, config: { ...CONFIG, channel: '@realrate_news', tokenSet: true, tokenSource: 'admin' } });
    api.testRubika.mockResolvedValue({ ok: false, step: 'channel', bot: { username: 'rr_bot' }, error: 'کانال پیدا نشد' });
    render(<AdminRubikaPage />);
    fireEvent.click(await screen.findByRole('button', { name: /تست اتصال/ }));
    expect(await screen.findByText(/کانال پیدا نشد/)).toBeTruthy();
    expect(toast.error).toHaveBeenCalled();
  });

  it('turns the domestic news on and picks its channels', async () => {
    api.getRubikaSettings.mockResolvedValue(DATA);
    api.saveRubikaSettings.mockResolvedValue({ ...DATA, config: { ...CONFIG, domestic: true, domesticChannels: ['tasnimnews'] } });
    render(<AdminRubikaPage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'ارسال اخبار داخلی در کانال روبیکا' }));
    fireEvent.click(screen.getByLabelText(/همه‌ی کانال‌ها/));
    fireEvent.click(screen.getByLabelText(/@akhbarefori/));
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }));
    await waitFor(() => expect(api.saveRubikaSettings).toHaveBeenCalled());
    expect(api.saveRubikaSettings.mock.calls[0][0]).toMatchObject({ domestic: true, domesticChannels: ['tasnimnews'] });
  });
});
