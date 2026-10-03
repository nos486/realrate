/**
 * d1Repositories.test.js — Every repository's SQL on real SQLite (what D1 runs): accounts,
 * sessions, sign-in links, the admin's lists, settings, custom banks, the encrypted vault with its
 * reminder index, reminder emails, web push, portfolios and the older plaintext tables.
 *
 * Many repositories log a failed query instead of throwing, so each step checks what it read back.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { dbUpsertUser, dbGetUserById, dbRecordUserActivity, dbRecordUserClient, dbUpdateUserSettings, dbGetUserByShareSlug, dbSaveHomeLayout, dbGetHomeLayout } from '../../src/repositories/user.repository.js';
import { dbSaveSession, dbGetSession, dbDeleteSession, dbDeleteExpiredSessions } from '../../src/repositories/session.repository.js';
import {
  dbCreatePasswordUser, dbGetUserAuthByEmail, dbGetUserAuthById, dbMarkEmailVerified, dbRecordLogin,
  dbCreateAuthToken, dbConsumeAuthToken, dbSetUserPassword, dbDeleteUserSessions,
} from '../../src/repositories/account.repository.js';
import { dbGetUsersPage, dbGetUserStats, dbSetUserDisabled, dbGetUserDetail, dbGetDailyGrowth } from '../../src/repositories/admin.repository.js';
import { getGlobalSettings, saveGlobalSettings } from '../../src/repositories/settings.repository.js';
import { dbListCustomBanks, dbCreateCustomBank, dbDeleteCustomBank } from '../../src/repositories/customBanks.repository.js';
import {
  dbSaveUserVault, dbGetUserVault, dbHasUserVault, dbPutVaultRecord, dbDeleteVaultRecord, dbResetUserVaultData, dbUserHasPlaintextData,
} from '../../src/repositories/vault.repository.js';
import {
  dbSaveAlertEmailPrefs, dbGetAlertEmailPrefs, dbGetReminderEmailRecipients, dbGetRemindersForUsers,
  dbRecordAlertEmailSent, dbGetSentHistoryForUsers, dbPurgeOldAlertEmailSent,
} from '../../src/repositories/alertEmail.repository.js';
import {
  dbSavePushSubscription, dbGetPushSubscriptionsForUser, dbSavePushReminders, dbGetDuePushReminders, dbDeletePushReminder, dbDeletePushSubscription,
} from '../../src/repositories/push.repository.js';
import { dbGetUserPortfolios, dbCreatePortfolio, dbUpdatePortfolio, dbGetPortfolioByShareSlug, dbDeletePortfolio } from '../../src/repositories/portfolio.repository.js';
import { dbAddPortfolioHolding, dbGetPortfolioHoldings } from '../../src/repositories/holdings.repository.js';
import { dbCreateTransaction, dbGetTransactionsByPortfolio } from '../../src/repositories/transactionRepository.js';
import { dbCreateIncome, dbGetUserIncomes, dbUpdateIncome, dbDeleteIncome } from '../../src/repositories/incomes.repository.js';
import { dbCreateCheque, dbGetUserCheques } from '../../src/repositories/cheques.repository.js';
import { dbCreateLoan, dbGetUserLoans, dbGetLoanDocument } from '../../src/repositories/loans.repository.js';

let env;
const CIPHER = (n) => `enc:e2ee:v1:${n}`;
const NOW = new Date().toISOString();

beforeAll(() => {
  resetD1SchemaCache();
  env = { DB: sqliteD1() };
});
afterAll(() => env.DB.close());

describe('accounts and sessions', () => {
  it('Google sign-in upserts the user; a second sign-in counts it', async () => {
    const user = { id: 'u1', email: 'a@x.com', name: 'A', picture: '', role: 'user', createdAt: NOW, lastLogin: NOW };
    await dbUpsertUser(env, user);
    await dbUpsertUser(env, { ...user, name: 'A2' });
    const row = await env.DB.prepare('SELECT name, login_count, google_linked FROM users WHERE id = ?').bind('u1').first();
    expect(row).toEqual({ name: 'A2', login_count: 2, google_linked: 1 });
    expect((await dbGetUserById(env, 'u1'))?.email).toBe('a@x.com');
    await dbRecordUserActivity(env, 'u1');
    await dbRecordUserActivity(env, 'u1');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM user_activity').first('n')).toBe(1);
    await dbRecordUserClient(env, 'u1', { platform: 'android', version: '1.0.5' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM user_clients WHERE user_id = ?').bind('u1').first('n')).toBe(1);
  });

  it('settings, share slug and home layout', async () => {
    await dbUpdateUserSettings(env, 'u1', { customName: 'آ', shareSlug: 'abc123', sharePassword: '', shareEnabled: true });
    expect((await dbGetUserByShareSlug(env, 'abc123'))?.id).toBe('u1');
    await dbSaveHomeLayout(env, 'u1', { sections: [{ id: 's1' }] });
    expect((await dbGetHomeLayout(env, 'u1')).sections[0].id).toBe('s1');
  });

  it('sessions: saved, read, expired ones purged', async () => {
    await dbSaveSession(env, { token: 't1', userId: 'u1', email: 'a@x.com', name: 'A', picture: '', role: 'user', createdAt: NOW });
    expect((await dbGetSession(env, 't1'))?.userId).toBe('u1');
    await dbSaveSession(env, { token: 't-old', userId: 'u1', email: 'a@x.com', name: 'A', picture: '', role: 'user', createdAt: NOW }, -10);
    expect(await dbGetSession(env, 't-old')).toBeNull();
    await dbDeleteExpiredSessions(env);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first('n')).toBe(1);
    await dbDeleteSession(env, 't1');
    expect(await dbGetSession(env, 't1')).toBeNull();
  });

  it('email accounts: create, verify, one-time links, password, sign out everywhere', async () => {
    const created = await dbCreatePasswordUser(env, { email: 'B@X.com', name: 'B', passwordHash: 'h1' });
    expect(created?.id).toBeTruthy();
    const byEmail = await dbGetUserAuthByEmail(env, 'b@x.com');
    expect(byEmail).toMatchObject({ email: 'b@x.com', emailVerified: false, passwordHash: 'h1' });
    await dbMarkEmailVerified(env, byEmail.id);
    await dbRecordLogin(env, byEmail.id);
    expect((await dbGetUserAuthById(env, byEmail.id)).emailVerified).toBe(true);
    const token = await dbCreateAuthToken(env, byEmail.id, 'reset', 3600);
    expect(await dbConsumeAuthToken(env, token, 'reset')).toBe(byEmail.id);
    expect(await dbConsumeAuthToken(env, token, 'reset')).toBeNull(); // used once
    await dbSetUserPassword(env, byEmail.id, 'h2');
    expect((await dbGetUserAuthById(env, byEmail.id)).passwordHash).toBe('h2');
    await dbSaveSession(env, { token: 'tb1', userId: byEmail.id, email: 'b@x.com', name: 'B', picture: '', role: 'user', createdAt: NOW });
    await dbSaveSession(env, { token: 'tb2', userId: byEmail.id, email: 'b@x.com', name: 'B', picture: '', role: 'user', createdAt: NOW });
    await dbDeleteUserSessions(env, byEmail.id, { exceptToken: 'tb2' });
    expect(await dbGetSession(env, 'tb1')).toBeNull();
    expect((await dbGetSession(env, 'tb2'))?.userId).toBe(byEmail.id);
  });
});

describe('admin', () => {
  it('lists, counts, details and daily growth', async () => {
    const page = await dbGetUsersPage(env, { q: 'x.com', filter: 'all', limit: 10 });
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.users.length).toBe(page.total);
    const stats = await dbGetUserStats(env);
    expect(stats.registeredUsers).toBeGreaterThanOrEqual(2);
    await dbSetUserDisabled(env, 'u1', true);
    expect((await dbGetUserAuthById(env, 'u1')).disabled).toBe(true);
    await dbSetUserDisabled(env, 'u1', false);
    const detail = await dbGetUserDetail(env, 'u1');
    expect(detail?.user?.id ?? detail?.id).toBe('u1');
    const growth = await dbGetDailyGrowth(env, 7);
    expect(Array.isArray(growth) ? growth.length : growth?.days?.length).toBeGreaterThan(0);
  });

  it('global settings', async () => {
    await saveGlobalSettings(env, { announcement: 'سلام', maintenanceMode: false });
    expect((await getGlobalSettings(env, true)).announcement).toBe('سلام');
  });

  it('custom banks', async () => {
    const created = await dbCreateCustomBank(env, 'u1', 'بانک من');
    const bank = created?.bank || created;
    expect((await dbListCustomBanks(env, 'u1')).map((b) => b.name)).toContain('بانک من');
    await dbDeleteCustomBank(env, 'u1', bank.id);
    expect(await dbListCustomBanks(env, 'u1')).toEqual([]);
  });
});

describe('the encrypted vault', () => {
  it('records with their reminder index, deletion, and the reset', async () => {
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER('k') });
    expect(await dbHasUserVault(env, 'u1')).toBe(true);
    expect((await dbGetUserVault(env, 'u1')).wrappedKey).toBe(CIPHER('k'));
    await dbPutVaultRecord(env, 'u1', 'loan', 'ln1', {
      payload: CIPHER(1),
      recordDate: '2026-10-01',
      reminder: { kind: 'loan', recordId: 'ln1', dueDate: '2026-10-10', intervalMonths: 1, remaining: 5, direction: '', muted: false },
    });
    await dbPutVaultRecord(env, 'u1', 'income', 'in1', { payload: CIPHER(2), recordDate: '2026-10-02' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ?').bind('u1').first('n')).toBe(2);
    expect(await env.DB.prepare('SELECT remaining FROM vault_reminders WHERE record_id = ?').bind('ln1').first('remaining')).toBe(5);
    await dbDeleteVaultRecord(env, 'u1', 'loan', 'ln1');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM vault_reminders').first('n')).toBe(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM vault_tombstones WHERE id = ?').bind('ln1').first('n')).toBe(1);
    expect(await dbUserHasPlaintextData(env, 'u1')).toBe(false);
    await dbResetUserVaultData(env, 'u1');
    expect(await dbHasUserVault(env, 'u1')).toBe(false);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ?').bind('u1').first('n')).toBe(0);
  });
});

describe('reminders: email and web push', () => {
  it('email preferences, recipients, reminders and the sent history', async () => {
    const auth = await dbGetUserAuthByEmail(env, 'b@x.com');
    await dbSaveUserVault(env, auth.id, { salt: 's', wrappedKey: CIPHER('kb') });
    await dbSaveAlertEmailPrefs(env, auth.id, { enabled: true, sources: ['loan', 'cheque'], leadDays: [3, 0], sendOverdue: true });
    expect(await dbGetAlertEmailPrefs(env, auth.id)).toMatchObject({ enabled: true, leadDays: [3, 0] });
    const recipients = await dbGetReminderEmailRecipients(env);
    expect(recipients.map((r) => r.userId)).toContain(auth.id);
    await dbPutVaultRecord(env, auth.id, 'cheque', 'ch1', {
      payload: CIPHER(3),
      recordDate: '2026-10-05',
      reminder: { kind: 'cheque', recordId: 'ch1', dueDate: '2026-10-05', intervalMonths: 0, remaining: 1, direction: '', muted: false },
    });
    expect((await dbGetRemindersForUsers(env, [auth.id])).map((r) => r.recordId)).toEqual(['ch1']);
    await dbRecordAlertEmailSent(env, [{ userId: auth.id, kind: 'cheque', recordId: 'ch1', dueDate: '2026-10-05', reason: 'lead:3' }]);
    expect((await dbGetSentHistoryForUsers(env, [auth.id])).map((s) => s.reason)).toEqual(['lead:3']);
    await dbPurgeOldAlertEmailSent(env, 120);
    expect(await dbGetSentHistoryForUsers(env, [auth.id])).toHaveLength(1);
  });

  it('push subscriptions and sealed reminders', async () => {
    const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
    await dbSavePushSubscription(env, 'u1', { deviceId: 'dev_12345678', subscription });
    expect(await dbGetPushSubscriptionsForUser(env, 'u1')).toHaveLength(1);
    const sealed = JSON.stringify({ iv: 'iv', data: 'data' });
    await dbSavePushReminders(env, 'u1', {
      deviceId: 'dev_12345678',
      items: [{ kind: 'loan', recordId: 'ln1', dueDate: '2026-10-10', reason: 'due', fireDate: '2026-10-10', sealed }],
    });
    const due = await dbGetDuePushReminders(env, '2026-10-10');
    expect(due.map((d) => d.recordId)).toEqual(['ln1']);
    await dbDeletePushReminder(env, 'dev_12345678', 'loan', 'ln1', '2026-10-10', 'due');
    expect(await dbGetDuePushReminders(env, '2026-10-10')).toEqual([]);
    await dbDeletePushSubscription(env, 'u1', 'dev_12345678');
    expect(await dbGetPushSubscriptionsForUser(env, 'u1')).toEqual([]);
  });
});

describe('portfolios and the older plaintext tables', () => {
  it('portfolios, holdings and transactions', async () => {
    const portfolios = await dbGetUserPortfolios(env, 'u1'); // the default one is created
    expect(portfolios.length).toBeGreaterThanOrEqual(1);
    const created = await dbCreatePortfolio(env, 'u1', { name: 'دوم' });
    const id = created?.id || created?.portfolio?.id;
    await dbUpdatePortfolio(env, id, 'u1', { name: 'دوم', shareSlug: 'pf-share', shareEnabled: true });
    expect((await dbGetPortfolioByShareSlug(env, 'pf-share'))?.id).toBe(id);
    await dbAddPortfolioHolding(env, { userId: 'u1', portfolioId: id, assetId: 'usd', amount: 10, buyPrice: 90000, buyDate: '1405/01/01' });
    expect((await dbGetPortfolioHoldings(env, 'u1', id)).length).toBe(1);
    await dbCreateTransaction(env, { userId: 'u1', portfolioId: id, encryptedPayload: CIPHER(9) });
    expect((await dbGetTransactionsByPortfolio(env, 'u1', id)).length).toBe(1);
    await dbDeletePortfolio(env, id, 'u1');
    expect((await dbGetUserPortfolios(env, 'u1')).some((p) => p.id === id)).toBe(false);
  });

  it('incomes, cheques and loans', async () => {
    const income = await dbCreateIncome(env, 'u1', { title: 'حقوق', category: 'salary', amount: 1000, incomeDate: '2026-10-01', notes: '', recurringId: '' });
    expect((await dbGetUserIncomes(env, 'u1')).length).toBe(1);
    await dbUpdateIncome(env, 'u1', income.id, { title: 'حقوق', category: 'salary', amount: 1200, incomeDate: '2026-10-01', notes: '', recurringId: '' });
    expect((await dbGetUserIncomes(env, 'u1'))[0].amount).toBe(1200);
    await dbDeleteIncome(env, 'u1', income.id);
    expect(await dbGetUserIncomes(env, 'u1')).toEqual([]);

    await dbCreateCheque(env, 'u1', { direction: 'issued', amount: 5000, dueDate: '2026-11-01', counterparty: 'علی', status: 'pending' });
    expect((await dbGetUserCheques(env, 'u1')).length).toBe(1);

    const loan = await dbCreateLoan(env, 'u1', { title: 'وام', principalAmount: 12_000_000, annualInterestRate: 18, installmentCount: 12, intervalMonths: 1, startDate: '2026-10-01' });
    expect(loan?.id || loan?.loan?.id).toBeTruthy();
    expect((await dbGetUserLoans(env, 'u1')).length).toBe(1);
    const doc = await dbGetLoanDocument(env, 'u1', loan?.id || loan?.loan?.id);
    expect(doc).toBeTruthy();
  });
});
