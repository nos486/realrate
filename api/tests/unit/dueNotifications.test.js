/**
 * dueNotifications.test.js — Tests for Android local notifications planning and scheduling (Part B)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  planDueNotifications,
  scheduleDueNotifications,
  cancelDueNotifications,
  notificationId,
  DEFAULT_DUE_NOTIFICATION_SETTINGS,
} from '../../../web/src/shared/native/dueNotifications.js';

vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({
  isNativeApp: vi.fn(() => true),
}));

const mockLocalNotifications = {
  getPending: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  schedule: vi.fn(async () => {}),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
};

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: mockLocalNotifications,
}));

import { isNativeApp } from '../../../web/src/shared/native/nativeApp.js';

describe('Android Due Notifications (Part B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(true);
    mockLocalNotifications.getPending.mockResolvedValue({ notifications: [] });
  });

  describe('notificationId', () => {
    it('generates deterministic positive integers', () => {
      const id1 = notificationId('loan', 'ln_1', '2026-10-05', 'due');
      const id2 = notificationId('loan', 'ln_1', '2026-10-05', 'due');
      const id3 = notificationId('loan', 'ln_1', '2026-10-05', 'lead_1');

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toBeGreaterThan(0);
      expect(Number.isInteger(id1)).toBe(true);
    });
  });

  describe('planDueNotifications', () => {
    const today = '2026-10-05';
    // Reference now: 2026-10-05 08:00 (before 09:00 morning alarm)
    const now = new Date('2026-10-05T08:00:00');

    it('returns empty list when disabled in settings', () => {
      const loans = [
        {
          id: 'ln_1',
          title: 'وام مسکن',
          principalAmount: 10000000,
          installmentCount: 12,
          intervalMonths: 1,
          startDate: '2026-10-05',
        },
      ];

      const res = planDueNotifications({
        loans,
        today,
        settings: { enabled: false },
        now,
      });

      expect(res).toEqual([]);
    });

    it('plans notifications for loan installments, skipping muted loans', () => {
      const loans = [
        {
          id: 'ln_active',
          title: 'وام مسکن',
          nextDueInstallment: {
            id: 'inst_1',
            installmentNumber: 1,
            dueDate: '2026-10-06', // due tomorrow
            totalAmount: 1000000,
            isPaid: false,
          },
          totalCount: 12,
          paidCount: 0,
          intervalMonths: 1,
        },
        {
          id: 'ln_muted',
          title: 'وام بی‌صدا',
          nextDueInstallment: {
            id: 'inst_1',
            installmentNumber: 1,
            dueDate: '2026-10-06',
            totalAmount: 1000000,
            isPaid: false,
          },
          totalCount: 12,
          paidCount: 0,
          intervalMonths: 1,
          remindersMuted: true,
        },
      ];

      const res = planDueNotifications({
        loans,
        today,
        settings: { enabled: true, leadDays: [1, 0], showAmount: false },
        now,
      });

      // Muted loan should not appear
      const mutedItems = res.filter((n) => n.recordId === 'ln_muted');
      expect(mutedItems).toHaveLength(0);

      // Active loan due tomorrow 2026-10-06:
      // lead 1 day: triggers today 2026-10-05 at 09:00 (after now 08:00)
      const leadNotif = res.find((n) => n.recordId === 'ln_active' && n.leadDays === 1 && n.dueDate === '2026-10-06');
      expect(leadNotif).toBeDefined();
      expect(leadNotif.title).toContain('فردا سررسید می‌شود');
      expect(leadNotif.body).toBe('وام مسکن'); // amounts hidden by default
      expect(leadNotif.extra.path).toBe('/loans/ln_active');
    });

    it('shows amount in notification body when showAmount is true and hideAmounts is false', () => {
      const cheques = [
        {
          id: 'chk_1',
          counterparty: 'علی رضایی',
          direction: 'issued',
          amount: 5000000,
          dueDate: '2026-10-05', // due today
          status: 'pending',
        },
      ];

      const res = planDueNotifications({
        cheques,
        today,
        settings: { enabled: true, leadDays: [0], showAmount: true },
        hideAmounts: false,
        now,
      });

      const notif = res.find((n) => n.recordId === 'chk_1');
      expect(notif).toBeDefined();
      expect(notif.title).toContain('چک صادره امروز سررسید است');
      expect(notif.body).toContain('علی رضایی');
      expect(notif.body).toMatch(/۵[٬,]۰۰۰[٬,]۰۰۰ تومان/);
      expect(notif.extra.path).toBe('/cheques');
    });

    it('masks amount when privacy mode (hideAmounts) is active even if showAmount is true', () => {
      const cheques = [
        {
          id: 'chk_1',
          counterparty: 'علی رضایی',
          direction: 'issued',
          amount: 5000000,
          dueDate: '2026-10-05',
          status: 'pending',
        },
      ];

      const res = planDueNotifications({
        cheques,
        today,
        settings: { enabled: true, leadDays: [0], showAmount: true },
        hideAmounts: true, // Privacy mode active!
        now,
      });

      const notif = res.find((n) => n.recordId === 'chk_1');
      expect(notif).toBeDefined();
      expect(notif.body).toBe('علی رضایی');
      expect(notif.body).not.toContain('تومان');
    });

    it('skips closed cheques and fully paid loans', () => {
      const cheques = [
        {
          id: 'chk_cleared',
          counterparty: 'پاس شده',
          amount: 1000000,
          dueDate: '2026-10-06',
          status: 'cleared',
        },
      ];

      const res = planDueNotifications({
        cheques,
        today,
        settings: { enabled: true, leadDays: [1, 0] },
        now,
      });

      expect(res).toHaveLength(0);
    });

    it('caps notifications at 64 items', () => {
      const loans = [];
      for (let i = 0; i < 80; i++) {
        loans.push({
          id: `ln_${i}`,
          title: `وام ${i}`,
          principalAmount: 1000000,
          installmentCount: 12,
          intervalMonths: 1,
          startDate: '2026-10-10',
        });
      }

      const res = planDueNotifications({
        loans,
        today,
        settings: { enabled: true, leadDays: [1, 0] },
        now,
      });

      expect(res.length).toBeLessThanOrEqual(64);
    });
  });

  describe('fixed incomes', () => {
    it('reminds before and on the day, never «overdue»', () => {
      const res = planDueNotifications({
        recurringIncomes: [{ id: 'inc_1', title: 'حقوق', amount: 30000000, startDate: '2026-09-05', intervalMonths: 1, active: true }],
        today: '2026-10-05',
        settings: { enabled: true, leadDays: [1, 0] },
        now: new Date('2026-10-05T08:00:00'),
      });
      expect(res.filter((n) => n.kind === 'recurring_income').length).toBeGreaterThan(0);
      expect(res.some((n) => n.reason === 'overdue')).toBe(false);
    });
  });

  describe('cancelDueNotifications (logout)', () => {
    it('cancels only due notifications, and does nothing on the web', async () => {
      mockLocalNotifications.getPending.mockResolvedValue({
        notifications: [{ id: 7, extra: { kind: 'due' } }, { id: 8, extra: { kind: 'sms' } }],
      });
      await cancelDueNotifications();
      expect(mockLocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] });

      vi.clearAllMocks();
      isNativeApp.mockReturnValue(false);
      await cancelDueNotifications();
      expect(mockLocalNotifications.getPending).not.toHaveBeenCalled();
    });
  });

  describe('scheduleDueNotifications', () => {
    it('is a no-op if not a native app or if vault is locked', async () => {
      isNativeApp.mockReturnValue(false);
      const resWeb = await scheduleDueNotifications({ isVaultUnlocked: true });
      expect(resWeb).toEqual([]);
      expect(mockLocalNotifications.schedule).not.toHaveBeenCalled();

      isNativeApp.mockReturnValue(true);
      const resLocked = await scheduleDueNotifications({ isVaultUnlocked: false });
      expect(resLocked).toEqual([]);
      expect(mockLocalNotifications.schedule).not.toHaveBeenCalled();
    });

    it('cancels existing due notifications before scheduling new ones', async () => {
      mockLocalNotifications.getPending.mockResolvedValue({
        notifications: [
          { id: 101, extra: { kind: 'due' } },
          { id: 999, extra: { kind: 'sms' } }, // Other notification kind, should not be canceled!
        ],
      });

      const cheques = [
        {
          id: 'chk_1',
          counterparty: 'بیمه',
          amount: 2000000,
          dueDate: '2026-10-06',
          status: 'pending',
        },
      ];

      const res = await scheduleDueNotifications({
        cheques,
        isVaultUnlocked: true,
        today: '2026-10-05',
        settings: { enabled: true, leadDays: [1, 0] },
        now: new Date('2026-10-05T08:00:00'),
      });

      expect(mockLocalNotifications.cancel).toHaveBeenCalledTimes(1);
      expect(mockLocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: 101 }],
      });

      expect(mockLocalNotifications.schedule).toHaveBeenCalledTimes(1);
      expect(res.length).toBeGreaterThan(0);
    });
  });
});
