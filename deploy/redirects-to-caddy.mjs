/**
 * redirects-to-caddy.mjs — The SPA routes of dist/_redirects (Cloudflare Pages) as a Caddy matcher
 *
 * build-seo.mjs lists every client route rewritten to /spa (200); everything else is a static
 * page or a 404. This prints `@spa path …` for the Caddyfile to import, so both hosts route the
 * same way from one list.
 *   node deploy/redirects-to-caddy.mjs web/dist/_redirects > spa-routes.caddy
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node redirects-to-caddy.mjs <path to _redirects>');
  process.exit(1);
}
const paths = readFileSync(file, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(/\s+/))
  .filter(([, to, status]) => to === '/spa' && (status === '200' || status === undefined))
  .map(([from]) => from);

if (!paths.length) {
  console.error('no /spa routes found in', file);
  process.exit(1);
}
process.stdout.write(`# Generated from _redirects at build time (deploy/redirects-to-caddy.mjs)\n@spa path ${paths.join(' ')}\n`);
