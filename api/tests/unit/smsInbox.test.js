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
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true, smsEnabled: () => true }));
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
  dropRecordedSms,
  getPendingSms,
  markSmsHandled,
  dismissSms,
  restoreSms,
  markSmsHandledMany,
  readSmsRange,
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

  it('the same transaction worded differently is one message', () => {
    const reworded = { ...DEBIT, body: DEBIT.body.replace('مبلغ:397,500-', 'مبلغ : -397,500') };
    expect(addSmsMessages([DEBIT, reworded])).toBe(1);
    markSmsHandled(getPendingSms()[0].fingerprint);
    // Handled: neither wording comes back
    expect(addSmsMessages([reworded])).toBe(0);
  });

  it('a transaction already recorded (its key on an expense or income) leaves the inbox', () => {
    addSmsMessages([DEBIT, CREDIT]);
    const debitKey = getPendingSms().find((p) => p.tx.direction === 'debit').tx.key;
    expect(dropRecordedSms(new Set([debitKey, 'other|key']))).toBe(1);
    expect(getPendingSms().map((p) => p.tx.direction)).toEqual(['credit']);
    expect(addSmsMessages([DEBIT])).toBe(0);
  });

  it('keeps what was read, never the message\'s text; one-time passwords are not kept at all', () => {
    const otp = { id: '9', address: 'PARSIANBANK', body: 'رمز پویا شما: 551234', date: RECEIVED };
    expect(addSmsMessages([DEBIT, otp])).toBe(1);
    expect(getPendingSms()[0]).not.toHaveProperty('body');
    expect(JSON.stringify(localStorage)).not.toContain('551234');
  });

  it('a recorded or dismissed message does not come back by itself', () => {
    addSmsMessages([DEBIT, CREDIT]);
    markSmsHandled(getPendingSms().find((p) => p.tx.direction === 'debit').fingerprint);
    dismissSms(getPendingSms()[0].fingerprint);
    expect(getPendingSms()).toEqual([]);
    expect(addSmsMessages([DEBIT, CREDIT])).toBe(0);
  });

  it('reading again with recheckRecorded lets recorded ones back (to check their record), never dismissed ones', () => {
    addSmsMessages([DEBIT, CREDIT]);
    markSmsHandled(getPendingSms().find((p) => p.tx.direction === 'debit').fingerprint);
    dismissSms(getPendingSms()[0].fingerprint);
    expect(addSmsMessages([DEBIT, CREDIT], { recheckRecorded: true })).toBe(1);
    expect(getPendingSms().map((p) => p.tx.direction)).toEqual(['debit']);
  });

  it('a dismissed message can be restored: waiting again, and read again by later reads', () => {
    addSmsMessages([DEBIT]);
    const item = getPendingSms()[0];
    dismissSms(item.fingerprint);
    expect(addSmsMessages([DEBIT])).toBe(0);
    expect(restoreSms(item)).toBe(true);
    expect(getPendingSms().map((p) => p.fingerprint)).toEqual([item.fingerprint]);
    // Not dismissed any more: a repeat read does not duplicate it, and a recorded one can't be "restored"
    expect(addSmsMessages([DEBIT])).toBe(0);
    markSmsHandled(item.fingerprint);
    expect(restoreSms(item)).toBe(false);
  });

  it('several recorded at once leave the inbox with one announcement, and are remembered', () => {
    addSmsMessages([DEBIT, CREDIT]);
    const events = vi.fn();
    window.addEventListener('realrate:sms-inbox', events);
    markSmsHandledMany(getPendingSms().map((p) => p.fingerprint));
    window.removeEventListener('realrate:sms-inbox', events);
    expect(events).toHaveBeenCalledTimes(1);
    expect(getPendingSms()).toEqual([]);
    expect(addSmsMessages([DEBIT, CREDIT])).toBe(0);
  });

  it('reports how far a long read has come: windows read, then messages parsed', async () => {
    plugin.read.mockReset();
    plugin.read.mockResolvedValue({ messages: [DEBIT, CREDIT] });
    const steps = [];
    await readSmsDays(65, { onProgress: (p) => steps.push(p) });
    const reading = steps.filter((p) => p.stage === 'reading');
    expect(reading.map((p) => p.done)).toEqual([1, 2, 3]);
    expect(reading.every((p) => p.total === 3)).toBe(true);
    expect(steps.at(-1)).toMatchObject({ stage: 'parsing', done: 2, total: 2 });
  });

  it('reads a range of days: from the start of the first to the end of the last, without moving the automatic read', async () => {
    plugin.read.mockReset();
    plugin.read.mockResolvedValue({ messages: [DEBIT] });
    setSmsSettings({ lastRead: 123 });
    const res = await readSmsRange('2026-09-20', '2026-09-28');
    const { since, until } = plugin.read.mock.calls[0][0];
    expect(since).toBe(Date.parse('2026-09-20T00:00:00'));
    expect(until).toBe(Date.parse('2026-09-28T00:00:00') + 86_400_000);
    expect(res).toMatchObject({ read: 1, added: 1 });
    expect(res.transactions).toHaveLength(1);
    expect(getSmsSettings().lastRead).toBe(123);
    // Backwards is no range
    expect(() => readSmsRange('2026-09-28', '2026-09-20')).toThrow();
  });

  it('reads the last N days from the bank senders', async () => {
    plugin.read.mockResolvedValue({ messages: [DEBIT, CREDIT] });
    const before = Date.now();
    const res = await readSmsDays(30);
    expect(res).toMatchObject({ read: 2, added: 2 });
    const { senders, since } = plugin.read.mock.calls[0][0];
    expect(senders).toContain('PARSIANBANK');
    expect(before - since).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
    expect(getSmsSettings().lastRead).toBeGreaterThanOrEqual(before);
  });

  it('reads a long span (a year) a window at a time, each message once; a century is the most', async () => {
    // Every window answers; the newest window also returns a message the next one repeats
    plugin.read.mockReset();
    plugin.read.mockImplementation(async ({ since, until }) => ({
      messages: until && until - since < 31 * 86_400_000 && since > Date.now() - 31 * 86_400_000
        ? [DEBIT, CREDIT]
        : [CREDIT],
    }));
    const before = Date.now();
    const res = await readSmsDays(365);
    const calls = plugin.read.mock.calls.map(([arg]) => arg);
    // 30-day windows back to a year ago, each with an end, the newest first
    expect(calls.length).toBe(Math.ceil(365 / 30));
    expect(calls.every((c) => c.until > c.since && c.until - c.since <= 30 * 86_400_000 + 1)).toBe(true);
    expect(calls[0].until).toBeGreaterThanOrEqual(before);
    expect(before - calls.at(-1).since).toBeGreaterThanOrEqual(365 * 86_400_000 - 1000);
    // Consecutive windows touch: no gap between them
    for (let i = 1; i < calls.length; i++) expect(calls[i].until).toBe(calls[i - 1].since + 1);
    // The same message from two windows counts once
    expect(res.read).toBe(2);

    plugin.read.mockClear();
    await readSmsDays(100_000);
    const oldest = Math.min(...plugin.read.mock.calls.map(([arg]) => arg.since));
    expect(Date.now() - oldest).toBeLessThanOrEqual(36_500 * 86_400_000 + 1000);
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
    expect(plugin.configure).toHaveBeenCalledWith({ enabled: false, senders: SMS_SENDERS, rules: expect.arrayContaining([expect.objectContaining({ patterns: expect.any(Array) })]) });

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
    expect(plugin.configure).toHaveBeenCalledWith({ enabled: true, senders: SMS_SENDERS, rules: expect.arrayContaining([expect.objectContaining({ patterns: expect.any(Array) })]) });
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
      smsKey: 'parsian|debit|39750|2026-09-28|14:49',
    });
  });

  it('a deposit becomes an income draft', () => {
    const tx = parseBankSms(CREDIT.body, BANK_SMS_TEMPLATES, { today });
    expect(smsIncomeDraft(tx)).toMatchObject({
      title: 'واریز پارسیان', amount: 258280000, incomeDate: '2026-09-26', smsFingerprint: tx.fingerprint,
    });
    expect(smsIncomeDraft(tx).category).toBeUndefined();
  });

  it("a bank's interest deposit is titled after the message and starts as investment income", () => {
    const tx = parseBankSms('*بانک شهر*\nسود\nواريز به:700814110204\nمبلغ:377,743ريال\nموجودي:89,371,480ريال\n1405/07/1 00:41:16', BANK_SMS_TEMPLATES, { sender: 'Bank Shahr' });
    const draft = smsIncomeDraft(tx);
    expect(draft).toMatchObject({ category: 'investment', amount: 37774, incomeDate: '2026-09-23' });
    expect(draft.title).toMatch(/^سود /);
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
