// @vitest-environment happy-dom
/**
 * smsInbox.test.js — bank SMS read by the Android app: withdrawals kept until recorded or
 * dismissed, never twice; reading since the last read; the fingerprint unlock of the vault
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({ read: vi.fn(), checkPermissions: vi.fn(), requestPermissions: vi.fn() }));
const biometric = vi.hoisted(() => ({ isAvailable: vi.fn(), has: vi.fn(), store: vi.fn(), retrieve: vi.fn(), clear: vi.fn() }));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({ BankSms: plugin, BiometricVault: biometric }));
const vault = vi.hoisted(() => ({ secret: null, unlocked: null, state: { userId: 'usr_1', vault: { wrappedKey: 'w1' } } }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  getVaultState: () => vault.state,
  getVaultUnlockSecret: () => vault.secret,
  unlockVaultWithSecret: vi.fn(async (secret) => {
    const ok = secret?.userId === vault.state.userId && secret?.wrappedKey === vault.state.vault.wrappedKey;
    if (ok) vault.unlocked = secret;
    return ok;
  }),
}));

import {
  addSmsMessages,
  getPendingSms,
  markSmsHandled,
  readSmsDays,
  autoReadSms,
  setSmsSettings,
  getSmsSettings,
  SMS_SENDERS,
} from '../../../web/src/shared/native/smsInbox.js';
import { enableBiometric, unlockWithBiometric, isBiometricEnabled } from '../../../web/src/shared/native/biometricUnlock.js';

const RECEIVED = new Date(2026, 8, 28, 15, 0).getTime();
const DEBIT = { id: '1', address: 'PARSIANBANK', body: '30101540968603\nمبلغ:397,500-\nمانده:81,294,045\n07/06\n14:49', date: RECEIVED };
const CREDIT = { id: '2', address: 'PARSIANBANK', body: '30101540968603\nمبلغ:2,582,800,000+\nمانده:2,616,820,545\n07/04\n09:22', date: RECEIVED };
const OTHER = { id: '3', address: 'PARSIANBANK', body: 'به روز رسانی همراه بانک', date: RECEIVED };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vault.secret = null;
  vault.unlocked = null;
});

describe('SMS inbox', () => {
  it('reads the Parsian sender', () => {
    expect(SMS_SENDERS).toContain('PARSIANBANK');
  });

  it('keeps withdrawals only, once each, with the day of the message', () => {
    expect(addSmsMessages([DEBIT, CREDIT, OTHER, DEBIT])).toBe(1);
    const [item] = getPendingSms();
    expect(item.tx).toMatchObject({ direction: 'debit', amount: 39750, date: '2026-09-28', bankId: 'parsian' });
    expect(addSmsMessages([DEBIT])).toBe(0);
  });

  it('a recorded or dismissed message never comes back', () => {
    addSmsMessages([DEBIT]);
    markSmsHandled(getPendingSms()[0].fingerprint);
    expect(getPendingSms()).toEqual([]);
    expect(addSmsMessages([DEBIT])).toBe(0);
  });

  it('reads the last N days from the bank senders', async () => {
    plugin.read.mockResolvedValue({ messages: [DEBIT, CREDIT] });
    const before = Date.now();
    const res = await readSmsDays(30);
    expect(res).toEqual({ read: 2, added: 1 });
    const { senders, since } = plugin.read.mock.calls[0][0];
    expect(senders).toContain('PARSIANBANK');
    expect(before - since).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
    expect(getSmsSettings().lastRead).toBeGreaterThanOrEqual(before);
  });

  it('reads automatically only when turned on and allowed, from the last read', async () => {
    plugin.checkPermissions.mockResolvedValue({ sms: 'granted' });
    plugin.read.mockResolvedValue({ messages: [DEBIT] });
    expect(await autoReadSms()).toBe(0);
    expect(plugin.read).not.toHaveBeenCalled();

    setSmsSettings({ auto: true, lastRead: 12345 });
    expect(await autoReadSms()).toBe(1);
    expect(plugin.read.mock.calls[0][0].since).toBe(12345);

    plugin.checkPermissions.mockResolvedValue({ sms: 'denied' });
    plugin.read.mockClear();
    expect(await autoReadSms()).toBe(0);
    expect(plugin.read).not.toHaveBeenCalled();
  });
});

describe('fingerprint unlock', () => {
  it('stores the unlocked key and opens the vault with it', async () => {
    vault.secret = { userId: 'usr_1', wrappedKey: 'w1', key: 'a2V5' };
    await enableBiometric();
    const stored = biometric.store.mock.calls[0][0].data;
    expect(JSON.parse(stored)).toEqual(vault.secret);

    biometric.has.mockResolvedValue({ stored: true });
    expect(await isBiometricEnabled('usr_1')).toBe(true);
    expect(await isBiometricEnabled('usr_2')).toBe(false);

    biometric.retrieve.mockResolvedValue({ data: stored });
    expect(await unlockWithBiometric()).toBe(true);
    expect(vault.unlocked).toEqual(vault.secret);
  });

  it('needs the vault unlocked to turn it on', async () => {
    await expect(enableBiometric()).rejects.toThrow();
    expect(biometric.store).not.toHaveBeenCalled();
  });

  it('a closed prompt is not an error', async () => {
    biometric.retrieve.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'CANCELED' }));
    expect(await unlockWithBiometric()).toBe(false);
  });

  it('a changed passphrase turns it off', async () => {
    biometric.retrieve.mockResolvedValue({ data: JSON.stringify({ userId: 'usr_1', wrappedKey: 'old', key: 'a2V5' }) });
    await expect(unlockWithBiometric()).rejects.toThrow(/رمز عبور رمزنگاری تغییر کرده/);
    expect(biometric.clear).toHaveBeenCalled();
  });
});
