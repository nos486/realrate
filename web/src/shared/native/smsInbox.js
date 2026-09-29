/**
 * smsInbox.js — Bank SMS read by the Android app, waiting to be recorded (kept on the phone)
 *
 * The app reads the bank senders' messages from the SMS inbox (BankSms plugin), reads each with
 * bankSms.js, and keeps withdrawals and deposits here until the user records them (an expense or
 * an income) or dismisses them. Everything stays in this phone's storage: message text never
 * goes to the server (a recorded expense or income is encrypted like any other).
 *
 * Automatic, on by default once the SMS permission is given, for messages arriving **from then
 * on** (`startedAt`; nothing older is read by itself):
 * - a bank message arriving shows a notification (BankSmsReceiver) that opens the SMS page, and
 *   the running app reads it right away
 * - on app start and every return to the app: messages since the last read
 * Older messages are read only on request ("read the last N days", on the SMS page).
 *
 * The same transaction never shows twice: a message is known by its text (`fingerprint`) and by
 * its transaction (`key`: bank, direction, amount, day and time — bankSms.js). Recorded or
 * dismissed ones are remembered here; recorded ones also carry the key in the encrypted expense or
 * income (`smsKey`), which the SMS page checks (dropRecordedSms), so it holds across devices and
 * reinstalls.
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
const READ_OVERLAP_MS = 60 * 60 * 1000;
/** Where the notification of a bank message leads (BankSmsReceiver.INBOX_LINK) */
export const SMS_INBOX_LINK = 'ir.realrate.app://sms-inbox';
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

/**
 * @returns {{ auto: boolean, lastRead: number, startedAt: number }} automatic reading is on unless
 *   turned off; `startedAt`: when it started (it never reads messages older than that)
 */
export function getSmsSettings() {
  const s = read(SETTINGS_KEY, {});
  return { auto: s.auto !== false, lastRead: Number(s.lastRead) || 0, startedAt: Number(s.startedAt) || 0 };
}

export function setSmsSettings(patch) {
  write(SETTINGS_KEY, { ...getSmsSettings(), ...patch });
  if ('auto' in patch) syncNativeSmsConfig();
  notify();
}

/** Tell BankSmsReceiver (runs without the app) whether to notify, and for which senders */
export async function syncNativeSmsConfig() {
  if (!isNativeApp()) return;
  try {
    await BankSms.configure({ enabled: getSmsSettings().auto, senders: SMS_SENDERS });
  } catch (err) {
    console.warn('SMS receiver setup failed:', err);
  }
}

/**
 * Withdrawals and deposits waiting to be recorded, newest first
 * @returns {Array<{ fingerprint: string, receivedAt: number, sender: string, body: string, tx: object }>}
 */
export function getPendingSms() {
  return read(PENDING_KEY, []);
}

function handledSet() {
  return new Set(read(HANDLED_KEY, []));
}

/**
 * Recorded or dismissed: never shown again (the message's text and its transaction)
 * @param {string} fingerprint a waiting message's fingerprint
 */
export function markSmsHandled(fingerprint) {
  if (!fingerprint) return;
  const pending = getPendingSms();
  const item = pending.find((p) => p.fingerprint === fingerprint);
  const ids = [fingerprint, item?.tx?.key].filter(Boolean);
  const handled = read(HANDLED_KEY, []).filter((f) => !ids.includes(f));
  handled.push(...ids);
  write(HANDLED_KEY, handled.slice(-MAX_HANDLED));
  write(PENDING_KEY, pending.filter((p) => p.fingerprint !== fingerprint));
  notify();
}

/**
 * Drop the waiting messages whose transaction is already recorded (an expense or income with
 * that `smsKey`)
 * @param {Iterable<string>} recordedKeys
 * @returns {number} how many were dropped
 */
export function dropRecordedSms(recordedKeys) {
  const recorded = new Set(recordedKeys);
  const drop = getPendingSms().filter((p) => p.tx?.key && recorded.has(p.tx.key));
  drop.forEach((p) => markSmsHandled(p.fingerprint));
  return drop.length;
}

/**
 * Add read messages to the inbox: those the templates read, not handled, not there yet
 * @param {Array<{ address: string, body: string, date: number }>} messages
 * @returns {number} how many were added
 */
