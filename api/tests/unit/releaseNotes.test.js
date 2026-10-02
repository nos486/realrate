/**
 * releaseNotes.test.js — an Android release's notes hold only what changed since the last release
 */
import { describe, it, expect } from 'vitest';
import { previousTag, addedChangelogItems, commitItems, buildNotes } from '../../../.github/scripts/release-notes.mjs';

describe('release notes', () => {
  it('finds the previous release tag numerically', () => {
    expect(previousTag(['v1.0.9', 'v1.0.10', 'v1.0.11', 'nightly'], '1.0.11')).toBe('v1.0.10');
    expect(previousTag(['v1.0.9', 'v1.0.10'], '1.0.12')).toBe('v1.0.10');
    expect(previousTag([], '1.0.1')).toBe('');
  });

  it('keeps only the CHANGELOG items the diff adds', () => {
    const diff = [
      '--- a/CHANGELOG.md',
      '+++ b/CHANGELOG.md',
      '@@ -5,3 +5,5 @@',
      ' ## [Unreleased]',
      '+- تقسیم هزینه با دوستان',
      '+* رفع خطای پیامک',
      '+',
      '+## [1.0.57]',
      ' - صفحه‌بندی هزینه‌ها',
      '-- مورد حذف‌شده',
    ].join('\n');
    expect(addedChangelogItems(diff)).toEqual(['- تقسیم هزینه با دوستان', '- رفع خطای پیامک']);
  });

  it('falls back to commit subjects without merges', () => {
    expect(commitItems('Fix SMS\nMerge pull request #1 from x\n\nAdd split')).toEqual(['- Fix SMS', '- Add split']);
  });

  it('ends with the download link', () => {
    const notes = buildNotes({ items: ['- a'], versionName: '1.0.2', repo: 'o/r' });
    expect(notes).toMatch(/^- a\n\n---\n/);
    expect(notes).toContain('https://github.com/o/r/releases/latest/download/realrate.apk');
    expect(buildNotes({ items: [], versionName: '1.0.2', repo: 'o/r' })).toMatch(/^نسخه‌ی 1\.0\.2/);
  });
});
