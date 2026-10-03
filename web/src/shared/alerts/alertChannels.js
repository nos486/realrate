/**
 * alertChannels.js — Where alerts are delivered beyond the UI
 *
 *   - in the app: every alert, always (AlertCenter.jsx, AlertStack.jsx)
 *   - email: server-driven via vault_reminders index and daily cron at 08:00 Asia/Tehran
 *     (see api/src/jobs/reminderEmail.job.js and emailAlertsApi.js)
 *   - local notifications (Android): scheduled on-device (Part B)
 *   - sealed web push (PWA): sealed device payloads (Part C)
 */

/**
 * Deliver alerts to active channels.
 * Note: Email delivery is completely server-driven and independent of client sessions.
 *
 * @param {object[]} _alerts
 * @param {object} [_options]
 * @returns {Promise<string[]>}
 */
export async function deliverAlerts(_alerts = [], _options = {}) {
  // Email reminders are handled server-side via the minimal vault_reminders index.
  return [];
}
