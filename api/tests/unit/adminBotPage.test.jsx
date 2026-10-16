// @vitest-environment happy-dom
/**
 * adminBotPage.test.jsx — The admin's Telegram bot page: the token is never shown back, saving
 * sends only what changed, and the connection check says what is wrong
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const api = { getBotSettings: vi.fn(), saveBotSettings: vi.fn(), testBot: vi.fn(), runBotNow: vi.fn() };
vi.mock('../../../web/src/features/admin/api/adminApi.js', () => ({
  getBotSettings: (...a) => api.getBotSettings(...a),
  saveBotSettings: (...a) => api.saveBotSettings(...a),
  testBot: (...a) => api.testBot(...a),
  runBotNow: (...a) => api.runBotNow(...a),
}));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));
import AdminBotPage from '../../../web/src/features/admin/components/AdminBotPage.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATA = {
  config: { enabled: false, channel: '', feeds: null, tokenSet: false, tokenSource: '' },
  status: null,
  feeds: [{ id: 'bbc', title: 'BBC', enabled: true }],
};

describe('AdminBotPage', () => {
  it('saves the token, channel and switch together, then forgets the typed token', async () => {
    api.getBotSettings.mockResolvedValue(DATA);
    api.saveBotSettings.mockResolvedValue({
      ...DATA,
      config: { enabled: true, channel: '@realrate_news', feeds: null, tokenSet: true, tokenSource: 'admin' },
    });
    render(<AdminBotPage />);
    const tokenInput = await screen.findByLabelText(/توکن ربات/);
    fireEvent.change(tokenInput, { target: { value: '123456789:AAFakeTokenFakeTokenFakeTokenFake_12' } });
    fireEvent.change(screen.getByLabelText('کانال'), { target: { value: '@realrate_news' } });
    fireEvent.click(screen.getByRole('switch', { name: 'فعال بودن ربات' }));
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }));
    await waitFor(() => expect(api.saveBotSettings).toHaveBeenCalled());
    expect(api.saveBotSettings.mock.calls[0][0]).toMatchObject({ enabled: true, channel: '@realrate_news', feeds: null });
    await waitFor(() => expect(screen.getByLabelText(/توکن ربات/).value).toBe(''));
    expect(screen.getByText(/توکن تنظیم است/)).toBeTruthy();
  });

  it('shows what the connection check found', async () => {
    api.getBotSettings.mockResolvedValue({ ...DATA, config: { ...DATA.config, channel: '@realrate_robot', tokenSet: true, tokenSource: 'admin' } });
    api.testBot.mockResolvedValue({ ok: false, step: 'channel', bot: { username: 'realrate_robot' }, error: 'این نام کانال نیست' });
    render(<AdminBotPage />);
    fireEvent.click(await screen.findByRole('button', { name: /تست اتصال/ }));
    expect(await screen.findByText(/این نام کانال نیست/)).toBeTruthy();
    expect(toast.error).toHaveBeenCalled();
  });

  it("saves the admin's Telegram username and says the link is not made until they send /start", async () => {
    api.getBotSettings.mockResolvedValue({ ...DATA, config: { ...DATA.config, adminUsername: 'sina_admin', adminLinked: false } });
    api.saveBotSettings.mockResolvedValue({ ...DATA, config: { ...DATA.config, adminUsername: 'sina2', adminLinked: false }, webhook: { ok: false, error: 'bad url' } });
    render(<AdminBotPage />);
    expect(await screen.findByText(/هنوز متصل نیست/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/یوزرنیم تلگرام ادمین/), { target: { value: '@sina2' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }));
    await waitFor(() => expect(api.saveBotSettings).toHaveBeenCalled());
    expect(api.saveBotSettings.mock.calls[0][0]).toMatchObject({ adminUsername: '@sina2' });
    // The webhook failing is said, though the settings are saved
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
  });
});
