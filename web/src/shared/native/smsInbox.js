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
 * its transaction (`key`: bank, direction, amount, day and time — bankSms.js). Two kinds of
 * "done" are remembered here:
 * - dismissed («رد», or a deposit that was a loan): the user's decision, for good
 * - recorded: the expense or income carries the key (`smsKey`), so the vault is the truth, not
 *   this list — reading earlier messages on request (`recheckRecorded`) lets them back in, and
 *   the SMS page drops those whose record still exists (recordedCheck.js). A record deleted since
 *   brings its message back.
 */

import { isNativeApp } from './nativeApp.js';
import { BankSms } from './nativePlugins.js';
import { parseBankSms, nativeSmsRules } from '../../utils/bankSms.js';
import { BANK_SMS_TEMPLATES } from '../../utils/bankSmsTemplates.js';

const SETTINGS_KEY = 'realrate_sms_settings';
const PENDING_KEY = 'realrate_sms_pending';
/** Recorded (and, before dismissals had their own list, dismissed) */
const HANDLED_KEY = 'realrate_sms_handled';
const DISMISSED_KEY = 'realrate_sms_dismissed';
const MAX_HANDLED = 3000;
const DAY_MS = 86_400_000;
const READ_OVERLAP_MS = 60 * 60 * 1000;
/** Where the notification of a bank message leads (BankSmsReceiver.INBOX_LINK) */
export const SMS_INBOX_LINK = 'ir.realrate.app://sms-inbox';
export const SMS_INBOX_EVENT = 'realrate:sms-inbox';

/** Every sender the templates know */
export const SMS_SENDERS = [...new Set(BANK_SMS_TEMPLATES.flatMap((b) => b.senders || []))];

/**
 * The banks whose messages are read: all of them, except those the user turned off in the app
 * settings (`disabledBanks` — the ones off are kept, so a bank added later starts on)
 */
export function activeSmsBanks(settings = getSmsSettings()) {
  const off = new Set(settings.disabledBanks || []);
  return BANK_SMS_TEMPLATES.filter((b) => !off.has(b.bankId));
}

/**
 * The active banks' senders, and how the phone itself tells a withdrawal or deposit from their
 * other messages (balance notices, ads…): only those reach the app and get a notification
 */
function activeSmsConfig() {
  const banks = activeSmsBanks();
  return { banks, senders: [...new Set(banks.flatMap((b) => b.senders || []))], rules: nativeSmsRules(banks) };
}

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

/** Withdrawals up to this many tomans get a one-tap «ثبت سریع» (no form) */
export const QUICK_RECORD_MAX = 1_000_000;
export const DEFAULT_AUTO_RECORD_MAX = 500_000;

/**
 * @returns {{ auto: boolean, lastRead: number, startedAt: number, autoRecord: boolean,
 *   autoRecordMax: number, recordCategory: string, disabledBanks: string[] }}
 *   `auto`: automatic reading, on unless turned off; `startedAt`: when it started (it never reads
 *   messages older than that). `autoRecord`: withdrawals up to `autoRecordMax` tomans are recorded
 *   as everyday expenses by themselves (off unless turned on); `recordCategory`: the category of
 *   those and of «ثبت سریع»; `disabledBanks`: banks whose messages are not read (activeSmsBanks)
 */
export function getSmsSettings() {
  const s = read(SETTINGS_KEY, {});
  return {
    auto: s.auto !== false,
    lastRead: Number(s.lastRead) || 0,
    startedAt: Number(s.startedAt) || 0,
    autoRecord: s.autoRecord === true,
    autoRecordMax: Number(s.autoRecordMax) > 0 ? Number(s.autoRecordMax) : DEFAULT_AUTO_RECORD_MAX,
    recordCategory: typeof s.recordCategory === 'string' && s.recordCategory ? s.recordCategory : 'other',
    disabledBanks: Array.isArray(s.disabledBanks) ? s.disabledBanks.filter((id) => typeof id === 'string') : [],
  };
}

export function setSmsSettings(patch) {
  write(SETTINGS_KEY, { ...getSmsSettings(), ...patch });
  if ('auto' in patch || 'disabledBanks' in patch) syncNativeSmsConfig();
  // A bank turned off: its waiting messages leave the inbox
  if ('disabledBanks' in patch) dropDisabledBanks();
  notify();
}

/** Read a bank's messages or not (all are read unless turned off) */
export function setSmsBankEnabled(bankId, enabled) {
  const off = new Set(getSmsSettings().disabledBanks);
  if (enabled) off.delete(bankId);
  else off.add(bankId);
  setSmsSettings({ disabledBanks: [...off] });
}

function dropDisabledBanks() {
  const off = new Set(getSmsSettings().disabledBanks);
  if (!off.size) return;
  const pending = getPendingSms();
  const kept = pending.filter((p) => !off.has(p.tx?.bankId));
  if (kept.length !== pending.length) write(PENDING_KEY, kept);
}

/** Tell BankSmsReceiver (runs without the app) whether to notify, and for which messages */
export async function syncNativeSmsConfig() {
  if (!isNativeApp()) return;
  try {
    const { senders, rules } = activeSmsConfig();
    // No bank left to read: nothing to notify about
    await BankSms.configure({ enabled: getSmsSettings().auto && senders.length > 0, senders, rules });
  } catch (err) {
    console.warn('SMS receiver setup failed:', err);
  }
}

