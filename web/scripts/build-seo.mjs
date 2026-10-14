#!/usr/bin/env node
/**
 * web/scripts/build-seo.mjs
 * Post-build static SEO generator:
 * - Copies dist/index.html to dist/spa.html (noindex shell)
 * - Enhances dist/index.html with metadata, JSON-LD, and crawlable root fallback
 * - Generates standalone static HTML for /features, /features/*, /about, /faq, /android, /privacy, /delete-account and /404
 * - Copies fonts and SEO CSS into dist/seo/
 * - Emits dist/sitemap.xml and dist/robots.txt
 * - Generates dist/_redirects (eliminating catch-all soft 404) and updates dist/_headers
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { SITE, FEATURE_PAGES, STATIC_PAGES } from '../src/seo/pages.js';
import { SITE as SITE_EN, FEATURE_PAGES as FEATURE_PAGES_EN, STATIC_PAGES as STATIC_PAGES_EN } from '../src/seo/pages.en.js';
import { SEO_LOCALES } from '../src/seo/chrome.js';
import { generateRedirects } from '../src/seo/spaRoutes.js';
import { DEMO_ENABLED } from '../src/shared/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDir = resolve(__dirname, '..');
const distDir = resolve(webDir, 'dist');
const require = createRequire(import.meta.url);

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/<\/script/g, '<\\/script');
}

const buildDateIso = new Date().toISOString().split('T')[0];

console.log('🚀 Running SEO post-build generator...');

if (!existsSync(distDir)) {
  console.error('❌ dist directory does not exist! Run "vite build" first.');
  process.exit(1);
}

// Ensure dist subdirectories exist
mkdirSync(resolve(distDir, 'seo'), { recursive: true });
mkdirSync(resolve(distDir, 'features'), { recursive: true });

// ── 1. Copy font & SEO stylesheet ──────────────────────────────────────────
try {
  const fontSourcePath = require.resolve(
    '@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2'
  );
  copyFileSync(fontSourcePath, resolve(distDir, 'seo/vazirmatn-arabic.woff2'));
  console.log('✓ Copied Vazirmatn font to dist/seo/');
} catch (err) {
  console.warn('⚠️ Could not copy Vazirmatn font from node_modules:', err.message);
}

const publicSeoCss = resolve(webDir, 'public/seo/seo.css');
// Content hash in the stylesheet URL, so a changed seo.css is never served from a stale cache
const SEO_CSS_VERSION = createHash('sha256').update(readFileSync(publicSeoCss)).digest('hex').slice(0, 10);
if (existsSync(publicSeoCss)) {
  copyFileSync(publicSeoCss, resolve(distDir, 'seo/seo.css'));
  console.log('✓ Copied seo.css to dist/seo/');
}

// ── 2. Create dist/spa.html (Noindex shell for client routing) ──────────────
const rawIndexHtmlPath = resolve(distDir, 'index.html');
const rawIndexHtml = readFileSync(rawIndexHtmlPath, 'utf-8');

// For spa.html: ensure <meta name="robots" content="noindex"> is present and canonical is removed
let spaHtml = rawIndexHtml;
spaHtml = spaHtml.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
if (!spaHtml.includes('name="robots"')) {
  spaHtml = spaHtml.replace(
    '</head>',
    '    <meta name="robots" content="noindex" />\n  </head>'
  );
} else {
  spaHtml = spaHtml.replace(/<meta\s+name="robots"[^>]*>/gi, '<meta name="robots" content="noindex" />');
}
writeFileSync(resolve(distDir, 'spa.html'), spaHtml, 'utf-8');
mkdirSync(resolve(distDir, 'spa'), { recursive: true });
writeFileSync(resolve(distDir, 'spa/index.html'), spaHtml, 'utf-8');
console.log('✓ Created dist/spa.html and dist/spa/index.html (noindex shell)');

// ── 3. Update dist/index.html (Landing page metadata & crawlable fallback) ───
let landingHtml = rawIndexHtml;

// Ensure canonical is present
if (!landingHtml.includes('rel="canonical"')) {
  landingHtml = landingHtml.replace(
    '</head>',
    `    <link rel="canonical" href="${SITE.origin}/" />\n  </head>`
  );
}

// hreflang: the English home page is a static page under /en/
landingHtml = landingHtml.replace(
  /(<link\s+rel="canonical"[^>]*>)/i,
  `$1\n    <link rel="alternate" hreflang="fa" href="${SITE.origin}/" />\n    <link rel="alternate" hreflang="en" href="${SITE.origin}/en/" />\n    <link rel="alternate" hreflang="x-default" href="${SITE.origin}/" />`
);

// Ensure Open Graph URL, image, locale
if (!landingHtml.includes('property="og:url"')) {
  landingHtml = landingHtml.replace(
    '</head>',
    `    <meta property="og:url" content="${SITE.origin}/" />\n    <meta property="og:image" content="${SITE.ogImage}" />\n    <meta property="og:locale" content="fa_IR" />\n  </head>`
  );
}

// Inject structured JSON-LD into landing
const landingJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': SITE.name,
    'alternateName': SITE.nameFa,
    'url': SITE.origin,
    'description': SITE.description,
    'inLanguage': 'fa',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': SITE.name,
    'url': SITE.origin,
    'logo': `${SITE.origin}/icons/icon-512.png`,
    'sameAs': ['https://github.com/nos486/realrate'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': SITE.name,
    'applicationCategory': 'FinanceApplication',
    'operatingSystem': 'Web, Android, iOS (PWA)',
    'inLanguage': 'fa',
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'IRR',
    },
    'description': SITE.description,
  },
];

const landingJsonLdScript = `\n    <script type="application/ld+json">\n${safeJsonLd(landingJsonLd)}\n    </script>\n  </head>`;
landingHtml = landingHtml.replace('</head>', landingJsonLdScript);

// Inject static crawlable content inside <div id="root"></div>
const crawlableLandingContent = `
    <div id="root">
      <div class="landing-ssr-fallback" style="display:block;color:#f3f4f6;background:#07090e;min-height:100vh;padding:1.5rem 1rem 2.5rem;font-family:Vazirmatn,system-ui,sans-serif;max-width:1120px;margin:0 auto;line-height:1.8;" dir="rtl">
        <header style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;padding-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.08);">
          <strong style="font-size:1.15rem;">RealRate</strong>
          <nav style="display:flex;gap:1.2rem;font-size:0.92rem;margin-inline-end:auto;">
            <a href="/features" style="color:#9ca3af;text-decoration:none;">امکانات</a>
            <a href="/android" style="color:#9ca3af;text-decoration:none;">اپ اندروید</a>
            <a href="/faq" style="color:#9ca3af;text-decoration:none;">سؤالات</a>
            <a href="/about" style="color:#9ca3af;text-decoration:none;">درباره</a>
          </nav>
          <a href="/login" style="background:#f5b942;color:#1a1204;padding:0.45rem 1rem;border-radius:10px;font-weight:700;text-decoration:none;">ورود</a>
        </header>
        <main style="text-align:center;">
          <h1 style="font-size:2.2rem;font-weight:900;line-height:1.35;margin:4rem 0 1rem;">پول و دارایی‌هایت را <span style="color:#f5b942;">یک‌جا و واقعی</span> ببین</h1>
          <p style="font-size:1.05rem;color:#9ca3af;max-width:640px;margin:0 auto 2rem;">
            ارزش واقعی طلا و ارز، پورتفو، هزینه‌ها، درآمد، وام و چک — با گزارش سالانه و خبرهای مهم بازار. رایگان، متن‌باز و رمزنگاری‌شده روی دستگاه خودت.
          </p>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-bottom:4rem;">
            <a href="/register" style="background:#fff;color:#0b0d12;padding:0.7rem 1.4rem;border-radius:12px;font-weight:700;text-decoration:none;">شروع رایگان</a>
            ${DEMO_ENABLED ? `<a href="/demo" style="border:1px solid rgba(255,255,255,0.14);color:#f3f4f6;padding:0.7rem 1.4rem;border-radius:12px;font-weight:700;text-decoration:none;">دیدن نسخه‌ی دمو</a>` : ''}
          </div>
          <section style="text-align:right;">
            <h2 style="font-size:1.6rem;text-align:center;margin-bottom:1.5rem;">همه‌ی کارهای مالی در یک جا</h2>
            <ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:1rem;">
              ${FEATURE_PAGES.map(
                (p) => `
                <li style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:1.3rem;border-radius:18px;">
                  <h3 style="font-size:1.02rem;margin-bottom:0.4rem;"><a href="/features/${p.slug}" style="color:#f3f4f6;text-decoration:none;">${escapeHtml(p.h1)}</a></h3>
                  <p style="font-size:0.9rem;color:#9ca3af;line-height:1.8;">${escapeHtml(p.description)}</p>
                </li>`
              ).join('')}
            </ul>
          </section>
        </main>
        <footer style="margin-top:3rem;border-top:1px solid rgba(255,255,255,0.08);padding-top:1.5rem;font-size:0.85rem;color:#6b7280;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <span>© RealRate · متن‌باز با مجوز MIT</span>
          <span>
            <a href="/features" style="color:#9ca3af;margin-left:1rem;">امکانات</a>
            <a href="/android" style="color:#9ca3af;margin-left:1rem;">اپ اندروید</a>
            <a href="/about" style="color:#9ca3af;margin-left:1rem;">درباره</a>
            <a href="/faq" style="color:#9ca3af;margin-left:1rem;">سؤالات</a>
            <a href="/privacy" style="color:#9ca3af;">حریم خصوصی</a>
          </span>
        </footer>
      </div>
    </div>`;

landingHtml = landingHtml.replace('<div id="root"></div>', crawlableLandingContent);
writeFileSync(rawIndexHtmlPath, landingHtml, 'utf-8');
console.log('✓ Updated dist/index.html with metadata, JSON-LD, and crawlable fallback');

/**
 * Builds one language's static pages: Persian at the site root, English under /en (SEO_LOCALES).
 * @param {object} L - the language row (chrome.js)
 * @param {{ SITE: object, FEATURE_PAGES: object[], STATIC_PAGES: object }} content - that language's page content
 */
