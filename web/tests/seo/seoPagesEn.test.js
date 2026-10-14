import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, FEATURE_PAGES, STATIC_PAGES } from '../../src/seo/pages.js';
import { FEATURE_PAGES as FEATURE_PAGES_EN, STATIC_PAGES as STATIC_PAGES_EN } from '../../src/seo/pages.en.js';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const PERSIAN = /[؀-ۿ]/;

const pages = [
  { path: 'index.html', alt: '/' },
  { path: 'features.html', alt: '/features' },
  { path: 'about.html', alt: '/about' },
  { path: 'faq.html', alt: '/faq' },
  { path: 'android.html', alt: '/android' },
  { path: 'privacy.html', alt: '/privacy' },
  { path: 'delete-account.html', alt: '/delete-account' },
  ...FEATURE_PAGES_EN.map((p) => ({ path: `features/${p.slug}.html`, alt: `/features/${p.slug}` })),
];

describe('English content mirrors the Persian content', () => {
  it('has the same static pages and feature pages, in the same order', () => {
    assert.deepStrictEqual(Object.keys(STATIC_PAGES_EN), Object.keys(STATIC_PAGES));
    assert.deepStrictEqual(FEATURE_PAGES_EN.map((p) => p.slug), FEATURE_PAGES.map((p) => p.slug));
  });

  it('keeps title and description within the search-result limits', () => {
    for (const page of [...Object.values(STATIC_PAGES_EN), ...FEATURE_PAGES_EN]) {
      assert.ok(page.title.length <= 60, `${page.slug} title is ${page.title.length} chars`);
      assert.ok(page.description.length >= 120 && page.description.length <= 160, `${page.slug} description is ${page.description.length} chars`);
    }
  });

  it('has no Persian text left', () => {
    const text = JSON.stringify([STATIC_PAGES_EN, FEATURE_PAGES_EN]);
    assert.ok(!PERSIAN.test(text), 'English content contains Persian characters');
  });
});

describe('Built English pages (dist/en)', () => {
  for (const { path, alt } of pages) {
    describe(`/en/${path}`, () => {
      const file = resolve(distDir, 'en', path);
      it('exists, is English and left to right, with one h1', () => {
        assert.ok(existsSync(file), `${file} must exist`);
        const html = readFileSync(file, 'utf-8');
        assert.match(html, /<html lang="en" dir="ltr">/);
        assert.strictEqual((html.match(/<h1[\s>]/g) || []).length, 1);
        assert.ok(html.includes(`<link rel="canonical" href="${SITE.origin}/en${alt === '/' ? '/' : alt}" />`));
      });

      it('points to its Persian twin with hreflang and a language link, and holds no Persian text but that link', () => {
        const html = readFileSync(file, 'utf-8');
        assert.ok(html.includes(`hreflang="fa" href="${SITE.origin}${alt}"`));
        assert.ok(html.includes(`hreflang="en" href="${SITE.origin}/en${alt === '/' ? '/' : alt}"`));
        assert.ok(html.includes(`<a href="${alt}" class="seo-lang"`));
        const withoutLink = html.replace(/<a [^>]*class="seo-lang"[^>]*>[^<]*<\/a>/, '');
        assert.ok(!PERSIAN.test(withoutLink), `Persian text found in /en/${path}`);
      });

      it('sends visitors into the app with their language', () => {
        const html = readFileSync(file, 'utf-8');
        assert.ok(!/href="\/(login|register|demo)"/.test(html), 'app links must carry ?lang=en');
      });
    });
  }

  it('sitemap lists both languages', () => {
    const xml = readFileSync(resolve(distDir, 'sitemap.xml'), 'utf-8');
    assert.ok(xml.includes(`${SITE.origin}/en/</loc>`));
    assert.ok(xml.includes(`${SITE.origin}/en/privacy</loc>`));
    assert.ok(xml.includes('hreflang="en"'));
  });

  it('Persian pages link their English twin', () => {
    const html = readFileSync(resolve(distDir, 'privacy.html'), 'utf-8');
    assert.ok(html.includes('hreflang="en" href="https://realrate.geekio.org/en/privacy"'));
    const landing = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
    assert.ok(landing.includes('hreflang="en" href="https://realrate.geekio.org/en/"'));
  });
});