/**
 * Withdrawals and deposits waiting to be recorded, newest first
 * Only what was read from each message is kept, never its text.
 * @returns {Array<{ fingerprint: string, receivedAt: number, sender: string, tx: object }>}
 */
export function getPendingSms() {
  // Entries saved by an earlier version still carry the message's text: dropped
  return read(PENDING_KEY, []).map(({ body: _body, ...item }) => item);
}

/** Take a waiting message out of the inbox, remembering its text and transaction in `listKey` */
function takeOut(fingerprint, listKey) {
  if (!fingerprint) return;
  const pending = getPendingSms();
  const item = pending.find((p) => p.fingerprint === fingerprint);
  const ids = [fingerprint, item?.tx?.key].filter(Boolean);
  const list = read(listKey, []).filter((f) => !ids.includes(f));
  list.push(...ids);
  write(listKey, list.slice(-MAX_HANDLED));
  write(PENDING_KEY, pending.filter((p) => p.fingerprint !== fingerprint));
  notify();
}

/**
 * Recorded (an expense or income now carries its key): out of the inbox, and not read again —
 * unless earlier messages are read on request and its record is gone
 * @param {string} fingerprint a waiting message's fingerprint
 */
export function markSmsHandled(fingerprint) {
  takeOut(fingerprint, HANDLED_KEY);
}

/**
 * Dismissed by the user («رد», or a deposit that was a loan): never shown again
 * @param {string} fingerprint a waiting message's fingerprint
 */
export function dismissSms(fingerprint) {
  takeOut(fingerprint, DISMISSED_KEY);
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
 * @param {{ recheckRecorded?: boolean }} [options] let recorded ones back in, to be checked against
 *   the vault (their record may have been deleted); dismissed ones stay out
 * @returns {number} how many were added
 */
export function addSmsMessages(messages, { recheckRecorded = false } = {}) {
  const handled = new Set([...read(DISMISSED_KEY, []), ...(recheckRecorded ? [] : read(HANDLED_KEY, []))]);
  const pending = getPendingSms();
  const known = new Set(pending.flatMap((p) => [p.fingerprint, p.tx?.key]).filter(Boolean));
  const { banks } = activeSmsConfig();
  let added = 0;
  for (const message of messages) {
    const receivedAt = Number(message.date) || Date.now();
    // Without a year, a message's day is the most recent one up to when it arrived
    const tx = parseBankSms(message.body, banks, { sender: message.address, today: new Date(receivedAt) });
    if (!tx) continue;
    // The same message, or the same transaction worded differently
    if ([tx.fingerprint, tx.key].some((id) => handled.has(id) || known.has(id))) continue;
    known.add(tx.fingerprint);
    known.add(tx.key);
    pending.push({ fingerprint: tx.fingerprint, receivedAt, sender: message.address, tx });
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
 * @returns {Promise<{ read: number, added: number, transactions: Array<object> }>} transactions: see readTransactions
 */
export async function readSmsSince(since, options = {}) {
  const now = Date.now();
  const { senders, rules } = activeSmsConfig();
  if (!senders.length) {
    setSmsSettings({ lastRead: now });
    return { read: 0, added: 0 };
  }
  const { messages = [] } = await BankSms.read({ senders, rules, since: Math.max(0, Math.floor(since)) });
  const added = addSmsMessages(messages, options);
  setSmsSettings({ lastRead: now });
  return { read: messages.length, added, transactions: readTransactions(messages) };
}

/**
 * Every withdrawal and deposit the templates read from these messages (one per transaction),
 * newest first — what a manual read found, waiting or not
 * @returns {Array<{ fingerprint: string, receivedAt: number, sender: string, tx: object }>}
 */
function readTransactions(messages) {
  const { banks } = activeSmsConfig();
  const seen = new Set();
  const list = [];
  for (const message of messages) {
    const receivedAt = Number(message.date) || Date.now();
    const tx = parseBankSms(message.body, banks, { sender: message.address, today: new Date(receivedAt) });
    if (!tx || seen.has(tx.key)) continue;
    seen.add(tx.key);
    list.push({ fingerprint: tx.fingerprint, receivedAt, sender: message.address, tx });
  }
  return list.sort((a, b) => b.receivedAt - a.receivedAt);
}

/**
 * What became of a read transaction that isn't waiting: 'recorded' (an expense or income carries
 * it, or one by hand matched it), 'dismissed' («رد»), or null (still waiting / never seen)
 * @param {{ fingerprint: string, tx: { key: string } }} item
 */
export function smsOutcome(item) {
  const ids = [item?.fingerprint, item?.tx?.key].filter(Boolean);
  if (read(DISMISSED_KEY, []).some((id) => ids.includes(id))) return 'dismissed';
  if (read(HANDLED_KEY, []).some((id) => ids.includes(id))) return 'recorded';
  return null;
}

/**
 * "Read the last N days"; `transactions`: everything read, waiting or not
 * @param {number} days
 * @param {{ recheckRecorded?: boolean }} [options] see addSmsMessages
 */
export function readSmsDays(days, options = {}) {
  return readSmsSince(Date.now() - days * DAY_MS, options);
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
