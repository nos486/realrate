#!/usr/bin/env node
/**
 * web/scripts/build-seo.mjs
 * Post-build static SEO generator:
 * - Copies dist/index.html to dist/spa.html (noindex shell)
 * - Enhances dist/index.html with metadata, JSON-LD, and crawlable root fallback
 * - Generates standalone static HTML for /features, /features/*, /about, /faq, /android and /404
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
            <a href="/faq" style="color:#9ca3af;">سؤالات</a>
          </span>
        </footer>
      </div>
    </div>`;

landingHtml = landingHtml.replace('<div id="root"></div>', crawlableLandingContent);
writeFileSync(rawIndexHtmlPath, landingHtml, 'utf-8');
console.log('✓ Updated dist/index.html with metadata, JSON-LD, and crawlable fallback');

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
        ${buttons ?? `<a href="/register" class="seo-btn seo-btn-primary">شروع رایگان <span aria-hidden="true">←</span></a>
        ${DEMO_ENABLED ? '<a href="/demo" class="seo-btn seo-btn-ghost">دیدن نسخه‌ی دمو</a>' : ''}`}
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
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${robotsTag}
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE.name)}" />
    <meta property="og:locale" content="fa_IR" />
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
        <a href="/" class="seo-brand" aria-label="RealRate — صفحه‌ی اصلی">
          <span class="seo-brand-icon">${BRAND_ICON}</span>
          <span>${escapeHtml(SITE.name)}</span>
        </a>
        <nav class="seo-nav" aria-label="منوی اصلی">
          <a href="/features">امکانات</a>
          <a href="/android">اپ اندروید</a>
          <a href="/faq">سؤالات</a>
          <a href="/about">درباره</a>
        </nav>
        <a href="/login" class="seo-btn seo-btn-small">ورود <span aria-hidden="true">‹</span></a>
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
          <a href="/" class="seo-brand">
            <span class="seo-brand-icon">${BRAND_ICON}</span>
            <span>${escapeHtml(SITE.name)}</span>
          </a>
          <p>ابزار رایگان و متن‌باز برای دیدن ارزش واقعی دارایی‌ها و مدیریت مالی شخصی.</p>
        </div>
        <nav class="seo-footer-links" aria-label="پیوندها">
          <a href="/features">امکانات</a>
          <a href="/android">اپ اندروید</a>
          <a href="/about">درباره</a>
          <a href="/faq">سؤالات</a>
          ${DEMO_ENABLED ? '<a href="/demo">دمو</a>' : ''}
          <a href="https://github.com/nos486/realrate" target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
      </div>
      <div class="seo-container seo-footer-bottom">
        © ${new Date().getFullYear().toLocaleString('fa-IR', { useGrouping: false })} RealRate · متن‌باز با مجوز MIT
      </div>
    </footer>
  </body>
</html>`;
}

// ── 5. Generate Individual Feature Pages (/features/<slug>) ──────────────────
for (const page of FEATURE_PAGES) {
  const canonicalUrl = `${SITE.origin}/features/${page.slug}`;
  const breadcrumbs = [
    { label: 'خانه', url: `${SITE.origin}/` },
    { label: 'ویژگی‌ها', url: `${SITE.origin}/features` },
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
    <nav aria-label="مسیر راهنما">
      <ol class="seo-breadcrumb">
        <li><a href="/">خانه</a></li>
        <li><a href="/features">ویژگی‌ها</a></li>
        <li aria-current="page">${escapeHtml(page.h1)}</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">امکانات</div>
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
      <h2>چطور کار می‌کند؟</h2>
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
      <h2>پرسش‌های متداول</h2>
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
      <h2>امکانات مرتبط</h2>
      <div class="seo-related-grid">
        ${relatedPages
          .map(
            (rel) => `
          <div class="seo-related-card">
            <h3>${escapeHtml(rel.h1)}</h3>
            <p>${escapeHtml(rel.description)}</p>
            <a href="/features/${rel.slug}" class="seo-related-link">
              <span>بیشتر</span>
              <span aria-hidden="true">←</span>
            </a>
          </div>`
          )
          .join('')}
      </div>
    </section>`
        : ''
    }

    <!-- Call to Action Banner -->
    ${ctaBlock('همین حالا رایگان شروع کن', 'چند ثانیه با ایمیل یا حساب گوگل — بدون کارت بانکی و بدون تبلیغ.')}`;

  const html = renderStaticPage({
    title: page.title,
    description: page.description,
    canonicalUrl,
    ogImage: page.ogImage,
    breadcrumbs,
    jsonLdSchemas,
    bodyHtml,
  });

  const outPath = resolve(distDir, `features/${page.slug}.html`);
  writeFileSync(outPath, html, 'utf-8');
}
console.log(`✓ Generated ${FEATURE_PAGES.length} feature pages in dist/features/`);

// ── 6. Generate Features Hub Page (/features) ────────────────────────────────
{
  const canonicalUrl = `${SITE.origin}/features`;
  const breadcrumbs = [
    { label: 'خانه', url: `${SITE.origin}/` },
    { label: 'ویژگی‌ها', url: canonicalUrl },
  ];

  const appSchema = {
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
    'description': STATIC_PAGES.features.description,
  };

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="مسیر راهنما">
      <ol class="seo-breadcrumb">
        <li><a href="/">خانه</a></li>
        <li aria-current="page">ویژگی‌ها</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">امکانات</div>
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
          <a href="/features/${p.slug}" class="seo-hub-more">
            <span>بیشتر</span>
            <span aria-hidden="true">←</span>
          </a>
        </article>`
      ).join('')}
    </div>

    <!-- Call to Action Banner -->
    ${ctaBlock('همین حالا رایگان شروع کن', 'چند ثانیه با ایمیل یا حساب گوگل — بدون کارت بانکی و بدون تبلیغ.')}`;

  const hubHtml = renderStaticPage({
    title: STATIC_PAGES.features.title,
    description: STATIC_PAGES.features.description,
    canonicalUrl,
    ogImage: STATIC_PAGES.features.ogImage,
    breadcrumbs,
    jsonLdSchemas: [appSchema],
    bodyHtml,
  });

  writeFileSync(resolve(distDir, 'features.html'), hubHtml, 'utf-8');
  console.log('✓ Generated dist/features.html (hub, served at /features)');
}

// ── 7. Generate About Page (/about) ──────────────────────────────────────────
{
  const about = STATIC_PAGES.about;
  const canonicalUrl = `${SITE.origin}/about`;
  const breadcrumbs = [
    { label: 'خانه', url: `${SITE.origin}/` },
    { label: 'درباره ما', url: canonicalUrl },
  ];

  const appSchema = {
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
    'description': about.description,
  };

  const bodyHtml = `
    <!-- Breadcrumb -->
    <nav aria-label="مسیر راهنما">
      <ol class="seo-breadcrumb">
        <li><a href="/">خانه</a></li>
        <li aria-current="page">درباره ما</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">درباره</div>
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
    ${ctaBlock('همین حالا رایگان شروع کن', 'چند ثانیه با ایمیل یا حساب گوگل — بدون کارت بانکی و بدون تبلیغ.')}`;

  const aboutHtml = renderStaticPage({
    title: about.title,
    description: about.description,
    canonicalUrl,
    ogImage: about.ogImage,
    breadcrumbs,
    jsonLdSchemas: [appSchema],
    bodyHtml,
  });

  writeFileSync(resolve(distDir, 'about.html'), aboutHtml, 'utf-8');
  console.log('✓ Generated dist/about.html');
}

// ── 8. Generate FAQ Page (/faq) ──────────────────────────────────────────────
{
  const faqPage = STATIC_PAGES.faq;
  const canonicalUrl = `${SITE.origin}/faq`;
  const breadcrumbs = [
    { label: 'خانه', url: `${SITE.origin}/` },
    { label: 'پرسش‌های متداول', url: canonicalUrl },
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
    <nav aria-label="مسیر راهنما">
      <ol class="seo-breadcrumb">
        <li><a href="/">خانه</a></li>
        <li aria-current="page">پرسش‌های متداول</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">سؤالات</div>
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
      <h2>جواب سؤالت را پیدا نکردی؟</h2>
      <p>برنامه را رایگان امتحان کن یا سؤالت را در گیت‌هاب بپرس.</p>
      <div class="seo-cta-buttons">
        <a href="/register" class="seo-btn seo-btn-primary">شروع رایگان <span aria-hidden="true">←</span></a>
        <a href="https://github.com/nos486/realrate/issues" target="_blank" rel="noopener noreferrer" class="seo-btn seo-btn-ghost">پرسیدن در GitHub</a>
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
  });

  writeFileSync(resolve(distDir, 'faq.html'), faqHtml, 'utf-8');
  console.log('✓ Generated dist/faq.html');
}

// ── 8b. Generate Android App Page (/android) ─────────────────────────────────
// Download of the signed APK (the latest GitHub release) and how to install it, including the
// Play Protect warning a sideloaded app with the SMS permission meets
{
  const app = STATIC_PAGES.android;
  const canonicalUrl = `${SITE.origin}/android`;
  const breadcrumbs = [
    { label: 'خانه', url: `${SITE.origin}/` },
    { label: 'اپ اندروید', url: canonicalUrl },
  ];

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    'name': SITE.name,
    'applicationCategory': 'FinanceApplication',
    'operatingSystem': 'Android 7.0+',
    'inLanguage': 'fa',
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
    <nav aria-label="مسیر راهنما">
      <ol class="seo-breadcrumb">
        <li><a href="/">خانه</a></li>
        <li aria-current="page">اپ اندروید</li>
      </ol>
    </nav>

    <!-- Hero -->
    <header class="seo-hero">
      <div class="seo-badge">رایگان · متن‌باز · امضاشده</div>
      <h1>${escapeHtml(app.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(app.intro)}</p>
      <div class="seo-cta-buttons">
        <a href="${escapeHtml(app.downloadUrl)}" class="seo-btn seo-btn-primary" download>دانلود اپ اندروید</a>
        <a href="${escapeHtml(app.releasesUrl)}" target="_blank" rel="noopener noreferrer" class="seo-btn seo-btn-ghost">همه‌ی نسخه‌ها و تغییرات</a>
      </div>
      <p class="seo-hero-note">اندروید ۷ به بالا · همیشه آخرین نسخه · به‌روزرسانی روی نسخه‌ی قبلی نصب می‌شود</p>
    </header>

    <!-- Install steps -->
    <section class="seo-steps-block">
      <h2>راهنمای نصب</h2>
      <div class="seo-steps-grid">
        ${app.steps
          .map(
            (step, i) => `
          <div class="seo-step-card">
            <span class="seo-step-num">${(i + 1).toLocaleString('fa-IR')}</span>
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
      <h2>پرسش‌های متداول</h2>
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
      <h2>ترجیح می‌دهید بدون نصب شروع کنید؟</h2>
      <p>همه‌ی امکانات ریل‌ریت در مرورگر هم در دسترس است؛ با همان حساب، هر وقت خواستید اپ را نصب کنید.</p>
      <div class="seo-cta-buttons">
        <a href="${escapeHtml(app.downloadUrl)}" class="seo-btn seo-btn-primary" download>دانلود اپ اندروید</a>
        <a href="/register" class="seo-btn seo-btn-ghost">ثبت‌نام در سایت</a>
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
  });

  writeFileSync(resolve(distDir, 'android.html'), androidHtml, 'utf-8');
  console.log('✓ Generated dist/android.html');
}

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
{
  const urls = [
    { loc: `${SITE.origin}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE.origin}/features`, priority: '0.9', changefreq: 'weekly' },
    ...FEATURE_PAGES.map((p) => ({
      loc: `${SITE.origin}/features/${p.slug}`,
      priority: '0.8',
      changefreq: 'weekly',
    })),
    { loc: `${SITE.origin}/about`, priority: '0.6', changefreq: 'monthly' },
    { loc: `${SITE.origin}/faq`, priority: '0.7', changefreq: 'weekly' },
    { loc: `${SITE.origin}/android`, priority: '0.8', changefreq: 'weekly' },
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
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
