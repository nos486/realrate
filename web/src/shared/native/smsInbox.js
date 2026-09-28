/**
 * smsInbox.js — Bank SMS read by the Android app, waiting to be recorded (kept on the phone)
 *
 * The app reads the bank senders' messages from the SMS inbox (BankSms plugin), reads each with
 * bankSms.js, and keeps the withdrawals here until the user records them as expenses or
 * dismisses them. Everything stays in this phone's storage: message text never goes to the
 * server (a recorded expense is encrypted like any other).
 *
 * - automatic reading (setting): on app start and every return to the app, messages since the
 *   last read; the first time, the last few days
 * - "read the last N days": on demand, from the app's settings page
 * - a message recorded or dismissed is remembered (its fingerprint) and never comes back
 */

import { isNativeApp } from './nativeApp.js';
import { BankSms } from './nativePlugins.js';
import { parseBankSms } from '../../utils/bankSms.js';
import { BANK_SMS_TEMPLATES } from '../../utils/bankSmsTemplates.js';

const SETTINGS_KEY = 'realrate_sms_settings';
const PENDING_KEY = 'realrate_sms_pending';
const HANDLED_KEY = 'realrate_sms_handled';
const MAX_HANDLED = 3000;
const DAY_MS = 86_400_000;
/** The first automatic read looks this far back */
export const FIRST_AUTO_READ_DAYS = 3;
export const SMS_INBOX_EVENT = 'realrate:sms-inbox';

/** Every sender the templates know */
export const SMS_SENDERS = [...new Set(BANK_SMS_TEMPLATES.flatMap((b) => b.senders || []))];

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the inbox simply is not kept
  }
}

const notify = () => window.dispatchEvent(new Event(SMS_INBOX_EVENT));

/** @returns {{ auto: boolean, lastRead: number }} */
export function getSmsSettings() {
  const s = read(SETTINGS_KEY, {});
  return { auto: Boolean(s.auto), lastRead: Number(s.lastRead) || 0 };
}

export function setSmsSettings(patch) {
  write(SETTINGS_KEY, { ...getSmsSettings(), ...patch });
  notify();
}

/**
 * Withdrawals waiting to be recorded, newest first
 * @returns {Array<{ fingerprint: string, receivedAt: number, sender: string, body: string, tx: object }>}
 */
export function getPendingSms() {
  return read(PENDING_KEY, []);
}

function handledSet() {
  return new Set(read(HANDLED_KEY, []));
}

/** Recorded or dismissed: never shown again */
export function markSmsHandled(fingerprint) {
  if (!fingerprint) return;
  const handled = read(HANDLED_KEY, []).filter((f) => f !== fingerprint);
  handled.push(fingerprint);
  write(HANDLED_KEY, handled.slice(-MAX_HANDLED));
  write(PENDING_KEY, getPendingSms().filter((p) => p.fingerprint !== fingerprint));
  notify();
}

/**
 * Add read messages to the inbox: only withdrawals the templates read, not handled, not there yet
 * @param {Array<{ address: string, body: string, date: number }>} messages
 * @returns {number} how many were added
 */
export function addSmsMessages(messages) {
  const handled = handledSet();
  const pending = getPendingSms();
  const known = new Set(pending.map((p) => p.fingerprint));
  let added = 0;
  for (const message of messages) {
    const receivedAt = Number(message.date) || Date.now();
    // Without a year, a message's day is the most recent one up to when it arrived
    const tx = parseBankSms(message.body, BANK_SMS_TEMPLATES, { sender: message.address, today: new Date(receivedAt) });
    if (!tx || tx.direction !== 'debit') continue;
    if (handled.has(tx.fingerprint) || known.has(tx.fingerprint)) continue;
    known.add(tx.fingerprint);
    pending.push({ fingerprint: tx.fingerprint, receivedAt, sender: message.address, body: message.body, tx });
    added++;
  }
  if (added) {
    pending.sort((a, b) => b.receivedAt - a.receivedAt);
    write(PENDING_KEY, pending);
    notify();
  }
  return added;
}

/** Whether the app may read SMS: 'granted' | 'denied' | 'prompt' | 'unavailable' */
export async function smsPermission({ request = false } = {}) {
  if (!isNativeApp()) return 'unavailable';
  try {
    const res = request ? await BankSms.requestPermissions({ permissions: ['sms'] }) : await BankSms.checkPermissions();
    return res?.sms || 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Read the bank senders' messages since `since` (epoch millis) into the inbox
 * @returns {Promise<{ read: number, added: number }>}
 */
export async function readSmsSince(since) {
  const now = Date.now();
  const { messages = [] } = await BankSms.read({ senders: SMS_SENDERS, since: Math.max(0, Math.floor(since)) });
  const added = addSmsMessages(messages);
  setSmsSettings({ lastRead: now });
  return { read: messages.length, added };
}

/** "Read the last N days" */
export function readSmsDays(days) {
  return readSmsSince(Date.now() - days * DAY_MS);
}

/**
 * The automatic read (app start, return to the app): when it is on and allowed
 * @returns {Promise<number>} how many new withdrawals were added
 */
export async function autoReadSms() {
  const { auto, lastRead } = getSmsSettings();
  if (!auto || !isNativeApp()) return 0;
  if ((await smsPermission()) !== 'granted') return 0;
  try {
    const since = lastRead || Date.now() - FIRST_AUTO_READ_DAYS * DAY_MS;
    return (await readSmsSince(since)).added;
  } catch (err) {
    console.warn('Reading SMS failed:', err);
    return 0;
  }
}

/** Start the automatic read: now and whenever the app comes back to the foreground */
export function startSmsAutoRead() {
  if (!isNativeApp()) return () => {};
  let handle = null;
  let stopped = false;
  autoReadSms();
  import('@capacitor/app').then(async ({ App }) => {
    if (stopped) return;
    handle = await App.addListener('resume', () => {
      autoReadSms();
    });
  }).catch(() => {});
  return () => {
    stopped = true;
    handle?.remove();
  };
}
