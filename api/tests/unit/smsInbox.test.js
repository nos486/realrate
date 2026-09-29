// @vitest-environment happy-dom
/**
 * smsInbox.test.js — bank SMS read by the Android app: withdrawals and deposits kept until
 * recorded or dismissed, never twice; automatic reading; what a recorded message becomes; the
 * fingerprint unlock of the vault
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({
  read: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  configure: vi.fn(),
  addListener: vi.fn(),
}));
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
  enableSmsReading,
  SMS_SENDERS,
} from '../../../web/src/shared/native/smsInbox.js';
import { enableBiometric, unlockWithBiometric, isBiometricEnabled } from '../../../web/src/shared/native/biometricUnlock.js';
import { smsExpenseDraft, smsIncomeDraft } from '../../../web/src/features/sms-inbox/smsDrafts.js';
import { parseBankSms } from '../../../web/src/utils/bankSms.js';
import { BANK_SMS_TEMPLATES } from '../../../web/src/utils/bankSmsTemplates.js';

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
  it('reads the banks\' senders', () => {
    expect(SMS_SENDERS).toEqual(expect.arrayContaining(['PARSIANBANK', '+989999987641']));
  });

  it('keeps withdrawals and deposits, once each, with the day of the message', () => {
    expect(addSmsMessages([DEBIT, CREDIT, OTHER, DEBIT])).toBe(2);
    const byDirection = Object.fromEntries(getPendingSms().map((p) => [p.tx.direction, p.tx]));
    expect(byDirection.debit).toMatchObject({ amount: 39750, date: '2026-09-28', bankId: 'parsian' });
    expect(byDirection.credit).toMatchObject({ amount: 258280000, date: '2026-09-26' });
    expect(addSmsMessages([DEBIT, CREDIT])).toBe(0);
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
    expect(res).toEqual({ read: 2, added: 2 });
    const { senders, since } = plugin.read.mock.calls[0][0];
    expect(senders).toContain('PARSIANBANK');
    expect(before - since).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
    expect(getSmsSettings().lastRead).toBeGreaterThanOrEqual(before);
  });

  it('reads automatically (on unless turned off) when allowed, only messages from then on', async () => {
    expect(getSmsSettings().auto).toBe(true);
    plugin.checkPermissions.mockResolvedValue({ sms: 'granted' });
    plugin.read.mockResolvedValue({ messages: [DEBIT] });

    // The first time nothing older is read: it starts now
    const before = Date.now();
    expect(await autoReadSms()).toBe(0);
    expect(plugin.read).not.toHaveBeenCalled();
    expect(getSmsSettings().startedAt).toBeGreaterThanOrEqual(before);

    setSmsSettings({ auto: false });
    expect(await autoReadSms()).toBe(0);
    expect(plugin.read).not.toHaveBeenCalled();
    // Turning it on or off tells the SMS receiver (notifications)
    expect(plugin.configure).toHaveBeenCalledWith({ enabled: false, senders: SMS_SENDERS });

    const lastRead = Date.now();
    setSmsSettings({ auto: true, startedAt: lastRead - 86_400_000, lastRead });
    expect(await autoReadSms()).toBe(1);
    // An hour of overlap: a message the SMS app stored late is not skipped
    expect(plugin.read.mock.calls[0][0].since).toBe(lastRead - 3_600_000);

    // …but never before automatic reading started
    plugin.read.mockClear();
    setSmsSettings({ startedAt: lastRead - 60_000, lastRead });
    await autoReadSms();
    expect(plugin.read.mock.calls[0][0].since).toBe(lastRead - 60_000);

    plugin.checkPermissions.mockResolvedValue({ sms: 'denied' });
    plugin.read.mockClear();
    expect(await autoReadSms()).toBe(0);
    expect(plugin.read).not.toHaveBeenCalled();
  });
});

describe('turning automatic reading on', () => {
  it('asks for SMS and notifications, and reads nothing older (from now on only)', async () => {
    plugin.requestPermissions.mockResolvedValue({ sms: 'granted', notifications: 'granted' });
    const before = Date.now();
    expect(await enableSmsReading()).toEqual({ permission: 'granted' });
    expect(plugin.requestPermissions).toHaveBeenCalledWith({ permissions: ['sms', 'notifications'] });
    expect(plugin.read).not.toHaveBeenCalled();
    expect(getSmsSettings()).toMatchObject({ auto: true });
    expect(getSmsSettings().startedAt).toBeGreaterThanOrEqual(before);
    expect(plugin.configure).toHaveBeenCalledWith({ enabled: true, senders: SMS_SENDERS });
  });

  it('refused: nothing changes', async () => {
    plugin.requestPermissions.mockResolvedValue({ sms: 'denied' });
    expect(await enableSmsReading()).toEqual({ permission: 'denied' });
    expect(getSmsSettings().startedAt).toBe(0);
  });
});

describe('recording a message', () => {
  const today = new Date(RECEIVED);

  it('a withdrawal becomes an expense draft', () => {
    const tx = parseBankSms(DEBIT.body, BANK_SMS_TEMPLATES, { today });
    const accounts = [{ id: 'acc_1', bankId: 'parsian', accountNumber: '30101540968603' }];
    expect(smsExpenseDraft(tx, accounts)).toMatchObject({
      amount: 39750, date: '2026-09-28', accountId: 'acc_1', source: 'sms', bankId: 'parsian', notes: 'پیامک پارسیان · ساعت ۱۴:۴۹',
    });
  });

  it('a deposit becomes an income draft', () => {
    const tx = parseBankSms(CREDIT.body, BANK_SMS_TEMPLATES, { today });
    expect(smsIncomeDraft(tx)).toMatchObject({
      title: 'واریز پارسیان', amount: 258280000, incomeDate: '2026-09-26', smsFingerprint: tx.fingerprint,
    });
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
