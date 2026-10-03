// @vitest-environment happy-dom
/**
 * smsBanks.test.js — the banks whose SMS are read: all by default; one turned off is neither read,
 * nor added to the inbox, nor given to the phone's receiver, and its waiting messages leave
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({ read: vi.fn(async () => ({ messages: [] })), configure: vi.fn(async () => {}), checkPermissions: vi.fn(), requestPermissions: vi.fn(), addListener: vi.fn() }));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({ BankSms: plugin, BiometricVault: {} }));

import {
  addSmsMessages, getPendingSms, getSmsSettings, setSmsBankEnabled, activeSmsBanks, readSmsDays, syncNativeSmsConfig,
} from '../../../web/src/shared/native/smsInbox.js';
import { BANK_SMS_TEMPLATES } from '../../../web/src/utils/bankSmsTemplates.js';

const RECEIVED = new Date(2026, 8, 28, 15, 0).getTime();
const PARSIAN = { address: 'PARSIANBANK', body: '30101540968603\nمبلغ:397,500-\nمانده:81,294,045\n07/06\n14:49', date: RECEIVED };
const BLU = { address: '+989999987641', body: 'بلو\nبرداشت پول\nسینا عزیز، 20,000,000 ریال از حساب شما پرید.\nموجودی: 77,436,726 ریال\n۱۰:۴۷\n۱۴۰۵.۰۷.۰۶', date: RECEIVED };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('which banks are read', () => {
  it('all of them by default', () => {
    expect(getSmsSettings().disabledBanks).toEqual([]);
    expect(activeSmsBanks().map((b) => b.bankId)).toEqual(BANK_SMS_TEMPLATES.map((b) => b.bankId));
  });

  it('a bank turned off: its waiting messages leave and new ones are not added; back on, they are', () => {
    expect(addSmsMessages([PARSIAN, BLU])).toBe(2);
    setSmsBankEnabled('parsian', false);
    expect(getPendingSms().map((p) => p.tx.bankId)).toEqual(['blu']);
    expect(addSmsMessages([PARSIAN])).toBe(0);
    setSmsBankEnabled('parsian', true);
    expect(addSmsMessages([PARSIAN])).toBe(1);
  });

  it('the phone reads and notifies only the banks that are on', async () => {
    setSmsBankEnabled('blu', false);
    await syncNativeSmsConfig();
    const config = plugin.configure.mock.calls.at(-1)[0];
    expect(config.senders).not.toContain('+989999987641');
    expect(config.senders).toContain('PARSIANBANK');
    expect(config.rules.some((r) => r.senders.includes('+989999987641'))).toBe(false);

    await readSmsDays(7);
    expect(plugin.read.mock.calls.at(-1)[0].senders).not.toContain('+989999987641');
  });

  it('with every bank off, nothing is read and the receiver is off', async () => {
    for (const { bankId } of BANK_SMS_TEMPLATES) setSmsBankEnabled(bankId, false);
    await syncNativeSmsConfig();
    expect(plugin.configure.mock.calls.at(-1)[0].enabled).toBe(false);
    expect(await readSmsDays(7)).toEqual({ read: 0, added: 0 });
    expect(plugin.read).not.toHaveBeenCalled();
  });
});
