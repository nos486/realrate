/**
 * appUpdateBackground.test.js — an update downloaded while the screen is off waits for the return
 * to the app before opening Android's installer (it is dropped from the background)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({
  canInstall: vi.fn(async () => ({ allowed: true })),
  addListener: vi.fn(async () => ({ remove() {} })),
  download: vi.fn(async () => ({ path: '/x.apk' })),
  install: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true, smsEnabled: () => true }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({ AppUpdate: plugin }));
vi.mock('../../../web/src/shared/api/httpClient.js', () => ({
  httpClient: { get: vi.fn(async () => ({ release: { version: '1.0.50', url: 'https://x/realrate.apk' } })) },
}));

import { checkForUpdate, downloadAndInstall, resumeUpdate, getAppUpdateState } from '../../../web/src/shared/native/appUpdate.js';

function setVisibility(value) {
  vi.stubGlobal('document', { visibilityState: value });
}

describe('update downloaded in the background', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.doMock('@capacitor/app', () => ({ App: { getInfo: async () => ({ version: '1.0.40' }) } }));
    setVisibility('visible');
    await checkForUpdate({ manual: true });
  });

  it('opens the installer at once when the app is in front', async () => {
    await downloadAndInstall();
    expect(plugin.install).toHaveBeenCalledTimes(1);
    expect(getAppUpdateState().status).toBe('installing');
  });

  it('waits for the return when the screen turned off, then opens it', async () => {
    plugin.download.mockImplementationOnce(async () => {
      setVisibility('hidden');
      return { path: '/x.apk' };
    });
    await downloadAndInstall();
    expect(plugin.install).not.toHaveBeenCalled();
    expect(getAppUpdateState().status).toBe('ready');
    setVisibility('visible');
    expect(await resumeUpdate()).toBe(true);
    expect(plugin.install).toHaveBeenCalledTimes(1);
    expect(getAppUpdateState().status).toBe('installing');
  });

  it('does not stay stuck on «installing» after coming back from the installer', async () => {
    await downloadAndInstall();
    await resumeUpdate();
    expect(getAppUpdateState().status).toBe('available');
  });
});
