/**
 * release-notes.mjs — The notes of one Android release: only what changed since the last release
 *
 * The lines added to CHANGELOG.md since the previous release tag (v1.0.N), so the [Unreleased]
 * section can keep growing without every release repeating it; with no new CHANGELOG line, the
 * commit subjects since that tag. Used by .github/workflows/android.yml (the GitHub release body,
 * which the app also shows in its update prompt).
 *
 *   node .github/scripts/release-notes.mjs <versionName> <output file>
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** "1.0.10" after "1.0.9" */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** The newest release tag older than this version ('' for the first release) */
export function previousTag(tags, versionName) {
  return tags
    .map((t) => t.trim())
    .filter((t) => /^v\d+(\.\d+)*$/.test(t) && compareVersions(t.slice(1), versionName) < 0)
    .sort((a, b) => compareVersions(b.slice(1), a.slice(1)))[0] || '';
}

/** The list items a diff of CHANGELOG.md adds */
export function addedChangelogItems(diff) {
  return String(diff || '')
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1).trim())
    .filter((line) => /^[-*]\s+\S/.test(line))
    .map((line) => `- ${line.replace(/^[-*]\s+/, '')}`);
}

/** Commit subjects as list items, without merges and the release bot's own */
export function commitItems(log) {
  return String(log || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !/^Merge (pull request|branch)/.test(s))
    .map((s) => `- ${s}`);
}

export function buildNotes({ items, versionName, repo }) {
  const body = items.length ? items.join('\n') : `نسخه‌ی ${versionName} اپ اندروید.`;
  return `${body}\n\n---\n**دانلود مستقیم آخرین نسخه:** [realrate.apk](https://github.com/${repo}/releases/latest/download/realrate.apk)\n`;
}

function main([versionName, outFile]) {
  const repo = process.env.GITHUB_REPOSITORY || 'nos486/realrate';
  const prev = previousTag(git('tag', '--list', 'v*').split('\n'), versionName);
  let items = [];
  if (prev) {
    items = addedChangelogItems(git('diff', prev, 'HEAD', '--', 'CHANGELOG.md'));
    if (!items.length) items = commitItems(git('log', `${prev}..HEAD`, '--no-merges', '--format=%s'));
  }
  writeFileSync(outFile, buildNotes({ items, versionName, repo }), 'utf8');
  console.log(`Release notes since ${prev || '(none)'}: ${items.length} item(s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
