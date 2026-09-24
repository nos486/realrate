import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, googleLogin, logout as apiLogout, getGoogleLoginUrl } from '../api/authApi.js';
import { setToken, getToken, HttpError } from '../../../shared/api/httpClient.js';
import { APP_BASE, LANDING_PATH, isAppPath, takePostLoginPath } from '../../../shared/routes.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { resetCustomBanks } from '../../../shared/banks/useCustomBanks.js';
import { loadVault, resetVault } from '../../../shared/vault/vaultStore.js';

// Start loading the account's encryption state together with the user, before any screen that
// reads data renders — so nothing is ever fetched or saved through the wrong (plaintext) path.
function signInUser(setUser, nextUser) {
  if (nextUser?.id) loadVault(nextUser.id);
  setUser(nextUser);
}

const AuthContext = createContext(null);

// Last signed-in profile, so the installed app still opens (market data, calculator) when the
// device is offline instead of bouncing to the landing page. Only used on network failures.
const USER_CACHE_KEY = 'realrate_user_cache';

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useFeedback();

  // On mount: check auth_token / auth_error from Google OAuth redirect, then check session
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.location.search) {
        const url = new URL(window.location.href);
        const authToken = url.searchParams.get('auth_token');
        const authError = url.searchParams.get('auth_error');

        if (authToken) {
          setToken(authToken);
          url.searchParams.delete('auth_token');
          const cleanSearch = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
          window.history.replaceState({}, document.title, url.pathname + cleanSearch + url.hash);
        } else if (authError) {
          toast.error(`خطا در ورود با گوگل: ${authError}`, { duration: 8000 });
          url.searchParams.delete('auth_error');
          const cleanSearch = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
          window.history.replaceState({}, document.title, url.pathname + cleanSearch + url.hash);
        }
      }
    } catch (e) {
      console.error('Error handling auth URL parameters:', e);
    }

    getMe()
      .then((data) => {
        if (data && data.authenticated && data.user) {
          signInUser(setUser, data.user);
          writeCachedUser(data.user);
        } else {
          writeCachedUser(null);
        }
      })
      .catch((err) => {
        // A server answer (401, 5xx...) is authoritative; only a network failure falls back
        const isNetworkError = !(err instanceof HttpError) || !err.status;
        const cached = isNetworkError && getToken() ? readCachedUser() : null;
        if (cached) signInUser(setUser, cached);
      })
      .finally(() => setLoading(false));
    // Runs once on mount; `toast` is stable for the provider's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backward-compatibility: if Google One-Tap credential callback is triggered
  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) return;
    try {
      const data = await googleLogin(response.credential);
      if (data && data.success && data.user) {
        if (data.token) setToken(data.token);
        signInUser(setUser, data.user);
        writeCachedUser(data.user);
      } else {
        toast.error(data?.message || 'خطا در ورود با گوگل');
      }
    } catch (e) {
      console.error('Auth error:', e);
      toast.error('خطا در ارتباط با سرور');
    }
  }, [toast]);

  // Primary Login Flow: Redirect to server-side Google OAuth 2.0 endpoint.
  // Signing in from anywhere outside the app (landing, shared portfolio) lands in the app —
  // on the page a guest was bounced from, if any; from inside the app it returns to the exact
  // page the user was on.
  const triggerLogin = useCallback(() => {
    const { origin, pathname, href } = window.location;
    const target = isAppPath(pathname) ? href : `${origin}${takePostLoginPath() || APP_BASE}`;
    window.location.href = getGoogleLoginUrl(target);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    writeCachedUser(null);
    resetCustomBanks();
    resetVault();
    setUser(null);
    navigate(LANDING_PATH, { replace: true });
  }, [navigate]);

  const updateUser = useCallback((fields) => {
    setUser((prev) => {
      const next = prev ? { ...prev, ...fields } : null;
      writeCachedUser(next);
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, triggerLogin, logout, updateUser, handleGoogleCredential }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