function buildLocalePages(L, content) {
const { SITE, FEATURE_PAGES, STATIC_PAGES } = content;
const c = L.c;
const outDir = resolve(distDir, L.base.replace(/^\//, ''));
const other = SEO_LOCALES[L.code === 'fa' ? 'en' : 'fa'];
mkdirSync(resolve(outDir, 'features'), { recursive: true });
/** A link into the app (sign-in, sign-up, demo): English visitors carry their language along */
const appLink = (path) => (L.code === 'en' ? `${path}?lang=en` : path);
/** hreflang links to this page's counterpart in each language ("x-default" is Persian) */
const alternateLinks = (altPath) =>
  altPath === null
    ? ''
    : [
        ...Object.values(SEO_LOCALES).map((o) => `\n    <link rel="alternate" hreflang="${o.code}" href="${SITE.origin}${o.base}${altPath === '/' ? '/' : altPath}" />`),
        `\n    <link rel="alternate" hreflang="x-default" href="${SITE.origin}${altPath}" />`,
      ].join('');

// ── 4. Shared HTML Template Generator for Static Pages ───────────────────────
// They look like the landing page (pages/LandingPage.jsx): its header, footer, colors and buttons
const BRAND_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>';

/** A question and its answer, opened with a tap (the question stays a heading for crawlers) */
const faqItem = (item, tag = 'h3') => `
          <details class="seo-faq-item">
            <summary><${tag} class="seo-faq-q">${escapeHtml(item.q)}</${tag}></summary>
            <p class="seo-faq-a">${escapeHtml(item.a)}</p>
          </details>`;

/** The closing call to start, the same on every page */
const ctaBlock = (title, text, buttons = null) => `
    <section class="seo-cta">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      <div class="seo-cta-buttons">
        ${buttons ?? `<a href="${appLink('/register')}" class="seo-btn seo-btn-primary">${c.ctaStart} <span aria-hidden="true">${L.forward}</span></a>
        ${DEMO_ENABLED ? `<a href="${appLink('/demo')}" class="seo-btn seo-btn-ghost">${c.ctaDemo}</a>` : ''}`}
      </div>
    </section>`;

function renderStaticPage({
  title,
  description,
  canonicalUrl,
  ogImage,
  breadcrumbs,
  jsonLdSchemas = [],
  bodyHtml,
  noIndex = false,
  altPath = null,
}) {
  const robotsTag = noIndex
    ? '<meta name="robots" content="noindex" />'
    : '<meta name="robots" content="index, follow" />';

  const breadcrumbsListJson =
    breadcrumbs && breadcrumbs.length
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          'itemListElement': breadcrumbs.map((b, i) => ({
            '@type': 'ListItem',
            'position': i + 1,
            'name': b.label,
            'item': b.url,
          })),
        }
      : null;

  const allSchemas = [...jsonLdSchemas];
  if (breadcrumbsListJson) {
    allSchemas.unshift(breadcrumbsListJson);
  }

  const jsonLdBlock = allSchemas.length
    ? `\n    <script type="application/ld+json">\n${safeJsonLd(allSchemas)}\n    </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="${L.code}" dir="${L.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${robotsTag}
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />${alternateLinks(altPath)}

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE.name)}" />
    <meta property="og:locale" content="${L.ogLocale}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(ogImage || SITE.ogImage)}" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage || SITE.ogImage)}" />

    <!-- Favicon & PWA -->
    <meta name="theme-color" content="#07090e" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />

    <!-- Standalone SEO Stylesheet -->
    <link rel="stylesheet" href="/seo/seo.css?v=${SEO_CSS_VERSION}" />
${jsonLdBlock}
  </head>
  <body>
    <!-- Header: the same as the landing page's -->
    <header class="seo-header">
      <div class="seo-container seo-header-inner">
        <a href="${L.base}/" class="seo-brand" aria-label="${c.homeAria}">
          <span class="seo-brand-icon">${BRAND_ICON}</span>
          <span>${escapeHtml(SITE.name)}</span>
        </a>
        <nav class="seo-nav" aria-label="${c.mainNav}">
          <a href="${L.base}/features">${c.navFeatures}</a>
          <a href="${L.base}/android">${c.navAndroid}</a>
          <a href="${L.base}/faq">${c.navFaq}</a>
          <a href="${L.base}/about">${c.navAbout}</a>
        </nav>
        ${altPath === null ? '' : `<a href="${other.base}${altPath}" class="seo-lang" hreflang="${other.code}" lang="${other.code}" aria-label="${escapeHtml(c.languageAria)}">${escapeHtml(c.languageLabel)}</a>`}
        <a href="${appLink('/login')}" class="seo-btn seo-btn-small">${L.login} <span aria-hidden="true">${L.chevron}</span></a>
      </div>
    </header>

    <!-- Main Content -->
    <main class="seo-main">
      <div class="seo-container">
        ${bodyHtml}
      </div>
    </main>

    <!-- Footer: the same as the landing page's -->
    <footer class="seo-footer">
      <div class="seo-container seo-footer-inner">
        <div class="seo-footer-brand">
          <a href="${L.base}/" class="seo-brand">
            <span class="seo-brand-icon">${BRAND_ICON}</span>
            <span>${escapeHtml(SITE.name)}</span>
          </a>
          <p>${c.footerTagline}</p>
        </div>
        <nav class="seo-footer-links" aria-label="${c.footerLinks}">
          <a href="${L.base}/features">${c.navFeatures}</a>
          <a href="${L.base}/android">${c.navAndroid}</a>
          <a href="${L.base}/about">${c.navAbout}</a>
          <a href="${L.base}/faq">${c.navFaq}</a>
          <a href="${L.base}/privacy">${c.privacy}</a>
          ${DEMO_ENABLED ? `<a href="${appLink('/demo')}">${c.demo}</a>` : ''}
          <a href="https://github.com/nos486/realrate" target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
      </div>
      <div class="seo-container seo-footer-bottom">
        © ${new Date().getFullYear().toLocaleString(L.intl, { useGrouping: false })} RealRate · ${c.copyright}
      </div>
    </footer>
  </body>
</html>`;
}

// ── 5. Generate Individual Feature Pages (/features/<slug>) ──────────────────
for (const page of FEATURE_PAGES) {
  const canonicalUrl = `${SITE.origin}${L.base}/features/${page.slug}`;
  const breadcrumbs = [
    { label: c.home, url: `${SITE.origin}${L.base}/` },
    { label: c.features, url: `${SITE.origin}${L.base}/features` },
    { label: page.h1, url: canonicalUrl },
  ];

  const jsonLdSchemas = [];

  // FAQ schema if page has FAQ
  if (page.faq && page.faq.length) {
    jsonLdSchemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': page.faq.map((item) => ({
        '@type': 'Question',
        'name': item.q,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': item.a,
        },
      })),
    });
  }

  // Related pages lookup
  const relatedPages = (page.related || [])
    .map((rSlug) => FEATURE_PAGES.find((p) => p.slug === rSlug))
    .filter(Boolean);

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="${c.breadcrumbLabel}">
      <ol class="seo-breadcrumb">
        <li><a href="${L.base}/">${c.home}</a></li>
        <li><a href="${L.base}/features">${c.features}</a></li>
        <li aria-current="page">${escapeHtml(page.h1)}</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">${c.badgeFeatures}</div>
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(page.intro)}</p>
    </header>

    <!-- Main Content Sections -->
    <article class="seo-article">
      ${page.sections
        .map(
          (sec) => `
        <section class="seo-section">
          <h2>${escapeHtml(sec.h2)}</h2>
          ${sec.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          ${
            sec.bullets && sec.bullets.length
              ? `<ul class="seo-bullets">
                  ${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
                </ul>`
              : ''
          }
        </section>`
        )
        .join('')}
    </article>

    <!-- Steps: How it works -->
    ${
      page.steps && page.steps.length
        ? `
    <section class="seo-steps-block">
      <h2>${c.howItWorks}</h2>
      <div class="seo-steps-grid">
        ${page.steps
          .map(
            (step, idx) => `
          <div class="seo-step-card">
            <span class="seo-step-num">${idx + 1}</span>
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.description)}</p>
          </div>`
          )
          .join('')}
      </div>
    </section>`
        : ''
    }

    <!-- FAQ -->
    ${
      page.faq && page.faq.length
        ? `
    <section class="seo-faq-block">
      <h2>${c.faqTitle}</h2>
      <div class="seo-faq-grid">
        ${page.faq
          .map(
            (item) => faqItem(item)
          )
          .join('')}
      </div>
    </section>`
        : ''
    }

    <!-- Related Features -->
    ${
      relatedPages.length
        ? `
    <section class="seo-related-block">
      <h2>${c.related}</h2>
      <div class="seo-related-grid">
        ${relatedPages
          .map(
            (rel) => `
          <div class="seo-related-card">
            <h3>${escapeHtml(rel.h1)}</h3>
            <p>${escapeHtml(rel.description)}</p>
            <a href="${L.base}/features/${rel.slug}" class="seo-related-link">
              <span>${c.more}</span>
              <span aria-hidden="true">${L.forward}</span>
            </a>
          </div>`
          )
          .join('')}
      </div>
    </section>`
        : ''
    }

    <!-- Call to Action Banner -->
    ${ctaBlock(c.ctaTitle, c.ctaText)}`;

  const html = renderStaticPage({
    title: page.title,
    description: page.description,
    canonicalUrl,
    ogImage: page.ogImage,
    breadcrumbs,
    jsonLdSchemas,
    bodyHtml,
    altPath: `/features/${page.slug}`,
  });

  const outPath = resolve(outDir, `features/${page.slug}.html`);
  writeFileSync(outPath, html, 'utf-8');
}
console.log(`✓ Generated ${FEATURE_PAGES.length} feature pages in dist/features/`);

// ── 6. Generate Features Hub Page (/features) ────────────────────────────────
{
  const canonicalUrl = `${SITE.origin}${L.base}/features`;
  const breadcrumbs = [
    { label: c.home, url: `${SITE.origin}${L.base}/` },
    { label: c.features, url: canonicalUrl },
  ];

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': SITE.name,
    'applicationCategory': 'FinanceApplication',
    'operatingSystem': 'Web, Android, iOS (PWA)',
    'inLanguage': L.code,
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'IRR',
    },
    'description': STATIC_PAGES.features.description,
  };

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="${c.breadcrumbLabel}">
      <ol class="seo-breadcrumb">
        <li><a href="${L.base}/">${c.home}</a></li>
        <li aria-current="page">${c.features}</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">${c.badgeFeatures}</div>
      <h1>${escapeHtml(STATIC_PAGES.features.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(STATIC_PAGES.features.intro)}</p>
    </header>

    <!-- Features Hub Grid -->
    <div class="seo-hub-grid">
      ${FEATURE_PAGES.map(
        (p) => `
        <article class="seo-hub-card">
          <h2>${escapeHtml(p.h1)}</h2>
          <p>${escapeHtml(p.description)}</p>
          <a href="${L.base}/features/${p.slug}" class="seo-hub-more">
            <span>${c.more}</span>
            <span aria-hidden="true">${L.forward}</span>
          </a>
        </article>`
      ).join('')}
    </div>

    <!-- Call to Action Banner -->
    ${ctaBlock(c.ctaTitle, c.ctaText)}`;

  const hubHtml = renderStaticPage({
    title: STATIC_PAGES.features.title,
    description: STATIC_PAGES.features.description,
    canonicalUrl,
    ogImage: STATIC_PAGES.features.ogImage,
    breadcrumbs,
    jsonLdSchemas: [appSchema],
    bodyHtml,
    altPath: '/features',
  });

  writeFileSync(resolve(outDir, 'features.html'), hubHtml, 'utf-8');
  console.log('✓ Generated dist/features.html (hub, served at /features)');
}

