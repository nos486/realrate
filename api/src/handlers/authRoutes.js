/**
 * authRoutes.js — Auth route handlers: Google Sign-In, session check, logout
 *
 * Session strategy:
 *  - Session token is returned in BOTH a cookie AND the JSON response body.
 *  - The frontend SPA stores the token in localStorage and sends it as:
 *      Authorization: Bearer <token>
 *  - Cookie is also set for backward compat (SameSite=None for cross-origin).
 */

import { isUserAdmin, getAuthenticatedUser } from "../lib/auth.js";
import { SITE_ORIGIN, siteOrigin } from "../lib/siteOrigin.js";
import {
  dbUpsertUser,
  dbSaveSession,
  dbDeleteSession,
  dbGetUserById,
  dbGetUserAuthById,
  dbGetUserAuthByEmail,
  dbRecordUserActivity,
  dbRecordUserClient,
  dbCreateAuthToken,
} from "../repositories/index.js";
import { CLIENT_HEADER, parseClientHeader } from "../domain/clientInfo.js";
import { getDemoVaultPassphrase, DEMO_EMAIL } from "../repositories/demo.repository.js";
import { ACCOUNT_DISABLED_MESSAGE } from "./accountRoutes.js";
import { getMaintenance } from "../lib/maintenance.js";
import { jsonResponse, errorResponse, getCorsHeaders, safeWaitUntil } from "../lib/helpers.js";
import { logger } from "../lib/logger.js";
import { isTrustedOrigin } from "../lib/security.js";
import { isAppChallenge, appAuthRedirect, appSignInPurpose, APP_SIGNIN_CODE_TTL } from "../lib/appAuth.js";
import {
  SESSION_TTL_SECONDS,
  SESSION_COOKIE_MAX_AGE,
  OAUTH_VERIFIER_COOKIE_MAX_AGE,
} from "../config/constants.js";
import { userFeatures } from "../lib/features.js";
import { dbGetUserRequestedGroupKeys } from "../repositories/userGroups.repository.js";

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

async function generatePkce() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = base64UrlEncode(randomBytes);

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const codeChallenge = base64UrlEncode(digest);

  return { codeVerifier, codeChallenge };
}

function resolveRedirectUri(request, env) {
  const custom = (env.GOOGLE_REDIRECT_URI || "").trim();
  if (custom) return custom;
  const url = new URL(request.url);
  return `${url.origin}/api/auth/google/callback`;
}

/**
 * Build the post-login redirect URL. The final URL is always re-checked against the trusted
 * origin list, so neither an absolute return_to nor a protocol-relative one ("//evil.example")
 * can send the session token off-site.
 */
export function buildFrontendRedirect(frontendOrigin, returnTo, params = {}) {
  let baseOrigin = SITE_ORIGIN;
  if (frontendOrigin && isTrustedOrigin(frontendOrigin)) {
    baseOrigin = new URL(frontendOrigin).origin;
  }

  let finalUrl;
  try {
    const target = String(returnTo || "/");
    finalUrl = /^https?:\/\//i.test(target)
      ? new URL(target)
      : new URL(target.startsWith("/") ? target : `/${target}`, baseOrigin);
  } catch {
    finalUrl = null;
  }

  if (!finalUrl || !isTrustedOrigin(finalUrl.origin)) {
    finalUrl = new URL("/", baseOrigin);
  }

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      finalUrl.searchParams.set(key, val);
    }
  }

  return finalUrl.toString();
}

/**
 * GET /api/auth/google/login
 * Redirects user to Google's official OAuth consent screen with PKCE & Authorized redirect URI
 */
