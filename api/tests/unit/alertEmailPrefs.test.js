/**
 * alertEmailPrefs.test.js — Validation and defaults of the email reminder preferences.
 */
import { describe, it, expect } from 'vitest';
import {
  validateAlertEmailPrefs,
  DEFAULT_ALERT_EMAIL_PREFS,
  ALLOWED_EMAIL_SOURCES,
} from '../../src/domain/alertEmailPrefs.js';

describe('validateAlertEmailPrefs', () => {
  it('rejects anything that is not an object', () => {
    for (const bad of [null, undefined, 'x', 5]) {
      expect(validateAlertEmailPrefs(bad).error).toBeTruthy();
    }
  });

  it('fills the defaults for an empty object', () => {
    const { value } = validateAlertEmailPrefs({});
    expect(value).toEqual(DEFAULT_ALERT_EMAIL_PREFS);
  });

  it('keeps only known sources, once each', () => {
    const [first] = ALLOWED_EMAIL_SOURCES;
    const { value } = validateAlertEmailPrefs({ sources: [first, first, 'nope', 7] });
    expect(value.sources).toEqual([first]);
  });

  it('keeps only allowed lead days, unique, latest first', () => {
    const { value } = validateAlertEmailPrefs({ leadDays: [0, 7, 3, 3, 2, '1'] });
    expect(value.leadDays).toEqual([7, 3, 1, 0]);
  });

  it('accepts snake_case keys', () => {
    const { value } = validateAlertEmailPrefs({
      lead_days: [1],
      send_overdue: false,
      include_cheque_direction: true,
    });
    expect(value).toMatchObject({ leadDays: [1], sendOverdue: false, includeChequeDirection: true });
  });

  it('coerces enabled to a boolean', () => {
    expect(validateAlertEmailPrefs({ enabled: 1 }).value.enabled).toBe(true);
    expect(validateAlertEmailPrefs({ enabled: 0 }).value.enabled).toBe(false);
  });
});