// ── 7. Generate About Page (/about) ──────────────────────────────────────────
{
  const about = STATIC_PAGES.about;
  const canonicalUrl = `${SITE.origin}${L.base}/about`;
  const breadcrumbs = [
    { label: c.home, url: `${SITE.origin}${L.base}/` },
    { label: c.aboutCrumb, url: canonicalUrl },
  ];

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': SITE.name,
    'applicationCategory': 'FinanceApplication',
    'operatingSystem': 'Web, Android, iOS (PWA)',
    'inLanguage': L.code,
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'IRR',
    },
    'description': about.description,
  };

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="${c.breadcrumbLabel}">
      <ol class="seo-breadcrumb">
        <li><a href="${L.base}/">${c.home}</a></li>
        <li aria-current="page">${c.aboutCrumb}</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">${c.badgeAbout}</div>
      <h1>${escapeHtml(about.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(about.intro)}</p>
    </header>

    <!-- Sections -->
    <article class="seo-article">
      ${about.sections
        .map(
          (sec) => `
        <section class="seo-section">
          <h2>${escapeHtml(sec.h2)}</h2>
          ${sec.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          ${
            sec.bullets && sec.bullets.length
              ? `<ul class="seo-bullets">
                  ${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
                </ul>`
              : ''
          }
        </section>`
        )
        .join('')}
    </article>

    <!-- CTA -->
    ${ctaBlock(c.ctaTitle, c.ctaText)}`;

  const aboutHtml = renderStaticPage({
    title: about.title,
    description: about.description,
    canonicalUrl,
    ogImage: about.ogImage,
    breadcrumbs,
    jsonLdSchemas: [appSchema],
    bodyHtml,
    altPath: '/about',
  });

  writeFileSync(resolve(outDir, 'about.html'), aboutHtml, 'utf-8');
  console.log('✓ Generated dist/about.html');
}

// ── 8. Generate FAQ Page (/faq) ──────────────────────────────────────────────
{
  const faqPage = STATIC_PAGES.faq;
  const canonicalUrl = `${SITE.origin}${L.base}/faq`;
  const breadcrumbs = [
    { label: c.home, url: `${SITE.origin}${L.base}/` },
    { label: c.faqCrumb, url: canonicalUrl },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqPage.faqs.map((f) => ({
      '@type': 'Question',
      'name': f.q,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': f.a,
      },
    })),
  };

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="${c.breadcrumbLabel}">
      <ol class="seo-breadcrumb">
        <li><a href="${L.base}/">${c.home}</a></li>
        <li aria-current="page">${c.faqCrumb}</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">${c.badgeFaq}</div>
      <h1>${escapeHtml(faqPage.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(faqPage.intro)}</p>
    </header>

    <!-- FAQ Grid -->
    <div class="seo-faq-grid">
      ${faqPage.faqs
        .map(
          (item) => faqItem(item, 'h2')
        )
        .join('')}
    </div>

    <!-- CTA -->
    <section class="seo-cta">
      <h2>${c.faqCtaTitle}</h2>
      <p>${c.faqCtaText}</p>
      <div class="seo-cta-buttons">
        <a href="${appLink('/register')}" class="seo-btn seo-btn-primary">${c.ctaStart} <span aria-hidden="true">${L.forward}</span></a>
        <a href="https://github.com/nos486/realrate/issues" target="_blank" rel="noopener noreferrer" class="seo-btn seo-btn-ghost">${c.askGithub}</a>
      </div>
    </section>`;

  const faqHtml = renderStaticPage({
    title: faqPage.title,
    description: faqPage.description,
    canonicalUrl,
    ogImage: faqPage.ogImage,
    breadcrumbs,
    jsonLdSchemas: [faqSchema],
    bodyHtml,
    altPath: '/faq',
  });

  writeFileSync(resolve(outDir, 'faq.html'), faqHtml, 'utf-8');
  console.log('✓ Generated dist/faq.html');
}

// ── 8c. Generate the legal pages (/privacy, /delete-account) ─────────────────
// Google Play asks for both as public URLs. Plain text sections, no sign-in links.
for (const page of [STATIC_PAGES.privacy, STATIC_PAGES.deleteAccount]) {
  const canonicalUrl = `${SITE.origin}${L.base}/${page.slug}`;
  const breadcrumbs = [
    { label: c.home, url: `${SITE.origin}${L.base}/` },
    { label: page.h1, url: canonicalUrl },
  ];

  const bodyHtml = `
    <nav aria-label="${c.breadcrumbLabel}">
      <ol class="seo-breadcrumb">
        <li><a href="${L.base}/">${c.home}</a></li>
        <li aria-current="page">${escapeHtml(page.h1)}</li>
      </ol>
    </nav>

    <header class="seo-hero">
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(page.intro)}</p>
      <p class="seo-hero-intro">${c.updated}: ${escapeHtml(page.updated)}</p>
    </header>

    <article class="seo-article">
      ${page.sections
        .map(
          (sec) => `
        <section class="seo-section">
          <h2>${escapeHtml(sec.h2)}</h2>
          ${sec.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          ${sec.bullets?.length ? `<ul class="seo-bullets">${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
        </section>`
        )
        .join('')}
    </article>`;

  writeFileSync(
    resolve(outDir, `${page.slug}.html`),
    renderStaticPage({
      title: page.title,
      description: page.description,
      canonicalUrl,
      ogImage: page.ogImage,
      breadcrumbs,
      jsonLdSchemas: [{
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        'name': page.h1,
        'description': page.description,
        'inLanguage': L.code,
        'url': canonicalUrl,
      }],
      bodyHtml,
      altPath: `/${page.slug}`,
    }),
    'utf-8'
  );
  console.log(`✓ Generated dist/${page.slug}.html`);
}

// ── 8b. Generate Android App Page (/android) ─────────────────────────────────
// Download of the signed APK (the latest GitHub release) and how to install it, including the
// Play Protect warning a sideloaded app with the SMS permission meets
{
  const app = STATIC_PAGES.android;
  const canonicalUrl = `${SITE.origin}${L.base}/android`;
  const breadcrumbs = [
    { label: c.home, url: `${SITE.origin}${L.base}/` },
    { label: c.navAndroid, url: canonicalUrl },
  ];

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    'name': SITE.name,
    'applicationCategory': 'FinanceApplication',
    'operatingSystem': 'Android 7.0+',
    'inLanguage': L.code,
    'downloadUrl': app.downloadUrl,
    'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'IRR' },
    'description': app.description,
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': app.faq.map((f) => ({
      '@type': 'Question',
      'name': f.q,
      'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
    })),
  };

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="${c.breadcrumbLabel}">
      <ol class="seo-breadcrumb">
        <li><a href="${L.base}/">${c.home}</a></li>
        <li aria-current="page">${c.navAndroid}</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">${c.badgeAndroid}</div>
      <h1>${escapeHtml(app.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(app.intro)}</p>
      <div class="seo-cta-buttons">
        <a href="${escapeHtml(app.downloadUrl)}" class="seo-btn seo-btn-primary" download>${c.download}</a>
        <a href="${escapeHtml(app.releasesUrl)}" target="_blank" rel="noopener noreferrer" class="seo-btn seo-btn-ghost">${c.allReleases}</a>
      </div>
      <p class="seo-hero-note">${c.androidNote}</p>
    </header>

    <!-- Install steps -->
    <section class="seo-steps-block">
      <h2>${c.installGuide}</h2>
      <div class="seo-steps-grid">
        ${app.steps
          .map(
            (step, i) => `
          <div class="seo-step-card">
            <span class="seo-step-num">${(i + 1).toLocaleString(L.intl)}</span>
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.description)}</p>
          </div>`
          )
          .join('')}
      </div>
    </section>

    <!-- Sections -->
    <article class="seo-article">
      ${app.sections
        .map(
          (sec) => `
        <section class="seo-section">
          <h2>${escapeHtml(sec.h2)}</h2>
          ${sec.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          ${
            sec.bullets && sec.bullets.length
              ? `<ul class="seo-bullets">
                  ${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
                </ul>`
              : ''
          }
        </section>`
        )
        .join('')}
    </article>

    <!-- FAQ -->
    <section class="seo-faq-block">
      <h2>${c.faqTitle}</h2>
      <div class="seo-faq-grid">
        ${app.faq
          .map(
            (item) => faqItem(item)
          )
          .join('')}
      </div>
    </section>

    <!-- CTA -->
    <section class="seo-cta">
      <h2>${c.androidCtaTitle}</h2>
      <p>${c.androidCtaText}</p>
      <div class="seo-cta-buttons">
        <a href="${escapeHtml(app.downloadUrl)}" class="seo-btn seo-btn-primary" download>${c.download}</a>
        <a href="${appLink('/register')}" class="seo-btn seo-btn-ghost">${c.signupSite}</a>
      </div>
    </section>`;

  const androidHtml = renderStaticPage({
    title: app.title,
    description: app.description,
    canonicalUrl,
    ogImage: app.ogImage,
    breadcrumbs,
    jsonLdSchemas: [appSchema, faqSchema],
    bodyHtml,
    altPath: '/android',
  });

  writeFileSync(resolve(outDir, 'android.html'), androidHtml, 'utf-8');
  console.log('✓ Generated dist/android.html');
}
  // The English home page (the Persian one is the app's own landing page, pages/LandingPage.jsx)
  if (L.code === 'en') {
    const home = L.home;
    const bodyHtml = `
    <header class="seo-hero">
      <h1>${escapeHtml(home.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(home.intro)}</p>
      <div class="seo-cta-buttons">
        <a href="${appLink('/register')}" class="seo-btn seo-btn-primary">${c.ctaStart} <span aria-hidden="true">${L.forward}</span></a>
        <a href="${L.base}/features" class="seo-btn seo-btn-ghost">${c.navFeatures}</a>
      </div>
    </header>

    <section class="seo-related-block">
      <h2>${escapeHtml(home.featuresTitle)}</h2>
      <div class="seo-hub-grid">
        ${FEATURE_PAGES.map(
          (p) => `
        <article class="seo-hub-card">
          <h3>${escapeHtml(p.h1)}</h3>
          <p>${escapeHtml(p.description)}</p>
          <a href="${L.base}/features/${p.slug}" class="seo-hub-more">
            <span>${c.more}</span>
            <span aria-hidden="true">${L.forward}</span>
          </a>
        </article>`
        ).join('')}
      </div>
    </section>

    ${ctaBlock(c.ctaTitle, c.ctaText)}`;

    writeFileSync(
      resolve(outDir, 'index.html'),
      renderStaticPage({
        title: home.title,
        description: home.description,
        canonicalUrl: `${SITE.origin}${L.base}/`,
        ogImage: SITE.ogImage,
        breadcrumbs: [],
        jsonLdSchemas: [{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          'name': SITE.name,
          'url': `${SITE.origin}${L.base}/`,
          'description': home.description,
          'inLanguage': L.code,
        }],
        bodyHtml,
        altPath: '/',
      }),
      'utf-8'
    );
    console.log('✓ Generated dist/en/index.html (English home page)');
  }
  return { renderStaticPage };
}

