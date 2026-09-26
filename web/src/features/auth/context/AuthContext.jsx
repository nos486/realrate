import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, googleLogin, logout as apiLogout, getGoogleLoginUrl } from '../api/authApi.js';
import { setToken, getToken, HttpError, MAINTENANCE_EVENT } from '../../../shared/api/httpClient.js';
import { APP_BASE, LANDING_PATH, AUTH_PATHS, isAppPath, rememberPostLoginPath, takePostLoginPath } from '../../../shared/routes.js';
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
  // Maintenance ("under development") mode: only admins may use the app while it is on
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
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
        if (data?.maintenance) setMaintenance({ enabled: Boolean(data.maintenance.enabled), message: data.maintenance.message || '' });
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

  // An API call answered "maintenance mode" (switched on while the app is open)
  useEffect(() => {
    const onMaintenance = (e) => setMaintenance({ enabled: true, message: e.detail?.message || '' });
    window.addEventListener(MAINTENANCE_EVENT, onMaintenance);
    return () => window.removeEventListener(MAINTENANCE_EVENT, onMaintenance);
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

  // Every "sign in" button opens the sign-in page (Google or email/password). From inside the app
  // the current page is remembered, so signing in returns there.
  const triggerLogin = useCallback(() => {
    const { pathname, search } = window.location;
    if (isAppPath(pathname)) rememberPostLoginPath(`${pathname}${search}`);
    navigate(AUTH_PATHS.login);
  }, [navigate]);

  // Google: redirect to the server-side OAuth 2.0 flow, landing on the remembered page (or the app)
  const loginWithGoogle = useCallback(() => {
    const { origin } = window.location;
    window.location.href = getGoogleLoginUrl(`${origin}${takePostLoginPath() || APP_BASE}`);
  }, []);

  /** Finish an email/password sign-in (login, verified email, reset password): `{ token, user }` */
  const completeLogin = useCallback((data) => {
    if (!data?.token || !data?.user) return;
    setToken(data.token);
    signInUser(setUser, data.user);
    writeCachedUser(data.user);
    navigate(takePostLoginPath() || APP_BASE, { replace: true });
  }, [navigate]);

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
    <AuthContext.Provider value={{ user, loading, maintenance, setMaintenance, triggerLogin, loginWithGoogle, completeLogin, logout, updateUser, handleGoogleCredential }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