export function addSmsMessages(messages) {
  const handled = handledSet();
  const pending = getPendingSms();
  const known = new Set(pending.flatMap((p) => [p.fingerprint, p.tx?.key]).filter(Boolean));
  let added = 0;
  for (const message of messages) {
    const receivedAt = Number(message.date) || Date.now();
    // Without a year, a message's day is the most recent one up to when it arrived
    const tx = parseBankSms(message.body, BANK_SMS_TEMPLATES, { sender: message.address, today: new Date(receivedAt) });
    if (!tx) continue;
    // The same message, or the same transaction worded differently
    if ([tx.fingerprint, tx.key].some((id) => handled.has(id) || known.has(id))) continue;
    known.add(tx.fingerprint);
    known.add(tx.key);
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

/**
 * Whether the app may read SMS: 'granted' | 'denied' | 'prompt' | 'unavailable'. Asking also asks
 * for notifications (Android 13+), for the notification of each bank message.
 */
export async function smsPermission({ request = false } = {}) {
  if (!isNativeApp()) return 'unavailable';
  try {
    const res = request
      ? await BankSms.requestPermissions({ permissions: ['sms', 'notifications'] })
      : await BankSms.checkPermissions();
    return res?.sms || 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Turn automatic reading on (asks for the permissions): messages arriving from now on
 * @returns {Promise<{ permission: string }>}
 */
export async function enableSmsReading() {
  const permission = await smsPermission({ request: true });
  if (permission !== 'granted') return { permission };
  const now = Date.now();
  const { startedAt } = getSmsSettings();
  setSmsSettings({ auto: true, ...(startedAt ? {} : { startedAt: now, lastRead: now }) });
  return { permission };
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
  const { auto, lastRead, startedAt } = getSmsSettings();
  if (!auto || !isNativeApp()) return 0;
  if ((await smsPermission()) !== 'granted') return 0;
  // The first time: from now on only
  if (!startedAt) {
    const now = Date.now();
    setSmsSettings({ startedAt: now, lastRead: now });
    return 0;
  }
  try {
    // Overlapping the last read: a message stored late by the SMS app is not skipped (repeats
    // are dropped by their fingerprint); never before automatic reading started
    const since = Math.max(startedAt, (lastRead || startedAt) - READ_OVERLAP_MS);
    return (await readSmsSince(since)).added;
  } catch (err) {
    console.warn('Reading SMS failed:', err);
    return 0;
  }
}

const isInboxLink = (url) => String(url || '').startsWith(SMS_INBOX_LINK);
// The link the app was launched with stays the same for the whole run: act on it once
let launchLinkHandled = false;
/** A message is announced before the SMS app has stored it: read a moment later */
const AFTER_RECEIVE_MS = 4000;

/**
 * Start the automatic reading: now, whenever the app comes back to the foreground, and when a
 * bank message arrives while it is open. `onOpenInbox` runs when the app is opened from a bank
 * message's notification.
 * @returns {() => void} stops
 */
export function startSmsAutoRead({ onOpenInbox } = {}) {
  if (!isNativeApp()) return () => {};
  const handles = [];
  let stopped = false;
  const keep = (handle) => {
    if (stopped) handle.remove();
    else handles.push(handle);
  };

  syncNativeSmsConfig();
  autoReadSms();
  BankSms.addListener('smsReceived', () => {
    setTimeout(() => autoReadSms(), AFTER_RECEIVE_MS);
  }).then(keep).catch(() => {});
  import('@capacitor/app').then(async ({ App }) => {
    if (stopped) return;
    keep(await App.addListener('resume', () => autoReadSms()));
    keep(await App.addListener('appUrlOpen', ({ url }) => {
      if (isInboxLink(url)) onOpenInbox?.();
    }));
    const launch = await App.getLaunchUrl().catch(() => null);
    if (!stopped && !launchLinkHandled && isInboxLink(launch?.url)) {
      launchLinkHandled = true;
      onOpenInbox?.();
    }
  }).catch(() => {});
  return () => {
    stopped = true;
    handles.splice(0).forEach((h) => h.remove());
  };
}
