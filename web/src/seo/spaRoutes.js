/**
 * web/src/seo/spaRoutes.js
 * Explicit list of client-side SPA routes that rewrite to /spa (dist/spa.html) in Cloudflare Pages.
 * Non-SPA paths (static pages like /features/*, /about, /faq, /) and non-existent paths
 * will NOT match these rewrites, allowing non-existent paths to return a true 404 status.
 */

export const SPA_ROUTES = [
  // Public auth routes
  { path: '/login', splat: false },
  { path: '/register', splat: false },
  { path: '/forgot-password', splat: false },
  { path: '/reset-password', splat: false },
  { path: '/verify-email', splat: false },

  // Public demo & landing alias
  { path: '/demo', splat: false },
  { path: '/landing', splat: false },

  // Shared public portfolio (with client-side key hash)
  { path: '/p/*', splat: false },

  // Authenticated app sections (both root and nested subpaths)
  { path: '/app', splat: true },
  { path: '/rates', splat: true },
  { path: '/market', splat: true },
  { path: '/portfolio', splat: true },
  { path: '/transactions', splat: true },
  { path: '/loans', splat: true },
  { path: '/incomes', splat: true },
  { path: '/cheques', splat: true },
  { path: '/subscriptions', splat: true },
  { path: '/expenses', splat: true },
  { path: '/projects', splat: true },
  { path: '/accounts', splat: true },
  { path: '/settings', splat: true },
  { path: '/app-settings', splat: true },
  { path: '/sms', splat: true },
  { path: '/news', splat: true },
  { path: '/reports', splat: true },
  { path: '/admin', splat: true },
  { path: '/admin/sources', splat: true },
  { path: '/admin/derived', splat: true },
  { path: '/derived-assets', splat: true },
  { path: '/sources', splat: true },
];

/**
 * Generate Cloudflare Pages _redirects file content.
 * Exact paths are emitted before splat paths for optimal routing performance.
 * @returns {string}
 */
export function generateRedirects() {
  const lines = [
    '# Explicit rewrites for SPA client routes to /spa (200 status)',
    '# All static pages (/features/*, /about, /faq, /) are served directly as HTML',
    '# Any unlisted path falls through to 404.html with status 404 (no soft 404)',
    '',
  ];

  const exactRules = [];
  const splatRules = [];

  for (const route of SPA_ROUTES) {
    if (route.splat) {
      exactRules.push(`${route.path.padEnd(24)}/spa 200`);
      splatRules.push(`${(route.path + '/*').padEnd(24)}/spa 200`);
    } else if (route.path.endsWith('/*')) {
      splatRules.push(`${route.path.padEnd(24)}/spa 200`);
    } else {
      exactRules.push(`${route.path.padEnd(24)}/spa 200`);
    }
  }

  for (const r of exactRules) lines.push(r);
  for (const r of splatRules) lines.push(r);

  lines.push('');
  return lines.join('\n');
}
