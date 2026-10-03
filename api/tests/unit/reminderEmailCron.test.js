/**
 * reminderEmailCron.test.js — Tests for reminder email preferences, test email, and daily cron job
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetAlertEmailPrefs,
  handlePutAlertEmailPrefs,
  handleSendTestEmailAlert,
} from '../../src/handlers/alertEmailRoutes.js';
import { runReminderEmailDigest } from '../../src/jobs/reminderEmail.job.js';
import {
  dbGetAlertEmailPrefs,
  dbSaveAlertEmailPrefs,
  dbRecordAlertEmailSent,
  dbPurgeOldAlertEmailSent,
} from '../../src/repositories/alertEmail.repository.js';
import { withErrorHandler } from '../../src/middlewares/errorHandler.js';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/lib/email.js', () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
  isEmailConfigured: vi.fn(() => true),
  reminderDigestEmail: vi.fn((opts = {}) => ({
    subject: opts.subject || 'خلاصه یادآوری‌های مالی شما در ریل‌ریت',
    html: '<p>digest</p>',
    text: 'digest',
  })),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { sendEmail, isEmailConfigured } from '../../src/lib/email.js';

function createMockDb() {
  const prefs = new Map();
  const sent = [];
  const reminders = [];
  const users = new Map();

  return {
    prefs,
    sent,
    reminders,
    users,
    async batch(stmts) {
      for (const s of stmts) await s.run();
      return [];
    },
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let bound = [];
      const stmt = {
        bind(...args) {
          bound = args;
          return stmt;
        },
        async first() {
          if (q.includes('FROM alert_email_prefs WHERE user_id = ?')) {
            const userId = bound[0];
            return prefs.get(userId) || null;
          }
          return null;
        },
        async all() {
          if (q.includes('FROM alert_email_prefs p JOIN users u')) {
            const results = [];
            for (const [uid, p] of prefs.entries()) {
              const u = users.get(uid);
              if (p.enabled && u && u.email_verified && !u.disabled && u.email) {
                results.push({
                  user_id: uid,
                  email: u.email,
                  enabled: p.enabled,
                  sources: p.sources,
                  lead_days: p.lead_days,
                  send_overdue: p.send_overdue,
                  include_cheque_direction: p.include_cheque_direction,
                });
              }
            }
            return { results };
          }
          if (q.includes('FROM vault_reminders WHERE user_id IN')) {
            const userIds = bound;
            const results = reminders.filter(r => userIds.includes(r.user_id) && !r.muted);
            return { results };
          }
          if (q.includes('FROM alert_email_sent WHERE user_id IN')) {
            const results = sent.filter(s => bound.includes(s.user_id));
            return { results };
          }
          return { results: [] };
        },
        async run() {
          if (q.startsWith('INSERT INTO alert_email_prefs')) {
            const [user_id, enabled, sources, lead_days, send_overdue, include_cheque_direction, updated_at] = bound;
            prefs.set(user_id, {
              user_id,
              enabled,
              sources,
              lead_days,
              send_overdue,
              include_cheque_direction,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('UPDATE vault_reminders SET direction')) {
            const [user_id] = bound;
            for (const r of reminders) {
              if (r.user_id === user_id && r.kind === 'cheque') {
                r.direction = '';
              }
            }
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('INSERT INTO alert_email_sent')) {
            const [user_id, kind, record_id, due_date, reason, sent_at] = bound;
            sent.push({ user_id, kind, record_id, due_date, reason, sent_at });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM alert_email_sent WHERE sent_at < ?')) {
            const cutoff = bound[0];
            const initLen = sent.length;
            const filtered = sent.filter(s => s.sent_at >= cutoff);
            sent.length = 0;
            sent.push(...filtered);
            return { meta: { changes: initLen - filtered.length } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

describe('Alert Email System (Part A)', () => {
  let db;
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    env = { DB: db };
  });

  describe('Alert Email Routes', () => {
    const wrap = withErrorHandler;

    it('returns 401 for unauthenticated user on GET and PUT and TEST', async () => {
      getAuthenticatedUser.mockResolvedValueOnce(null);
      const resGet = await wrap(handleGetAlertEmailPrefs)(new Request('https://api.realrate.ir/api/alerts/email'), env);
      expect(resGet.status).toBe(401);

      getAuthenticatedUser.mockResolvedValueOnce(null);
      const resPut = await wrap(handlePutAlertEmailPrefs)(
        new Request('https://api.realrate.ir/api/alerts/email', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        }),
        env
      );
      expect(resPut.status).toBe(401);

      getAuthenticatedUser.mockResolvedValueOnce(null);
      const resTest = await wrap(handleSendTestEmailAlert)(
        new Request('https://api.realrate.ir/api/alerts/email/test', { method: 'POST' }),
        env
      );
      expect(resTest.status).toBe(401);
    });

    it('returns preferences for authenticated user', async () => {
      getAuthenticatedUser.mockResolvedValueOnce({
        id: 'usr_1',
        email: 'user@example.com',
        emailVerified: true,
      });

      const res = await wrap(handleGetAlertEmailPrefs)(new Request('https://api.realrate.ir/api/alerts/email'), env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.email).toBe('user@example.com');
      expect(data.emailVerified).toBe(true);
      expect(data.emailConfigured).toBe(true);
      expect(data.prefs.enabled).toBe(false);
      expect(data.prefs.sources).toEqual(['loan', 'cheque', 'recurring_income']);
    });

    it('updates preferences and clears cheque direction when disabled', async () => {
      getAuthenticatedUser.mockResolvedValue({
        id: 'usr_1',
        email: 'user@example.com',
        emailVerified: true,
      });

      db.reminders.push({
        user_id: 'usr_1',
        kind: 'cheque',
        record_id: 'chk_1',
        due_date: '2026-10-10',
        direction: 'issued',
        muted: 0,
      });

      const putReq = new Request('https://api.realrate.ir/api/alerts/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          leadDays: [3, 0],
          includeChequeDirection: false,
        }),
      });

      const res = await wrap(handlePutAlertEmailPrefs)(putReq, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.prefs.enabled).toBe(true);
      expect(data.prefs.leadDays).toEqual([3, 0]);

      // Reminders should have direction cleared
      expect(db.reminders[0].direction).toBe('');
    });

    it('sends test email when requested', async () => {
      getAuthenticatedUser.mockResolvedValueOnce({
        id: 'usr_1',
        email: 'user@example.com',
        emailVerified: true,
      });

      const req = new Request('https://api.realrate.ir/api/alerts/email/test', { method: 'POST' });
      const res = await wrap(handleSendTestEmailAlert)(req, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('آزمایشی'),
        })
      );
    });

    it('rejects test email if user email is unverified', async () => {
      getAuthenticatedUser.mockResolvedValueOnce({
        id: 'usr_1',
        email: 'user@example.com',
        emailVerified: false,
      });

      const req = new Request('https://api.realrate.ir/api/alerts/email/test', { method: 'POST' });
      const res = await wrap(handleSendTestEmailAlert)(req, env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('EMAIL_NOT_VERIFIED');
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('Daily Cron Job (runReminderEmailDigest)', () => {
    it('skips disabled users and users with unverified emails', async () => {
      db.users.set('u_unverified', { email: 'u1@example.com', email_verified: 0, disabled: 0 });
      db.users.set('u_disabled', { email: 'u2@example.com', email_verified: 1, disabled: 1 });
      db.users.set('u_optout', { email: 'u3@example.com', email_verified: 1, disabled: 0 });

      db.prefs.set('u_unverified', { user_id: 'u_unverified', enabled: 1, sources: JSON.stringify(['loan']) });
      db.prefs.set('u_disabled', { user_id: 'u_disabled', enabled: 1, sources: JSON.stringify(['loan']) });
      db.prefs.set('u_optout', { user_id: 'u_optout', enabled: 0, sources: JSON.stringify(['loan']) });

      const res = await runReminderEmailDigest(env, '2026-10-05');
      expect(res.recipientsCount).toBe(0);
      expect(res.emailsSent).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends digest for lead, due, and overdue reminders and records them in sent history', async () => {
      const userId = 'u_active';
      db.users.set(userId, { email: 'active@example.com', email_verified: 1, disabled: 0 });
      db.prefs.set(userId, {
        user_id: userId,
        enabled: 1,
        sources: JSON.stringify(['loan', 'cheque', 'recurring_income']),
        lead_days: JSON.stringify([1, 0]),
        send_overdue: 1,
        include_cheque_direction: 1,
      });

      // Today is 2026-10-05
      // 1. Overdue loan: due on 2026-10-01, remaining 5
      db.reminders.push({
        user_id: userId,
        kind: 'loan',
        record_id: 'ln_1',
        due_date: '2026-10-01',
        interval_months: 1,
        remaining: 5,
        direction: '',
        muted: 0,
      });

      // 2. Cheque due today 2026-10-05, issued
      db.reminders.push({
        user_id: userId,
        kind: 'cheque',
        record_id: 'chk_1',
        due_date: '2026-10-05',
        interval_months: 0,
        remaining: 1,
        direction: 'issued',
        muted: 0,
      });

      // 3. Fixed income due tomorrow 2026-10-06 (lead day 1)
      db.reminders.push({
        user_id: userId,
        kind: 'recurring_income',
        record_id: 'inc_1',
        due_date: '2026-10-06',
        interval_months: 1,
        remaining: null,
        direction: '',
        muted: 0,
      });

      // 4. Muted loan due today -> should be skipped
      db.reminders.push({
        user_id: userId,
        kind: 'loan',
        record_id: 'ln_muted',
        due_date: '2026-10-05',
        interval_months: 1,
        remaining: 10,
        direction: '',
        muted: 1,
      });

      const res = await runReminderEmailDigest(env, '2026-10-05');
      expect(res.recipientsCount).toBe(1);
      expect(res.emailsSent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);

      // Verify sent history was populated
      expect(db.sent.length).toBe(3);
      expect(db.sent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ record_id: 'ln_1', reason: 'overdue' }),
          expect.objectContaining({ record_id: 'chk_1', reason: 'due' }),
          expect.objectContaining({ record_id: 'inc_1', reason: 'lead' }),
        ])
      );

      // Running cron again on the same day must not re-send because of daily cap & sent history
      const res2 = await runReminderEmailDigest(env, '2026-10-05');
      expect(res2.emailsSent).toBe(0);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('rolls forward next installment via interval_months even when user never opened the app', async () => {
      const userId = 'u_inactive_user';
      db.users.set(userId, { email: 'inactive@example.com', email_verified: 1, disabled: 0 });
      db.prefs.set(userId, {
        user_id: userId,
        enabled: 1,
        sources: JSON.stringify(['loan']),
        lead_days: JSON.stringify([0]),
        send_overdue: 0,
        include_cheque_direction: 0,
      });

      // Loan started 2 months ago (2026-08-04), monthly, remaining 10. User hasn't opened app since.
      // Next calculated occurrence for today 2026-10-05 should be detected by occurrencesBetween!
      db.reminders.push({
        user_id: userId,
        kind: 'loan',
        record_id: 'ln_long_unopened',
        due_date: '2026-08-04',
        interval_months: 1,
        remaining: 10,
        direction: '',
        muted: 0,
      });

      const res = await runReminderEmailDigest(env, '2026-10-05');
      expect(res.emailsSent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(db.sent).toEqual([
        expect.objectContaining({
          record_id: 'ln_long_unopened',
          due_date: '2026-10-05',
          reason: 'due',
        }),
      ]);
    });

    it('purges sent records older than 120 days', async () => {
      const oldDate = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

      db.sent.push(
        { user_id: 'u1', kind: 'loan', record_id: '1', due_date: '2026-01-01', reason: 'due', sent_at: oldDate },
        { user_id: 'u1', kind: 'loan', record_id: '2', due_date: '2026-05-01', reason: 'due', sent_at: recentDate }
      );

      await dbPurgeOldAlertEmailSent(env, 120);
      expect(db.sent.length).toBe(1);
      expect(db.sent[0].record_id).toBe('2');
    });
  });
});
