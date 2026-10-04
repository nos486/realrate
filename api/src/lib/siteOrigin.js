/**
 * siteOrigin.js — The site's address, for every link the API builds (emails, the sign-in
 * redirect): one place, not a default per handler
 *
 *   SITE_ORIGIN   the public site (https://realrate.ir); the API itself is at API_ORIGIN
 *   FRONTEND_URL  optional var: another of our frontends to use instead (a trusted origin only)
 *
 * A link never points at the API's own host: a request's Origin is used only when it is one of
 * our frontends (not the Android app's WebView, which is no website), else the configured site.
 */

import { isTrustedOrigin } from "./security.js";
import { APP_WEBVIEW_ORIGIN } from "./appAuth.js";

export const SITE_ORIGIN = "https://realrate.ir";
export const API_ORIGIN = "https://api.realrate.ir";

/** The configured site: FRONTEND_URL when it is one of ours, else SITE_ORIGIN */
export function siteOrigin(env) {
  const configured = String(env?.FRONTEND_URL || "").trim();
  return configured && isTrustedOrigin(configured) ? new URL(configured).origin : SITE_ORIGIN;
}

/** Where links in a reply to this request point: the frontend that made it, when it is one of ours */
export function resolveFrontendOrigin(request, env) {
  const origin = request?.headers?.get?.("Origin");
  if (origin && origin !== APP_WEBVIEW_ORIGIN && isTrustedOrigin(origin)) return new URL(origin).origin;
  return siteOrigin(env);
}