const { renderStaticPage } = buildLocalePages(SEO_LOCALES.fa, { SITE, FEATURE_PAGES, STATIC_PAGES });
buildLocalePages(SEO_LOCALES.en, { SITE: SITE_EN, FEATURE_PAGES: FEATURE_PAGES_EN, STATIC_PAGES: STATIC_PAGES_EN });

// ── 9. Generate 404 Page (/404.html) ─────────────────────────────────────────
{
  const canonicalUrl = `${SITE.origin}/404`;
  const bodyHtml = `
    <div class="seo-404-box">
      <div class="seo-404-code">۴۰۴</div>
      <h1>صفحه مورد نظر پیدا نشد</h1>
      <p>نشانی واردشده اشتباه است یا این صفحه به نشانی دیگری منتقل شده است.</p>
      <div class="seo-cta-buttons">
        <a href="/" class="seo-btn seo-btn-primary">بازگشت به صفحه اصلی</a>
        <a href="/features" class="seo-btn seo-btn-ghost">مشاهده امکانات</a>
      </div>
    </div>`;

  const notFoundHtml = renderStaticPage({
    title: 'صفحه پیدا نشد | RealRate',
    description: 'صفحه مورد نظر یافت نشد. لطفاً به صفحه اصلی یا بخش امکانات ریل‌ریت بازگردید.',
    canonicalUrl,
    bodyHtml,
    noIndex: true,
  });

  writeFileSync(resolve(distDir, '404.html'), notFoundHtml, 'utf-8');
  console.log('✓ Generated dist/404.html (status 404 handler)');
}

