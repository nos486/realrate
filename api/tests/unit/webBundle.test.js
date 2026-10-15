/**
 * webBundle.test.js — the app's pages update without a new APK: the native-side hash that decides
 * when an APK is due, the bundle manifest, and when the app looks for a bundle
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeHash } from '../../../.github/scripts/native-hash.mjs';
import { buildManifest, bundleFileName } from '../../../.github/scripts/web-bundle-manifest.mjs';

const update = vi.fn();
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({
  WebBundle: { update: (...args) => update(...args), ready: vi.fn(async () => ({})) },
}));

const {
  checkWebBundle,
  isWebBundleCheckDue,
  resetWebBundleChecks,
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
