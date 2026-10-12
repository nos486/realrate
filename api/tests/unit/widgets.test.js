/**
 * widgets.test.js — the home-screen widgets from the app's side: where a tapped widget opens
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: () => ({}),
}));

import { widgetLinkPath, WIDGET_KINDS, WIDGET_LINK } from '../../../web/src/shared/native/widgets.js';

describe('widgetLinkPath', () => {
  it('maps a widget link to the app page', () => {
    expect(widgetLinkPath(`${WIDGET_LINK}news`)).toBe('/news');
    expect(widgetLinkPath(`${WIDGET_LINK}prices`)).toBe('/');
    expect(widgetLinkPath(`${WIDGET_LINK}settings`)).toBe('/app-settings');
  });

  it('ignores other links and unknown pages', () => {
    expect(widgetLinkPath('ir.realrate.app://sms-inbox')).toBeNull();
    expect(widgetLinkPath(`${WIDGET_LINK}nowhere`)).toBeNull();
    expect(widgetLinkPath(undefined)).toBeNull();
  });

  it('offers the two widgets the native side registers', () => {
    expect(WIDGET_KINDS.map((k) => k.key)).toEqual(['prices', 'news']);
  });
});