export async function handleGoogleLogin(request, env) {
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    return errorResponse("GOOGLE_CLIENT_ID تنظیم نشده است.", 500, request);
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") || url.searchParams.get("redirect") || "/";

  // Determine frontend origin from referer or return_to
  let frontendOrigin = siteOrigin(env);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (isTrustedOrigin(refUrl.origin)) {
        frontendOrigin = refUrl.origin;
      }
    } catch {}
  }

  try {
    const parsed = new URL(returnTo);
    if (isTrustedOrigin(parsed.origin)) {
      frontendOrigin = parsed.origin;
    }
  } catch {}

  const redirectUri = resolveRedirectUri(request, env);
  const { codeVerifier, codeChallenge } = await generatePkce();
  const nonce = crypto.randomUUID();

  // Sign-in started by the Android app (in the phone's browser): it ends back in the app
  const appChallenge = url.searchParams.get("app_challenge");
  const statePayload = {
    returnTo,
    frontendOrigin,
    redirectUri,
    nonce,
    ...(isAppChallenge(appChallenge) ? { app: appChallenge } : {}),
  };
  const stateStr = base64UrlEncode(new TextEncoder().encode(JSON.stringify(statePayload)));

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "select_account");
  googleAuthUrl.searchParams.set("state", stateStr);
  googleAuthUrl.searchParams.set("code_challenge", codeChallenge);
  googleAuthUrl.searchParams.set("code_challenge_method", "S256");

  // Temporary verifier cookie (valid 10 mins)
  const verifierCookie = `rr_oauth_verifier=${encodeURIComponent(`${codeVerifier}:${nonce}`)}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=${OAUTH_VERIFIER_COOKIE_MAX_AGE}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: googleAuthUrl.toString(),
      "Set-Cookie": verifierCookie,
    },
  });
}

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth redirect callback, exchanges authorization code, sets session
 */
export async function handleGoogleCallback(request, env) {
  const url = new URL(request.url);
  const errorParam = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");

  let stateData = {};
  if (stateRaw) {
    try {
      const decoded = base64UrlDecode(stateRaw);
      stateData = JSON.parse(decoded);
    } catch (e) {
      logger.warn("Could not decode state in callback:", { error: e.message });
    }
  }

  const frontendOrigin = stateData.frontendOrigin || siteOrigin(env);
  const returnTo = stateData.returnTo || "/";
  const redirectUri = stateData.redirectUri || resolveRedirectUri(request, env);
  const appChallenge = isAppChallenge(stateData.app) ? stateData.app : null;
  // Where the browser goes when sign-in ends: the web app, or back into the Android app
  const finishTarget = (params) =>
    appChallenge ? appAuthRedirect(params) : buildFrontendRedirect(frontendOrigin, returnTo, params);

  // If user cancelled or Google returned an error
  if (errorParam) {
    const errorTarget = finishTarget({
      auth_error: errorParam === "access_denied" ? "ورود با گوگل لغو شد." : errorParam,
    });
    return Response.redirect(errorTarget, 302);
  }

  if (!code) {
    const errorTarget = finishTarget({
      auth_error: "کد اعتبارسنجی از گوگل دریافت نشد.",
    });
    return Response.redirect(errorTarget, 302);
  }

  // Retrieve PKCE code_verifier from cookie
  let codeVerifier = null;
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/rr_oauth_verifier=([^;]+)/);
  if (match) {
    try {
      const [v, nonce] = decodeURIComponent(match[1]).split(":");
      if (v && nonce && stateData.nonce && nonce === stateData.nonce) {
        codeVerifier = v;
      }
    } catch {}
  }

  // The state must come from a login this browser started (login-CSRF protection)
  if (!codeVerifier) {
    const errorTarget = finishTarget({
      auth_error: "نشست ورود نامعتبر یا منقضی شده است. لطفاً دوباره وارد شوید.",
    });
    return Response.redirect(errorTarget, 302);
  }

  try {
    // Exchange authorization code for tokens
    const tokenBody = new URLSearchParams({
      code,
      client_id: (env.GOOGLE_CLIENT_ID || "").trim(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    if (env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CLIENT_SECRET.trim()) {
      tokenBody.append("client_secret", env.GOOGLE_CLIENT_SECRET.trim());
    }
    tokenBody.append("code_verifier", codeVerifier);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      console.error("Google token exchange error:", tokenRes.status, errData);
      const msg = errData.error_description || errData.error || "خطا در تبادل کد با سرور گوگل";
      const errorTarget = finishTarget({
        auth_error: msg,
      });
      return Response.redirect(errorTarget, 302);
    }

    const tokenData = await tokenRes.json();

    // Fetch user profile from userinfo endpoint
    let userInfo = null;
    if (tokenData.access_token) {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        userInfo = await userRes.json();
      }
    }

    // Fallback: parse id_token payload if userinfo fetch failed
    if (!userInfo && tokenData.id_token) {
      try {
        const parts = tokenData.id_token.split(".");
        if (parts.length === 3) {
          userInfo = JSON.parse(base64UrlDecode(parts[1]));
        }
      } catch {}
    }

    const email = (userInfo?.email || "").toLowerCase().trim();
    if (!email) {
      const errorTarget = finishTarget({
        auth_error: "ایمیل از حساب کاربری گوگل دریافت نشد.",
      });
      return Response.redirect(errorTarget, 302);
    }

    const existingUser = await dbGetUserAuthByEmail(env, email);
    if (existingUser?.isDemo || email === DEMO_EMAIL) {
      const errorTarget = finishTarget({
        auth_error: "ورود به حساب دمو از طریق گوگل امکان‌پذیر نیست.",
      });
      return Response.redirect(errorTarget, 302);
    }

    const isAdmin = isUserAdmin(email, env);
    const role = isAdmin ? "admin" : "user";
    const now = new Date().toISOString();
    const userId = userInfo.sub || `user_${Date.now()}`;
    const name = userInfo.name || userInfo.given_name || email.split("@")[0];
    const picture = userInfo.picture || "";

    const userData = { id: userId, email, name, picture, role, createdAt: now, lastLogin: now, loginCount: 1 };

    const maintenance = await getMaintenance(env);
    if (maintenance.enabled && !isAdmin) {
      return Response.redirect(finishTarget({ auth_error: maintenance.message }), 302);
    }

    // 1. Upsert user in the database
    await dbUpsertUser(env, userData);
    if (userData.disabled) {
      return Response.redirect(finishTarget({ auth_error: ACCOUNT_DISABLED_MESSAGE }), 302);
    }

    // The Android app gets a one-time code, redeemed with the secret only the app holds
    // (POST /api/auth/app/signin); the session itself is created there
    if (appChallenge) {
      const appCode = await dbCreateAuthToken(env, userData.id, appSignInPurpose(appChallenge), APP_SIGNIN_CODE_TTL);
      return Response.redirect(appAuthRedirect({ code: appCode }), 302);
    }

    // 2. Create 30-day session
    const sessionToken = crypto.randomUUID();
    const sessionData = {
      token: sessionToken,
      userId: userData.id,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      role: userData.role,
      createdAt: now,
    };
    await dbSaveSession(env, sessionData, SESSION_TTL_SECONDS);

    const sessionCookie = `realrate_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}`;
    const clearVerifierCookie = `rr_oauth_verifier=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

    // 3. Redirect user to frontend with auth_token in URL query param
    const successTarget = finishTarget({
      auth_token: sessionToken,
    });

    const headers = new Headers();
    headers.set("Location", successTarget);
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", clearVerifierCookie);

    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (e) {
    logger.error("Error in handleGoogleCallback:", { error: e.message, stack: e.stack });
    const errorTarget = finishTarget({
      auth_error: "خطای سرور در تکمیل فرآیند ورود.",
    });
    return Response.redirect(errorTarget, 302);
  }
}


