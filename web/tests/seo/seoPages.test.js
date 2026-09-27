import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, FEATURE_PAGES, STATIC_PAGES } from '../../src/seo/pages.js';
import { SPA_ROUTES } from '../../src/seo/spaRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDir = resolve(__dirname, '../..');
const distDir = resolve(webDir, 'dist');

describe('SEO Pages Acceptance Tests', () => {
  const allPagesMetadata = [
    STATIC_PAGES.features,
    STATIC_PAGES.about,
    STATIC_PAGES.faq,
    ...FEATURE_PAGES,
  ];

  it('verifies metadata constraints on all SEO pages', () => {
    for (const page of allPagesMetadata) {
      // Title <= 60 chars
      assert.ok(
        page.title.length <= 60,
        `Page "${page.slug}" title is ${page.title.length} chars (must be <= 60): "${page.title}"`
      );

      // Description between 120 and 160 chars
      assert.ok(
        page.description.length >= 120 && page.description.length <= 160,
        `Page "${page.slug}" description is ${page.description.length} chars (must be 120-160): "${page.description}"`
      );
    }
  });

  const staticHtmlFiles = [
    { slug: 'index', path: resolve(distDir, 'index.html'), isLanding: true },
    { slug: 'features', path: resolve(distDir, 'features.html') },
    { slug: 'about', path: resolve(distDir, 'about.html') },
    { slug: 'faq', path: resolve(distDir, 'faq.html') },
    ...FEATURE_PAGES.map((p) => ({
      slug: `features/${p.slug}`,
      path: resolve(distDir, `features/${p.slug}.html`),
    })),
  ];

  for (const page of staticHtmlFiles) {
    describe(`Static HTML: ${page.slug}`, () => {
      it('exists in dist directory', () => {
        assert.ok(existsSync(page.path), `File ${page.path} must exist in dist`);
      });

      it('has exactly one <h1> heading', () => {
        const html = readFileSync(page.path, 'utf-8');
        const h1Matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [];
        assert.strictEqual(
          h1Matches.length,
          1,
          `Page ${page.slug} must have exactly one <h1>, found ${h1Matches.length}`
        );
      });

      it('has title <= 60 chars and description 120-160 chars', () => {
        const html = readFileSync(page.path, 'utf-8');
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        assert.ok(titleMatch, `Page ${page.slug} must have a <title>`);
        assert.ok(
          titleMatch[1].length <= 60,
          `Page ${page.slug} title is ${titleMatch[1].length} chars (must be <= 60)`
        );

        const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
        assert.ok(descMatch, `Page ${page.slug} must have meta description`);
        assert.ok(
          descMatch[1].length >= 120 && descMatch[1].length <= 160,
          `Page ${page.slug} description is ${descMatch[1].length} chars (must be 120-160)`
        );
      });

      it('has absolute canonical URL matching site origin', () => {
        const html = readFileSync(page.path, 'utf-8');
        const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
        assert.ok(canonicalMatch, `Page ${page.slug} must have canonical tag`);
        assert.ok(
          canonicalMatch[1].startsWith(`${SITE.origin}/`),
          `Page ${page.slug} canonical must be absolute: ${canonicalMatch[1]}`
        );
      });

      it('contains valid JSON-LD that parses without error', () => {
        const html = readFileSync(page.path, 'utf-8');
        const jsonLdRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
        let match;
        let found = false;
        while ((match = jsonLdRegex.exec(html)) !== null) {
          found = true;
          const parsed = JSON.parse(match[1]);
          assert.ok(parsed, `JSON-LD in ${page.slug} must be non-null`);
        }
        assert.ok(found, `Page ${page.slug} must contain at least one JSON-LD block`);
      });

      it('has only valid internal links (all internal links resolve to static HTML or SPA route)', () => {
        const html = readFileSync(page.path, 'utf-8');
        const hrefRegex = /href="(\/[^"#?]*)(?:[#?][^"]*)?"/g;
        let match;
        const validLinks = new Set();

        while ((match = hrefRegex.exec(html)) !== null) {
          const rawHref = match[1];
          // Skip assets, manifests, icons, etc.
          if (
            rawHref.startsWith('/assets/') ||
            rawHref.startsWith('/seo/') ||
            rawHref.startsWith('/og/') ||
            rawHref.startsWith('/icons/') ||
            rawHref === '/manifest.webmanifest' ||
            rawHref === '/favicon.svg'
          ) {
            continue;
          }

          // Check if it's an existing static file or directory index
          const cleaned = rawHref.replace(/^\/+/, '');
          const htmlCandidate = resolve(distDir, `${cleaned}.html`);
          const indexCandidate = resolve(distDir, cleaned, 'index.html');
          const isStaticFile =
            rawHref === '/' ||
            existsSync(htmlCandidate) ||
            existsSync(indexCandidate);

          // Check if it's an SPA route
          const isSpaRoute = SPA_ROUTES.some((r) => {
            if (r.path === rawHref) return true;
            if (r.splat && (rawHref.startsWith(r.path + '/') || rawHref === r.path)) return true;
            if (r.path.endsWith('/*') && rawHref.startsWith(r.path.slice(0, -2))) return true;
            return false;
          });

          assert.ok(
            isStaticFile || isSpaRoute,
            `Dead internal link found in ${page.slug}: "${rawHref}"`
          );
        }
      });
    });
  }

  describe('Sitemap & Robots verification', () => {
    it('sitemap.xml contains all expected static URLs', () => {
      const sitemapPath = resolve(distDir, 'sitemap.xml');
      assert.ok(existsSync(sitemapPath), 'sitemap.xml must exist');
      const xml = readFileSync(sitemapPath, 'utf-8');

      assert.ok(xml.includes(`${SITE.origin}/</loc>`), 'sitemap must include /');
      assert.ok(xml.includes(`${SITE.origin}/features</loc>`), 'sitemap must include /features');
      assert.ok(xml.includes(`${SITE.origin}/about</loc>`), 'sitemap must include /about');
      assert.ok(xml.includes(`${SITE.origin}/faq</loc>`), 'sitemap must include /faq');

      for (const p of FEATURE_PAGES) {
        assert.ok(
          xml.includes(`${SITE.origin}/features/${p.slug}</loc>`),
          `sitemap must include /features/${p.slug}`
        );
      }
    });

    it('robots.txt disallows private routes without breaking /features', () => {
      const robotsPath = resolve(distDir, 'robots.txt');
      assert.ok(existsSync(robotsPath), 'robots.txt must exist');
      const txt = readFileSync(robotsPath, 'utf-8');

      assert.ok(!txt.includes('Disallow: /features'), 'robots.txt must NOT disallow /features');
      assert.ok(txt.includes('Disallow: /portfolio'), 'robots.txt must disallow /portfolio');
      assert.ok(txt.includes('Disallow: /app'), 'robots.txt must disallow /app');
      assert.ok(txt.includes('Disallow: /p/'), 'robots.txt must disallow /p/');
      assert.ok(txt.includes(`Sitemap: ${SITE.origin}/sitemap.xml`), 'robots.txt must specify sitemap');
    });

    it('spa.html contains noindex and no canonical tag', () => {
      const spaPath = resolve(distDir, 'spa.html');
      assert.ok(existsSync(spaPath), 'spa.html must exist');
      const html = readFileSync(spaPath, 'utf-8');

      assert.ok(html.includes('content="noindex"'), 'spa.html must contain noindex meta tag');
      assert.ok(!html.includes('rel="canonical"'), 'spa.html must NOT contain canonical tag');
    });

    it('404.html contains noindex tag', () => {
      const notFoundPath = resolve(distDir, '404.html');
      assert.ok(existsSync(notFoundPath), '404.html must exist');
      const html = readFileSync(notFoundPath, 'utf-8');

      assert.ok(html.includes('content="noindex"'), '404.html must contain noindex meta tag');
    });
  });
});
