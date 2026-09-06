/**
 * authRoutes.js — Auth route handlers: Google Sign-In, session check, logout
 */

import { isUserAdmin, getAuthenticatedUser } from "../lib/auth.js";
import { dbUpsertUser, dbSaveSession, dbDeleteSession } from "../lib/db.js";
import { jsonResponse, errorResponse } from "../lib/helpers.js";

/**
 * POST /api/auth/google
 * Verify Google ID token, upsert user in D1, create session
 */
export async function handleGoogleAuth(request, env) {
  try {
    const body = await request.json();
    const credential = body.credential;

    if (!credential) {
      return errorResponse("توکن احراز هویت گوگل ارسال نشده است.", 400);
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
      }, 401);
    }

    const payload = await googleRes.json();

    // Validate audience if GOOGLE_CLIENT_ID is configured
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_ID.trim()) {
      if (payload.aud !== env.GOOGLE_CLIENT_ID.trim()) {
        return errorResponse("شناسه کلاینت با گوگل همخوانی ندارد (Audience mismatch).", 401);
      }
    }

    const email = (payload.email || "").toLowerCase().trim();
    if (!email) {
      return errorResponse("ایمیل از حساب گوگل دریافت نشد.", 400);
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

    const cookieValue = `realrate_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;

    return new Response(JSON.stringify({
      success: true,
      message: isAdmin ? "خوش آمدید، مدیر سیستم!" : "ورود موفقیت‌آمیز به حساب کاربری",
      token: sessionToken,
      user: { id: userData.id, email: userData.email, name: userData.name, picture: userData.picture, role: userData.role, createdAt: userData.createdAt },
    }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": cookieValue,
      },
    });
  } catch (e) {
    console.error("Error in handleGoogleAuth:", e);
    return errorResponse("خطای سرور در احراز هویت با گوگل: " + e.message, 500);
  }
}

/**
 * GET /api/auth/me
 * Return the currently authenticated user from session
 */
export async function handleGetMe(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ authenticated: false, user: null });
  }

  return jsonResponse({
    authenticated: true,
    user: {
      id: user.userId || user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      isAdmin: user.role === "admin",
    },
  });
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

  return new Response(JSON.stringify({ success: true, message: "با موفقیت خارج شدید." }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "realrate_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