/**
 * POST /api/auth/google
 * Verify Google ID token, upsert user in the database, create session
 */
export async function handleGoogleAuth(request, env) {
  try {
    const body = await request.json();
    const credential = body.credential;

    if (!credential) {
      return errorResponse("توکن احراز هویت گوگل ارسال نشده است.", 400, request);
    }

    // Verify token with Google's official tokeninfo API
    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    const googleRes = await fetch(verifyUrl);

    if (!googleRes.ok) {
      const errData = await googleRes.json().catch(() => ({}));
      return jsonResponse({
        success: false,
        message: "توکن گوگل نامعتبر یا منقضی شده است.",
        error: errData.error_description || errData.error || "Invalid token",
      }, 401, request);
    }

    const payload = await googleRes.json();

    // Validate audience if GOOGLE_CLIENT_ID is configured
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_ID.trim()) {
      if (payload.aud !== env.GOOGLE_CLIENT_ID.trim()) {
        return errorResponse("شناسه کلاینت با گوگل همخوانی ندارد (Audience mismatch).", 401, request);
      }
    }

    const email = (payload.email || "").toLowerCase().trim();
    if (!email) {
      return errorResponse("ایمیل از حساب گوگل دریافت نشد.", 400, request);
    }

    const existingUser = await dbGetUserAuthByEmail(env, email);
    if (existingUser?.isDemo || email === DEMO_EMAIL) {
      return errorResponse("ورود به حساب دمو از طریق گوگل امکان‌پذیر نیست.", 403, request);
    }

    const isAdmin = isUserAdmin(email, env);
    const role = isAdmin ? "admin" : "user";
    const now = new Date().toISOString();
    const userId = payload.sub || `user_${Date.now()}`;
    const name = payload.name || payload.given_name || email.split("@")[0];
    const picture = payload.picture || "";

    const userData = { id: userId, email, name, picture, role, createdAt: now, lastLogin: now, loginCount: 1 };

    const maintenance = await getMaintenance(env);
    if (maintenance.enabled && !isAdmin) return errorResponse(maintenance.message, 503, request);

    // 1. Upsert user in the database
    await dbUpsertUser(env, userData);
    if (userData.disabled) return errorResponse(ACCOUNT_DISABLED_MESSAGE, 403, request);

    // 2. Create 30-day session
    const sessionToken = crypto.randomUUID();
    const sessionData = {
      token: sessionToken,
      userId: userData.id,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      role: userData.role,
      createdAt: now,
    };
    await dbSaveSession(env, sessionData, SESSION_TTL_SECONDS);

    // SameSite=None; Secure needed for cross-origin (SPA on different domain)
    const cookieValue = `realrate_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_COOKIE_MAX_AGE}`;

    const corsHeaders = getCorsHeaders(request);

    return new Response(JSON.stringify({
      success: true,
      message: isAdmin ? "خوش آمدید، مدیر سیستم!" : "ورود موفقیت‌آمیز به حساب کاربری",
      token: sessionToken,   // ← frontend stores this in localStorage
      user: { id: userData.id, email: userData.email, name: userData.name, customName: userData.customName || '', picture: userData.picture, role: userData.role, createdAt: userData.createdAt },
    }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": cookieValue,
        ...corsHeaders,
      },
    });
  } catch (e) {
    logger.error("Error in handleGoogleAuth:", { error: e.message, stack: e.stack });
    return errorResponse("خطای سرور در احراز هویت با گوگل.", 500, request);
  }
}

