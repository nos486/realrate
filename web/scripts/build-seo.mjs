#!/usr/bin/env node
/**
 * web/scripts/build-seo.mjs
 * Post-build static SEO generator:
 * - Copies dist/index.html to dist/spa.html (noindex shell)
 * - Enhances dist/index.html with metadata, JSON-LD, and crawlable root fallback
 * - Generates standalone static HTML for /features, /features/*, /about, /faq, and /404
 * - Copies fonts and SEO CSS into dist/seo/
 * - Emits dist/sitemap.xml and dist/robots.txt
 * - Generates dist/_redirects (eliminating catch-all soft 404) and updates dist/_headers
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SITE, FEATURE_PAGES, STATIC_PAGES } from '../src/seo/pages.js';
import { generateRedirects } from '../src/seo/spaRoutes.js';

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
      <div class="landing-ssr-fallback" style="display:block;color:#f3f4f6;background:#07090e;min-height:100vh;padding:2.5rem 1.25rem;font-family:Vazirmatn,system-ui,sans-serif;max-width:960px;margin:0 auto;line-height:1.8;" dir="rtl">
        <header style="margin-bottom:2rem;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:1rem;display:flex;align-items:center;justify-content:space-between;">
          <strong style="font-size:1.4rem;color:#f59e0b;">RealRate | ریل‌ریت</strong>
          <nav style="display:flex;gap:1.2rem;font-size:0.95rem;">
            <a href="/features" style="color:#38bdf8;">همه ویژگی‌ها</a>
            <a href="/about" style="color:#f3f4f6;">درباره</a>
            <a href="/faq" style="color:#f3f4f6;">سؤالات متداول</a>
            <a href="/login" style="color:#f3f4f6;">ورود</a>
            <a href="/register" style="color:#10b981;font-weight:700;">ثبت‌نام</a>
          </nav>
        </header>
        <main>
          <h1 style="font-size:2rem;font-weight:800;margin-bottom:1rem;color:#fff;">ارزش واقعی دارایی‌هایت را بشناس</h1>
          <p style="font-size:1.1rem;color:#9ca3af;margin-bottom:2rem;">
            پلتفرم تحلیلی، مستقل و رمزنگاری‌شده برای محاسبه ارزش ذاتی و حباب طلا و سکه، مدیریت پورتفوی سرمایه‌گذاری، وام‌ها، اقساط، چک‌ها و درآمدها — ۱۰۰٪ رایگان و متن‌باز.
          </p>
          <div style="display:flex;gap:1rem;margin-bottom:3rem;flex-wrap:wrap;">
            <a href="/register" style="background:#0284c7;color:#fff;padding:0.6rem 1.4rem;border-radius:8px;font-weight:700;text-decoration:none;">شروع رایگان</a>
            <a href="/demo" style="background:#f59e0b;color:#07090e;padding:0.6rem 1.4rem;border-radius:8px;font-weight:700;text-decoration:none;">مشاهده نسخه دمو</a>
          </div>
          <section style="margin-bottom:3rem;">
            <h2 style="font-size:1.4rem;color:#fff;margin-bottom:1.2rem;">ویژگی‌ها و امکانات کلیدی</h2>
            <ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:1rem;">
              ${FEATURE_PAGES.map(
                (p) => `
                <li style="background:#0e121a;border:1px solid rgba(255,255,255,0.08);padding:1.2rem;border-radius:12px;">
                  <h3 style="font-size:1.05rem;margin-bottom:0.5rem;"><a href="/features/${p.slug}" style="color:#38bdf8;text-decoration:none;">${escapeHtml(p.h1)}</a></h3>
                  <p style="font-size:0.88rem;color:#9ca3af;line-height:1.6;">${escapeHtml(p.description)}</p>
                </li>`
              ).join('')}
            </ul>
          </section>
        </main>
        <footer style="margin-top:3rem;border-top:1px solid rgba(255,255,255,0.08);padding-top:1.5rem;font-size:0.85rem;color:#6b7280;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <span>© RealRate — پلتفرم آزاد تحت مجوز MIT</span>
          <div>
            <a href="/features" style="color:#9ca3af;margin-left:1rem;">امکانات</a>
            <a href="/about" style="color:#9ca3af;margin-left:1rem;">درباره ریل‌ریت</a>
            <a href="/faq" style="color:#9ca3af;">پرسش‌های متداول</a>
          </div>
        </footer>
      </div>
    </div>`;

landingHtml = landingHtml.replace('<div id="root"></div>', crawlableLandingContent);
writeFileSync(rawIndexHtmlPath, landingHtml, 'utf-8');
console.log('✓ Updated dist/index.html with metadata, JSON-LD, and crawlable fallback');

// ── 4. Shared HTML Template Generator for Static Pages ───────────────────────
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
    <link rel="stylesheet" href="/seo/seo.css" />
${jsonLdBlock}
  </head>
  <body>
    <!-- Header -->
    <header class="seo-header">
      <div class="seo-container seo-header-inner">
        <a href="/" class="seo-brand" aria-label="صفحه اصلی RealRate">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
          <span>${escapeHtml(SITE.name)}</span>
          <span class="seo-brand-tag">متن‌باز</span>
        </a>

        <nav class="seo-nav" aria-label="منوی سایت">
          <a href="/features">ویژگی‌ها</a>
          <a href="/about">درباره</a>
          <a href="/faq">پرسش‌های متداول</a>
          <a href="https://github.com/nos486/realrate" target="_blank" rel="noopener noreferrer">گیت‌هاب</a>
        </nav>

        <div class="seo-header-actions">
          <a href="/demo" class="seo-btn seo-btn-demo">نسخه دمو</a>
          <a href="/login" class="seo-btn seo-btn-ghost">ورود</a>
          <a href="/register" class="seo-btn seo-btn-primary">ثبت‌نام</a>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="seo-main">
      <div class="seo-container">
        ${bodyHtml}
      </div>
    </main>

    <!-- Footer -->
    <footer class="seo-footer">
      <div class="seo-container">
        <div class="seo-footer-grid">
          <div class="seo-footer-about">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
              <span>RealRate | ریل‌ریت</span>
            </h3>
            <p>
              پلتفرم مستقل، آزاد و رمزنگاری‌شده برای تحلیل ارزش واقعی طلا و سکه، مدیریت متمرکز پورتفوی چنددارایی، وام‌ها و درآمدها. بدون تبلیغات، کاملاً رایگان تحت مجوز MIT.
            </p>
          </div>

          <div class="seo-footer-col">
            <h4>امکانات کلیدی</h4>
            <ul class="seo-footer-links">
              <li><a href="/features/gold-coin-bubble">ارزش ذاتی و حباب سکه</a></li>
              <li><a href="/features/portfolio">مدیریت پورتفوی ابری</a></li>
              <li><a href="/features/transactions">تراکنش‌ها و میانگین موزون</a></li>
              <li><a href="/features/loans">وام‌ها و جدول اقساط</a></li>
              <li><a href="/features/income">مدیریت درآمدهای ماهانه</a></li>
              <li><a href="/features/cheques">مدیریت چک‌های صیادی</a></li>
              <li><a href="/features/ai-cheque-scan">اسکن چک با هوش مصنوعی</a></li>
              <li><a href="/features/encryption">رمزنگاری سرتاسری (E2EE)</a></li>
              <li><a href="/features/personal-dashboard">داشبورد شخصی و PWA</a></li>
              <li><a href="/features/demo">نسخه دموی آزمایشی</a></li>
            </ul>
          </div>

          <div class="seo-footer-col">
            <h4>دسترسی و توسعه</h4>
            <ul class="seo-footer-links">
              <li><a href="/features">همه امکانات</a></li>
              <li><a href="/about">درباره ریل‌ریت</a></li>
              <li><a href="/faq">پرسش‌های متداول</a></li>
              <li><a href="/demo">مشاهده محیط دمو</a></li>
              <li><a href="https://github.com/nos486/realrate" target="_blank" rel="noopener noreferrer">مخزن گیت‌هاب</a></li>
              <li><a href="https://github.com/nos486/realrate/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">مجوز انتشار (MIT)</a></li>
            </ul>
          </div>
        </div>

        <div class="seo-footer-bottom">
          <span>© ${new Date().getFullYear()} RealRate. تمام حقوق بر پایه پروانه آزاد MIT برای جامعه محفوظ است.</span>
          <span>امنیت Zero-Knowledge و احترام کامل به حریم خصوصی</span>
        </div>
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
      <div class="seo-badge">قابلیت رسمی RealRate</div>
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
            (item) => `
          <div class="seo-faq-item">
            <h3 class="seo-faq-q">${escapeHtml(item.q)}</h3>
            <p class="seo-faq-a">${escapeHtml(item.a)}</p>
          </div>`
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
      <h2>سایر امکانات مرتبط</h2>
      <div class="seo-related-grid">
        ${relatedPages
          .map(
            (rel) => `
          <div class="seo-related-card">
            <h3>${escapeHtml(rel.h1)}</h3>
            <p>${escapeHtml(rel.description)}</p>
            <a href="/features/${rel.slug}" class="seo-related-link">
              <span>مطالعه بیشتر</span>
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
    <section class="seo-cta">
      <h2>همین حالا مدیریت مالی خود را متحول کنید</h2>
      <p>بدون نیاز به اشتراک یا پرداخت هزینه، حساب کاربری رایگان و امن خود را بسازید یا محیط برنامه را در حالت دمو امتحان کنید.</p>
      <div class="seo-cta-buttons">
        <a href="/register" class="seo-btn seo-btn-primary">ثبت‌نام رایگان</a>
        <a href="/demo" class="seo-btn seo-btn-demo">مشاهده نسخه دمو</a>
      </div>
    </section>`;

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
      <div class="seo-badge">مرکز امکانات RealRate</div>
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
            <span>بررسی قابلیت و جزئیات</span>
            <span aria-hidden="true">←</span>
          </a>
        </article>`
      ).join('')}
    </div>

    <!-- Call to Action Banner -->
    <section class="seo-cta">
      <h2>شروع رایگان با امنیت Zero-Knowledge</h2>
      <p>تنها در چند ثانیه بدون نیاز به شماره همراه، با ایمیل یا حساب گوگل خود وارد دنیای مدیریت مالی شفاف شوید.</p>
      <div class="seo-cta-buttons">
        <a href="/register" class="seo-btn seo-btn-primary">ثبت‌نام رایگان</a>
        <a href="/demo" class="seo-btn seo-btn-demo">مشاهده نسخه دمو</a>
      </div>
    </section>`;

  const hubHtml = renderStaticPage({
    title: STATIC_PAGES.features.title,
    description: STATIC_PAGES.features.description,
    canonicalUrl,
    ogImage: STATIC_PAGES.features.ogImage,
    breadcrumbs,
    jsonLdSchemas: [appSchema],
    bodyHtml,
  });

  writeFileSync(resolve(distDir, 'features/index.html'), hubHtml, 'utf-8');
  console.log('✓ Generated dist/features/index.html (hub)');
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
      <div class="seo-badge">درباره RealRate</div>
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
    <section class="seo-cta">
      <h2>به جامعه کاربران RealRate بپیوندید</h2>
      <p>از نرم‌افزاری استفاده کنید که برای شما ساخته شده، نه برای فروش داده‌های مالی‌تان به تبلیغ‌دهندگان.</p>
      <div class="seo-cta-buttons">
        <a href="/register" class="seo-btn seo-btn-primary">ثبت‌نام رایگان</a>
        <a href="/demo" class="seo-btn seo-btn-demo">مشاهده نسخه دمو</a>
      </div>
    </section>`;

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
      <div class="seo-badge">مرکز پاسخگویی</div>
      <h1>${escapeHtml(faqPage.h1)}</h1>
      <p class="seo-hero-intro">${escapeHtml(faqPage.intro)}</p>
    </header>

    <!-- FAQ Grid -->
    <div class="seo-faq-grid">
      ${faqPage.faqs
        .map(
          (item) => `
        <div class="seo-faq-item">
          <h2 class="seo-faq-q" style="font-size:1.1rem;display:block;">${escapeHtml(item.q)}</h2>
          <p class="seo-faq-a">${escapeHtml(item.a)}</p>
        </div>`
        )
        .join('')}
    </div>

    <!-- CTA -->
    <section class="seo-cta">
      <h2>پاسخ سؤالتان را نیافتید؟</h2>
      <p>می‌توانید محیط برنامه را بدون ثبت‌نام در نسخه دمو تست کنید یا در گیت‌هاب با توسعه‌دهندگان در ارتباط باشید.</p>
      <div class="seo-cta-buttons">
        <a href="/demo" class="seo-btn seo-btn-demo">مشاهده نسخه دمو</a>
        <a href="https://github.com/nos486/realrate/issues" target="_blank" rel="noopener noreferrer" class="seo-btn seo-btn-ghost">طرح سؤال در GitHub</a>
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
Disallow: /settings
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

// ── 13. Update dist/_headers ─────────────────────────────────────────────────
{
  const baseHeadersPath = resolve(webDir, 'public/_headers');
  let headersContent = existsSync(baseHeadersPath) ? readFileSync(baseHeadersPath, 'utf-8') : '';

  const additionalHeaders = `
# Disallow indexing of private or raw SPA shell responses
/p/*
  X-Robots-Tag: noindex
/spa
  X-Robots-Tag: noindex
/spa.html
  X-Robots-Tag: noindex

# Immutable static SEO assets
/seo/*
  Cache-Control: public, max-age=31536000, immutable
/og/*
  Cache-Control: public, max-age=31536000, immutable
`;

  if (!headersContent.includes('X-Robots-Tag: noindex')) {
    headersContent += additionalHeaders;
  }

  writeFileSync(resolve(distDir, '_headers'), headersContent, 'utf-8');
  console.log('✓ Generated dist/_headers with X-Robots-Tag and cache rules');
}

console.log('🎉 SEO post-build generation completed successfully!');
