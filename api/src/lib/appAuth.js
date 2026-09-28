/**
 * appAuth.js — Google sign-in for the Android app
 *
 * Google refuses sign-in inside an app's WebView, so the app opens the sign-in in the phone's
 * browser and gets back through its own link (ir.realrate.app://auth). Anything could claim that
 * link, so what comes back is not a session but a one-time code, bound to a secret the app made
 * before starting (PKCE, RFC 7636 / RFC 8252):
 *  1. The app keeps a random `verifier` and sends `app_challenge` = SHA-256(verifier), base64url,
 *     to /api/auth/google/login.
 *  2. After Google, the callback stores a one-time code for the user, tied to the challenge
 *     (auth_tokens, purpose "app_signin:<challenge>", 2 minutes), and redirects to
 *     ir.realrate.app://auth?code=… (or ?auth_error=…).
 *  3. The app sends the code and its verifier to POST /api/auth/app/signin and gets a session;
 *     a code taken by anyone without the verifier is useless.
 */

export const APP_AUTH_REDIRECT = "ir.realrate.app://auth";
/** Origin of the app's own pages (Capacitor's WebView on Android) */
export const APP_WEBVIEW_ORIGIN = "https://localhost";
export const APP_SIGNIN_CODE_TTL = 120;

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;

/** A SHA-256 challenge in base64url (43 characters) */
export function isAppChallenge(value) {
  return typeof value === "string" && CHALLENGE_RE.test(value);
}

export function isAppVerifier(value) {
  return typeof value === "string" && VERIFIER_RE.test(value);
}

/** auth_tokens purpose of a code bound to `challenge` */
export function appSignInPurpose(challenge) {
  return `app_signin:${challenge}`;
}

/** The challenge of a verifier: SHA-256, base64url without padding */
export async function appChallengeOf(verifier) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let binary = "";
  for (const b of digest) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The app's link with `params` (code, or auth_error) */
export function appAuthRedirect(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  return `${APP_AUTH_REDIRECT}?${query}`;
}