/**
 * GET /api/auth/me
 * Return the currently authenticated user from session
 */
export async function handleGetMe(request, env, ctx) {
  // Everyone learns about maintenance mode here, so the browser can show its page
  const [user, maintenance] = await Promise.all([getAuthenticatedUser(request, env), getMaintenance(env)]);
  if (!user) {
    return jsonResponse({ authenticated: false, user: null, maintenance }, 200, request);
  }

  const userId = user.userId || user.id;
  let customName = user.customName || "";
  let hasPassword = false;
  let emailVerified = true;
  // One round of reads, side by side: the account, the user's features and their requests
  const [account, features, requestedGroups] = await Promise.all([
    dbGetUserAuthById(env, userId).catch(() => null),
    userFeatures(env, user),
    dbGetUserRequestedGroupKeys(env, userId).catch(() => []),
  ]);
  try {
    if (account?.disabled) {
      return jsonResponse({ authenticated: false, user: null, maintenance }, 200, request);
    }
    if (account) {
      customName = customName || account.customName;
      hasPassword = Boolean(account.passwordHash);
      emailVerified = account.emailVerified;
    } else if (!customName) {
      const userData = await dbGetUserById(env, userId);
      if (userData?.customName) customName = userData.customName;
    }
  } catch (e) {}
  // Activity and the client (the site, the Android app and its version) are recorded after the
  // answer: the user does not wait for the admin panel's stats
  const record = async () => {
    if (user.kind !== "demo_view") await dbRecordUserActivity(env, userId);
    // Not for the shared demo user
    if (!user.kind?.startsWith("demo")) {
      await dbRecordUserClient(env, userId, parseClientHeader(request.headers.get(CLIENT_HEADER)));
    }
  };
  if (ctx?.waitUntil) safeWaitUntil(ctx, record());
  else await record();

  const isDemo = user.kind === "demo_view" || user.kind === "demo_edit";
  const demoPayload = isDemo
    ? {
        demo: { mode: user.kind === "demo_edit" ? "edit" : "view" },
        demoVaultPassphrase: getDemoVaultPassphrase(env),
      }
    : {};

  return jsonResponse({
    authenticated: true,
    maintenance,
    user: {
      id: userId,
      email: user.email,
      name: user.name,
      customName: customName || "",
      picture: user.picture,
      role: user.role,
      isAdmin: user.role === "admin",
      hasPassword,
      emailVerified,
      features,
      // The groups the user is in, and those they asked to join (for the feature pages' offers)
      groups: user.groups || [],
      requestedGroups,
    },
    ...demoPayload,
  }, 200, request);
}

/**
 * POST /api/auth/logout
 * Delete session from the database and clear session cookie
 */
export async function handleLogout(request, env) {
  let token = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.slice(7).trim();

  if (!token) {
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/realrate_session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1].trim());
    }
  }

  if (token) await dbDeleteSession(env, token);

  const corsHeaders = getCorsHeaders(request);

  return new Response(JSON.stringify({ success: true, message: "با موفقیت خارج شدید." }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "realrate_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0",
      ...corsHeaders,
    },
  });
}
