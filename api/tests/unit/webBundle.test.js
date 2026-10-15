/**
 * webBundle.test.js — the app's pages update without a new APK: the native-side hash that decides
 * when an APK is due, the bundle manifest, when the app looks for a bundle, and the settings'
 * «بررسی به‌روزرسانی» that loads the newest pages right away
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeHash } from '../../../.github/scripts/native-hash.mjs';
import { buildManifest, bundleFileName } from '../../../.github/scripts/web-bundle-manifest.mjs';

const update = vi.fn();
const info = vi.fn();
const apply = vi.fn();
let progressHandler = null;
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({
  WebBundle: {
    update: (...args) => update(...args),
    info: (...args) => info(...args),
    apply: (...args) => apply(...args),
    ready: vi.fn(async () => ({})),
    addListener: vi.fn(async (_name, handler) => {
      progressHandler = handler;
      return { remove: () => { progressHandler = null; } };
    }),
  },
}));

const {
  checkWebBundle,
  isWebBundleCheckDue,
  resetWebBundleChecks,
  updatePagesNow,
  getWebBundleProgress,
  progressShare,
  WEB_BUNDLE_CHECK_GAP_MS,
  WEB_BUNDLE_MANIFEST_URL,
} = await import('../../../web/src/shared/native/webBundle.js');

const tracked = [
  '100644 aaaa 0\tweb/android/app/build.gradle',
  '100644 bbbb 0\tweb/android/app/src/main/java/ir/realrate/app/MainActivity.java',
].join('\n');
const lock = {
  packages: {
    'node_modules/@capacitor/core': { version: '8.5.2' },
    'node_modules/@capacitor/app': { version: '8.1.1' },
    'node_modules/react': { version: '19.2.8' },
  },
};

describe('native hash', () => {
  it('is stable and ignores file order', () => {
    const reversed = tracked.split('\n').reverse().join('\n');
    expect(nativeHash(tracked, lock)).toMatch(/^[0-9a-f]{16}$/);
    expect(nativeHash(reversed, lock)).toBe(nativeHash(tracked, lock));
  });

  it('changes with a native file or a Capacitor plugin, not with other packages', () => {
    const base = nativeHash(tracked, lock);
    expect(nativeHash(tracked.replace('bbbb', 'cccc'), lock)).not.toBe(base);
    const plugin = { packages: { ...lock.packages, 'node_modules/@capacitor/app': { version: '8.2.0' } } };
    expect(nativeHash(tracked, plugin)).not.toBe(base);
    const other = { packages: { ...lock.packages, 'node_modules/react': { version: '19.3.0' } } };
    expect(nativeHash(tracked, other)).toBe(base);
  });
});

describe('web bundle manifest', () => {
  it('names each flavor’s zip by build', () => {
    const manifest = buildManifest(
      {
        build: '512',
        nativeHash: '0123456789abcdef',
        bundles: { full: { size: 10, signature: 'c2ln' }, nosms: { size: 9, signature: 'c2ln' } },
      },
      new Date('2026-10-15T00:00:00Z'),
    );
    expect(manifest).toEqual({
      build: 512,
      version: '1.0.512',
      nativeHash: '0123456789abcdef',
      publishedAt: '2026-10-15T00:00:00.000Z',
      bundles: {
        full: { file: 'web-512-full.zip', size: 10, signature: 'c2ln' },
        nosms: { file: 'web-512-nosms.zip', size: 9, signature: 'c2ln' },
      },
    });
    expect(bundleFileName(7, 'full')).toBe('web-7-full.zip');
  });

  it('refuses an unsigned bundle or a bad hash', () => {
    expect(() => buildManifest({ build: 1, nativeHash: '0123456789abcdef', bundles: { full: { size: 1 } } })).toThrow();
    expect(() => buildManifest({ build: 1, nativeHash: 'nope', bundles: { full: { size: 1, signature: 'x' } } })).toThrow();
    expect(() => buildManifest({ build: 1, nativeHash: '0123456789abcdef', bundles: {} })).toThrow();
  });
});

describe('looking for a web bundle', () => {
  beforeEach(() => {
    resetWebBundleChecks();
    update.mockReset();
  });

  it('checks at most once per gap', () => {
    expect(isWebBundleCheckDue(0, 1000)).toBe(true);
    expect(isWebBundleCheckDue(1000, 1000 + WEB_BUNDLE_CHECK_GAP_MS - 1)).toBe(false);
    expect(isWebBundleCheckDue(1000, 1000 + WEB_BUNDLE_CHECK_GAP_MS)).toBe(true);
  });

  it('asks the native side with the manifest, and not again right after', async () => {
    update.mockResolvedValue({ status: 'ready', build: 9 });
    await expect(checkWebBundle(1_000_000)).resolves.toEqual({ status: 'ready', build: 9 });
    expect(update).toHaveBeenCalledWith({ manifestUrl: WEB_BUNDLE_MANIFEST_URL });
    await expect(checkWebBundle(1_000_000 + 1000)).resolves.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed check (no connection)', async () => {
    update.mockRejectedValue(new Error('offline'));
    await expect(checkWebBundle(5_000_000)).resolves.toBeNull();
  });
});

describe('updating the pages now (settings)', () => {
  beforeEach(() => {
    resetWebBundleChecks();
    update.mockReset();
    info.mockReset();
    apply.mockReset();
  });

  it('downloads and loads a newer bundle at once, with no interval', async () => {
    update.mockResolvedValue({ status: 'ready', build: 10 });
    apply.mockResolvedValue({ applied: true });
    await checkWebBundle(1000);
    await expect(updatePagesNow(1001)).resolves.toBe('applied');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('loads a bundle downloaded earlier that waits for the next start', async () => {
    update.mockResolvedValue({ status: 'latest' });
    info.mockResolvedValue({ pendingBuild: 9 });
    apply.mockResolvedValue({ applied: true });
    await expect(updatePagesNow()).resolves.toBe('applied');
  });

  it('says it is the newest when nothing is newer or waiting', async () => {
    update.mockResolvedValue({ status: 'latest' });
    info.mockResolvedValue({ pendingBuild: 0 });
    await expect(updatePagesNow()).resolves.toBe('latest');
    expect(apply).not.toHaveBeenCalled();
  });

  it('leaves it for the next start on an APK without apply', async () => {
    update.mockResolvedValue({ status: 'ready', build: 10 });
    apply.mockRejectedValue(new Error('not implemented'));
    await expect(updatePagesNow()).resolves.toBe('next-start');
  });

  it('reports a failed download', async () => {
    update.mockRejectedValue(new Error('offline'));
    await expect(updatePagesNow()).resolves.toBe('error');
  });
});


describe('download progress', () => {
  beforeEach(() => {
    resetWebBundleChecks();
    update.mockReset();
  });

  it('turns the plugin event into a share', () => {
    expect(progressShare({ downloaded: 50, total: 200 })).toBe(0.25);
    expect(progressShare({ downloaded: 50, total: 0 })).toBe(0);
    expect(progressShare({ downloaded: 300, total: 200 })).toBe(1);
  });

  it('shows while the zip downloads and hides when the check ends', async () => {
    let seen = null;
    update.mockImplementation(async () => {
      progressHandler?.({ downloaded: 30, total: 100 });
      seen = getWebBundleProgress();
      return { status: 'ready', build: 11 };
    });
    await checkWebBundle(9_000_000);
    expect(seen).toEqual({ downloading: true, progress: 0.3 });
    expect(getWebBundleProgress().downloading).toBe(false);
    expect(progressHandler).toBeNull();
  });
});