// ── 10. Generate sitemap.xml ─────────────────────────────────────────────────
// Every page in both languages (English under /en), each listing its counterpart (hreflang)
{
  const pages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/features', priority: '0.9', changefreq: 'weekly' },
    ...FEATURE_PAGES.map((p) => ({ path: `/features/${p.slug}`, priority: '0.8', changefreq: 'weekly' })),
    { path: '/about', priority: '0.6', changefreq: 'monthly' },
    { path: '/faq', priority: '0.7', changefreq: 'weekly' },
    { path: '/android', priority: '0.8', changefreq: 'weekly' },
    { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { path: '/delete-account', priority: '0.3', changefreq: 'yearly' },
  ];
  // The Persian page keeps its own address; the home page's English twin is /en/
  const url = (loc, path) => `${SITE.origin}${loc.base}${path}`;
  const urls = pages.flatMap((p) => Object.values(SEO_LOCALES).map((loc) => ({ ...p, loc: url(loc, p.path), self: loc })));

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
${Object.values(SEO_LOCALES)
  .map((loc) => `    <xhtml:link rel="alternate" hreflang="${loc.code}" href="${url(loc, u.path)}"/>`)
  .join('\n')}
    <lastmod>${buildDateIso}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  writeFileSync(resolve(distDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log(`✓ Generated dist/sitemap.xml with ${urls.length} URLs`);
}

// ── 11. Generate robots.txt ──────────────────────────────────────────────────
{
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /app
Disallow: /rates
Disallow: /market
Disallow: /portfolio
Disallow: /transactions
Disallow: /loans
Disallow: /incomes
Disallow: /cheques
Disallow: /expenses
Disallow: /accounts
Disallow: /settings
Disallow: /app-settings
Disallow: /sms
Disallow: /news
Disallow: /reports
Disallow: /admin
Disallow: /sources
Disallow: /derived-assets
Disallow: /p/
Disallow: /reset-password
Disallow: /verify-email
Sitemap: ${SITE.origin}/sitemap.xml
`;

  writeFileSync(resolve(distDir, 'robots.txt'), robotsTxt, 'utf-8');
  console.log('✓ Generated dist/robots.txt');
}

// ── 12. Generate dist/_redirects (Eliminating soft 404s) ──────────────────────
{
  const redirectsContent = generateRedirects();
  writeFileSync(resolve(distDir, '_redirects'), redirectsContent, 'utf-8');
  console.log('✓ Generated dist/_redirects from spaRoutes.js (explicit SPA rewrites)');
}

// dist/_headers comes straight from public/_headers (Vite copies it)

console.log('🎉 SEO post-build generation completed successfully!');
