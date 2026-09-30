import { describe, it, expect } from 'vitest';
import { formatClientHeader, parseClientHeader, compareVersions } from '../../src/domain/clientInfo.js';

describe('clientInfo', () => {
  it('formats and reads the client header', () => {
    expect(formatClientHeader('android', '1.0.47')).toBe('android/1.0.47');
    expect(formatClientHeader('android', '')).toBe('android');
    expect(formatClientHeader('web')).toBe('web');
    expect(parseClientHeader('android/1.0.47')).toEqual({ platform: 'android', appVersion: '1.0.47' });
    expect(parseClientHeader(' Android ')).toEqual({ platform: 'android', appVersion: '' });
    expect(parseClientHeader('web')).toEqual({ platform: 'web', appVersion: '' });
  });

  it('ignores anything it does not know', () => {
    expect(parseClientHeader(null)).toBeNull();
    expect(parseClientHeader('ios/2.0')).toBeNull();
    expect(parseClientHeader('android/1.0; DROP TABLE users')).toEqual({ platform: 'android', appVersion: '' });
    expect(parseClientHeader('web/1.0.0')).toEqual({ platform: 'web', appVersion: '' });
  });

  it('orders versions numerically', () => {
    expect(['1.0.9', '1.0.10', '', '1.1'].sort(compareVersions)).toEqual(['', '1.0.9', '1.0.10', '1.1']);
  });
});
