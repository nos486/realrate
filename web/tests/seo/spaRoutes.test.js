import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPA_ROUTES } from '../../src/seo/spaRoutes.js';
import { AUTH_PATHS, APP_BASE, DEMO_PATH } from '../../src/shared/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDir = resolve(__dirname, '../..');

describe('SPA Routes Coverage Tests', () => {
  it('covers all routes defined in shared/routes.js and App.jsx', () => {
    const appJsx = readFileSync(resolve(webDir, 'src/App.jsx'), 'utf-8');

    // Extract all <Route path="..." from App.jsx
    const routeRegex = /<Route[^>]+path=["']([^"']+)["']/g;
    const pathsInApp = [];
    let match;
    while ((match = routeRegex.exec(appJsx)) !== null) {
      const p = match[1];
      if (p !== '*' && p !== '/') {
        pathsInApp.push(p);
      }
    }

    // Also include AUTH_PATHS and DEMO_PATH
    for (const authPath of Object.values(AUTH_PATHS)) {
      if (!pathsInApp.includes(authPath)) pathsInApp.push(authPath);
    }
    if (!pathsInApp.includes(DEMO_PATH)) pathsInApp.push(DEMO_PATH);

    // Normalize each path for matching against SPA_ROUTES
    for (const rawPath of pathsInApp) {
      // Remove variables like :portfolioId or trailing /*
      const baseClean = rawPath.replace(/\/:[^/]+/g, '').replace(/\/\*$/, '');

      const isCovered = SPA_ROUTES.some((r) => {
        if (r.path === rawPath) return true;
        if (r.path === baseClean) return true;
        if (r.splat && (rawPath.startsWith(r.path + '/') || baseClean === r.path)) return true;
        if (r.path.endsWith('/*') && rawPath.startsWith(r.path.slice(0, -2))) return true;
        return false;
      });

      assert.ok(
        isCovered,
        `Route "${rawPath}" in App.jsx is not covered in spaRoutes.js! SPA routes must cover all client paths to avoid 404.`
      );
    }
  });

  it('generates redirects without catch-all /* /index.html 200', async () => {
    const { generateRedirects } = await import('../../src/seo/spaRoutes.js');
    const content = generateRedirects();

    assert.ok(!content.includes('/*    /index.html   200'), 'Must not contain old soft-404 catch-all');
    assert.ok(!content.includes('/* /index.html 200'), 'Must not contain old soft-404 catch-all');
    assert.ok(content.includes('/spa 200') || content.includes('/spa.html 200'), 'Must rewrite to /spa or /spa.html');
  });
});
