#!/usr/bin/env node
/**
 * web/scripts/make-og.mjs
 * Generates 1200x630 Open Graph images for RealRate and its feature pages.
 * Run once (not part of normal build): node scripts/make-og.mjs
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_PAGES, SITE } from '../src/seo/pages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDir = resolve(__dirname, '..');
const outDir = resolve(webDir, 'public/og');

mkdirSync(outDir, { recursive: true });

function getExecutablePath() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  const candidatePaths = [
    '/opt/pw-browsers/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidatePaths) {
    if (existsSync(p)) return p;
  }
  return undefined; // Let Playwright use its default installed browser
}

async function renderTemplate({ title, subtitle, badge }) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @font-face {
      font-family: 'Vazirmatn';
      src: local('Vazirmatn'), local('Vazir'), system-ui;
      font-weight: 100 900;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px;
      height: 630px;
      background: #07090e;
      color: #f3f4f6;
      font-family: 'Vazirmatn', system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 60px 70px;
      position: relative;
      overflow: hidden;
    }
    /* Ambient Aurora Glow */
    .glow-gold {
      position: absolute;
      top: -120px;
      right: -80px;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 70%);
      pointer-events: none;
    }
    .glow-blue {
      position: absolute;
      bottom: -150px;
      left: -100px;
      width: 550px;
      height: 550px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(2, 132, 199, 0.22) 0%, transparent 70%);
      pointer-events: none;
    }
    .grid-lines {
      position: absolute;
      inset: 0;
      background-image: linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .brand-logo {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.35);
    }
    .brand-logo svg {
      width: 28px;
      height: 28px;
      color: #07090e;
    }
    .brand-name {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .brand-sub {
      font-size: 20px;
      color: #9ca3af;
      font-weight: 500;
      margin-right: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: 9999px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fbbf24;
      font-size: 18px;
      font-weight: 700;
    }
    .main {
      position: relative;
      z-index: 10;
      max-width: 1040px;
    }
    .title {
      font-size: 50px;
      font-weight: 900;
      line-height: 1.35;
      color: #ffffff;
      margin-bottom: 20px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    }
    .subtitle {
      font-size: 24px;
      line-height: 1.7;
      color: #9ca3af;
      max-width: 960px;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 24px;
      position: relative;
      z-index: 10;
    }
    .tags {
      display: flex;
      gap: 14px;
    }
    .tag {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 6px 14px;
      font-size: 16px;
      color: #d1d5db;
      font-weight: 600;
    }
    .domain {
      font-size: 20px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.02em;
      direction: ltr;
    }
  </style>
</head>
<body>
  <div class="glow-gold"></div>
  <div class="glow-blue"></div>
  <div class="grid-lines"></div>

  <div class="header">
    <div class="brand">
      <div class="brand-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
          <polyline points="16 7 22 7 22 13"></polyline>
        </svg>
      </div>
      <span class="brand-name">RealRate</span>
      <span class="brand-sub">| ریل‌ریت</span>
    </div>
    <div class="badge">${badge}</div>
  </div>

  <div class="main">
    <h1 class="title">${title}</h1>
    <p class="subtitle">${subtitle}</p>
  </div>

  <div class="footer">
    <div class="tags">
      <span class="tag">۱۰۰٪ رایگان و متن‌باز</span>
      <span class="tag">رمزنگاری سرتاسری (Zero-Knowledge)</span>
      <span class="tag">بدون ردیاب تجاری</span>
    </div>
    <span class="domain">realrate.geekio.org</span>
  </div>
</body>
</html>`;
}

async function main() {
  console.log('📸 Generating OG images...');

  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (err) {
    console.error('❌ Playwright is not installed. Run "npm i -D playwright" first.');
    process.exit(1);
  }

  const execPath = getExecutablePath();
  const launchOptions = {
    headless: true,
  };
  if (execPath) {
    console.log(`Using browser at: ${execPath}`);
    launchOptions.executablePath = execPath;
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  const targets = [
    {
      filename: 'default.png',
      badge: 'پلتفرم مدیریت مالی شخصی',
      title: 'تحلیل ارزش واقعی طلا، سکه و مدیریت مالی شخصی',
      subtitle: 'محاسبه ریاضی حباب سکه و انس طلا، مدیریت پورتفوی چنددارایی، وام‌ها و درآمدها با رمزنگاری سرتاسری.',
    },
    ...FEATURE_PAGES.map((p) => ({
      filename: `${p.slug}.png`,
      badge: 'امکانات RealRate',
      title: p.h1,
      subtitle: p.intro.length > 140 ? p.intro.slice(0, 137) + '...' : p.intro,
    })),
  ];

  for (const item of targets) {
    const page = await context.newPage();
    const html = await renderTemplate(item);
    await page.setContent(html, { waitUntil: 'load' });
    // Let font settle
    await page.waitForTimeout(100);

    const outPath = resolve(outDir, item.filename);
    await page.screenshot({ path: outPath, type: 'png' });
    await page.close();

    const stats = statSync(outPath);
    const kb = (stats.size / 1024).toFixed(1);
    console.log(`✓ Generated ${item.filename} (${kb} KB)`);

    if (stats.size > 200 * 1024) {
      console.warn(`⚠️ Warning: ${item.filename} is larger than 200KB (${kb} KB)`);
    }
  }

  await browser.close();
  console.log(`🎉 Generated ${targets.length} OG images in web/public/og/`);
}

main().catch((err) => {
  console.error('❌ OG generation failed:', err);
  process.exit(1);
});
