/**
 * appUpdate.test.js — the Android app's update check: the latest release (server) and when the
 * app prompts (web)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseGithubRelease, releaseFromLatestRedirect, versionFromTag } from '../../src/domain/appRelease.js';
import { getLatestRelease, RELEASE_CACHE_MS } from '../../src/handlers/appUpdateRoutes.js';
import {
  isCheckDue,
  isNewer,
  shouldPrompt,
  releaseNotesText,
  CHECK_INTERVAL_MS,
} from '../../../web/src/shared/native/appUpdate.js';

const githubRelease = {
  tag_name: 'v1.0.48',
  draft: false,
  prerelease: false,
  body: '- صفحه‌بندی هزینه‌ها\n\n---\n**دانلود مستقیم آخرین نسخه:** [realrate.apk](https://x)',
  published_at: '2026-10-01T10:00:00Z',
  assets: [{ name: 'realrate.apk', size: 12_345_678 }],
};

function memoryKv() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key, type) => {
      const v = store.get(key);
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key, value) => { store.set(key, value); }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('appRelease', () => {
  it('reads the version from the tag', () => {
    expect(versionFromTag('v1.0.48')).toBe('1.0.48');
    expect(versionFromTag('1.2')).toBe('1.2');
    expect(versionFromTag('latest')).toBe('');
  });

  it('turns a GitHub release into the versioned APK', () => {
    expect(parseGithubRelease(githubRelease, 'nos486/realrate')).toEqual({
      version: '1.0.48',
      tag: 'v1.0.48',
      url: 'https://github.com/nos486/realrate/releases/download/v1.0.48/realrate.apk',
      size: 12_345_678,
      notes: githubRelease.body,
      publishedAt: '2026-10-01T10:00:00Z',
    });
  });

  it('ignores drafts, pre-releases and releases without the APK', () => {
    expect(parseGithubRelease({ ...githubRelease, draft: true })).toBeNull();
    expect(parseGithubRelease({ ...githubRelease, prerelease: true })).toBeNull();
    expect(parseGithubRelease({ ...githubRelease, assets: [{ name: 'other.zip' }] })).toBeNull();
    expect(parseGithubRelease({ ...githubRelease, tag_name: 'nightly' })).toBeNull();
  });

  it('falls back to the releases page redirect', () => {
    const r = releaseFromLatestRedirect('https://github.com/nos486/realrate/releases/tag/v1.0.50', 'nos486/realrate');
    expect(r).toMatchObject({ version: '1.0.50', url: 'https://github.com/nos486/realrate/releases/download/v1.0.50/realrate.apk' });
    expect(releaseFromLatestRedirect('https://github.com/nos486/realrate/releases')).toBeNull();
  });
});

describe('GET /api/app/latest', () => {
  it('reads GitHub once and keeps the answer for a while', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(githubRelease), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { REALRATE_KV: memoryKv() };
    const first = await getLatestRelease(env, 1_000);
    const second = await getLatestRelease(env, 1_000 + RELEASE_CACHE_MS - 1);
    expect(first.version).toBe('1.0.48');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the releases page when the API refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('api.github.com')
      ? new Response('rate limited', { status: 403 })
      : new Response(null, { status: 302, headers: { Location: 'https://github.com/nos486/realrate/releases/tag/v1.0.49' } }))));
    const release = await getLatestRelease({ REALRATE_KV: memoryKv() });
    expect(release.version).toBe('1.0.49');
  });

  it('serves the last known release when GitHub is down', async () => {
    const kv = memoryKv();
    kv.store.set('app:latest_release', JSON.stringify({ fetchedAt: 0, release: { version: '1.0.47' } }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await getLatestRelease({ REALRATE_KV: kv }, RELEASE_CACHE_MS * 5)).toEqual({ version: '1.0.47' });
  });

  it('answers null when there is no release yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await getLatestRelease({ REALRATE_KV: memoryKv() })).toBeNull();
  });
});

describe('app update prompt', () => {
  const release = { version: '1.0.48' };

  it('checks only when automatic and the interval has passed', () => {
    expect(isCheckDue({ auto: true, lastCheck: 0 }, CHECK_INTERVAL_MS)).toBe(true);
    expect(isCheckDue({ auto: true, lastCheck: 1 }, CHECK_INTERVAL_MS)).toBe(false);
    expect(isCheckDue({ auto: false, lastCheck: 0 }, CHECK_INTERVAL_MS * 10)).toBe(false);
  });

  it('compares versions numerically', () => {
    expect(isNewer({ version: '1.0.10' }, '1.0.9')).toBe(true);
    expect(isNewer({ version: '1.0.9' }, '1.0.9')).toBe(false);
    expect(isNewer({ version: '1.0.8' }, '1.0.9')).toBe(false);
    expect(isNewer(null, '1.0.9')).toBe(false);
  });

  it('respects «بعداً» for that version only, unless checked by hand', () => {
    const snooze = { version: '1.0.48', until: 2_000 };
    expect(shouldPrompt(release, '1.0.47', snooze, 1_000)).toBe(false);
    expect(shouldPrompt(release, '1.0.47', snooze, 3_000)).toBe(true);
    expect(shouldPrompt({ version: '1.0.49' }, '1.0.47', snooze, 1_000)).toBe(true);
    expect(shouldPrompt(release, '1.0.47', snooze, 1_000, true)).toBe(true);
    expect(shouldPrompt(release, '1.0.48', null, 1_000, true)).toBe(false);
  });

  it('shows the release notes as plain text, without the download footer', () => {
    expect(releaseNotesText(githubRelease.body)).toBe('• صفحه‌بندی هزینه‌ها');
    expect(releaseNotesText('## نسخه\n**مهم:** [لینک](https://a)')).toBe('نسخه\nمهم: لینک');
  });
});
