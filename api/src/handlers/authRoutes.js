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
import { dbUpsertUser, dbSaveSession, dbDeleteSession, dbGetUserById } from "../lib/db.js";
import { jsonResponse, errorResponse, getCorsHeaders } from "../lib/helpers.js";

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

function buildFrontendRedirect(frontendOrigin, returnTo, params = {}) {
  let baseOrigin = "https://realrate.geekio.org";
  if (frontendOrigin) {
    try {
      const u = new URL(frontendOrigin);
      if (u.hostname === "localhost" || u.hostname.endsWith("geekio.org") || u.hostname.endsWith("pages.dev")) {
        baseOrigin = u.origin;
      }
    } catch {}
  }

  let finalUrl;
  try {
    if (returnTo && (returnTo.startsWith("http://") || returnTo.startsWith("https://"))) {
      const u = new URL(returnTo);
      if (u.hostname === "localhost" || u.hostname.endsWith("geekio.org") || u.hostname.endsWith("pages.dev")) {
        finalUrl = u;
      } else {
        finalUrl = new URL("/", baseOrigin);
      }
    } else {
      const path = (returnTo && returnTo.startsWith("/")) ? returnTo : `/${returnTo || ""}`;
      finalUrl = new URL(path, baseOrigin);
    }
  } catch {
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
  let frontendOrigin = "https://realrate.geekio.org";
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.hostname === "localhost" || refUrl.hostname.endsWith("geekio.org") || refUrl.hostname.endsWith("pages.dev")) {
        frontendOrigin = refUrl.origin;
      }
    } catch {}
  }

  try {
    const parsed = new URL(returnTo);
    if (parsed.hostname === "localhost" || parsed.hostname.endsWith("geekio.org") || parsed.hostname.endsWith("pages.dev")) {
      frontendOrigin = parsed.origin;
    }
  } catch {}

  const redirectUri = resolveRedirectUri(request, env);
  const { codeVerifier, codeChallenge } = await generatePkce();
  const nonce = crypto.randomUUID();

  const statePayload = {
    returnTo,
    frontendOrigin,
    redirectUri,
    nonce,
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
  const verifierCookie = `rr_oauth_verifier=${encodeURIComponent(`${codeVerifier}:${nonce}`)}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;

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
      console.warn("Could not decode state in callback:", e);
    }
  }

  const frontendOrigin = stateData.frontendOrigin || "https://realrate.geekio.org";
  const returnTo = stateData.returnTo || "/";
  const redirectUri = stateData.redirectUri || resolveRedirectUri(request, env);

  // If user cancelled or Google returned an error
  if (errorParam) {
    const errorTarget = buildFrontendRedirect(frontendOrigin, returnTo, {
      auth_error: errorParam === "access_denied" ? "ورود با گوگل لغو شد." : errorParam,
    });
    return Response.redirect(errorTarget, 302);
  }

  if (!code) {
    const errorTarget = buildFrontendRedirect(frontendOrigin, returnTo, {
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
      if (!stateData.nonce || nonce === stateData.nonce) {
        codeVerifier = v;
      }
    } catch {}
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
    if (codeVerifier) {
      tokenBody.append("code_verifier", codeVerifier);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      console.error("Google token exchange error:", tokenRes.status, errData);
      const msg = errData.error_description || errData.error || "خطا در تبادل کد با سرور گوگل";
      const errorTarget = buildFrontendRedirect(frontendOrigin, returnTo, {
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
      const errorTarget = buildFrontendRedirect(frontendOrigin, returnTo, {
        auth_error: "ایمیل از حساب کاربری گوگل دریافت نشد.",
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

    // 1. Upsert user in D1 (+ KV sync)
    await dbUpsertUser(env, userData);

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
    await dbSaveSession(env, sessionData, 30 * 24 * 3600);

    const sessionCookie = `realrate_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
    const clearVerifierCookie = `rr_oauth_verifier=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

    // 3. Redirect user to frontend with auth_token in URL query param
    const successTarget = buildFrontendRedirect(frontendOrigin, returnTo, {
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
    console.error("Error in handleGoogleCallback:", e);
    const errorTarget = buildFrontendRedirect(frontendOrigin, returnTo, {
      auth_error: "خطای سرور در تکمیل فرآیند ورود: " + e.message,
    });
    return Response.redirect(errorTarget, 302);
  }
}


/**
 * POST /api/auth/google
 * Verify Google ID token, upsert user in D1, create session
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

    const isAdmin = isUserAdmin(email, env);
    const role = isAdmin ? "admin" : "user";
    const now = new Date().toISOString();
    const userId = payload.sub || `user_${Date.now()}`;
    const name = payload.name || payload.given_name || email.split("@")[0];
    const picture = payload.picture || "";

    const userData = { id: userId, email, name, picture, role, createdAt: now, lastLogin: now, loginCount: 1 };

    // 1. Upsert user in D1 (+ KV sync)
    await dbUpsertUser(env, userData);

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
    await dbSaveSession(env, sessionData, 30 * 24 * 3600);

    // SameSite=None; Secure needed for cross-origin (SPA on different domain)
    const cookieValue = `realrate_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=2592000`;

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
    console.error("Error in handleGoogleAuth:", e);
    return errorResponse("خطای سرور در احراز هویت با گوگل: " + e.message, 500, request);
  }
}

/**
 * GET /api/auth/me
 * Return the currently authenticated user from session
 */
export async function handleGetMe(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ authenticated: false, user: null }, 200, request);
  }

  const userId = user.userId || user.id;
  let customName = user.customName || "";
  if (!customName) {
    try {
      const userData = await dbGetUserById(env, userId);
      if (userData?.customName) customName = userData.customName;
    } catch (e) {}
  }

  return jsonResponse({
    authenticated: true,
    user: {
      id: userId,
      email: user.email,
      name: user.name,
      customName: customName || "",
      picture: user.picture,
      role: user.role,
      isAdmin: user.role === "admin",
    },
  }, 200, request);
}

/**
 * POST /api/auth/logout
 * Delete session from D1/KV and clear session cookie
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
