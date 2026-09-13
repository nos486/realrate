import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, googleLogin, logout as apiLogout, getGoogleLoginUrl } from '../api/authApi.js';
import { setToken } from '../../../shared/api/httpClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
          alert(`خطا در ورود با گوگل: ${decodeURIComponent(authError)}`);
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
        if (data && data.authenticated && data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Backward-compatibility: if Google One-Tap credential callback is triggered
  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) return;
    try {
      const data = await googleLogin(response.credential);
      if (data && data.success && data.user) {
        if (data.token) setToken(data.token);
        setUser(data.user);
      } else {
        alert(data?.message || 'خطا در ورود با گوگل');
      }
    } catch (e) {
      console.error('Auth error:', e);
      alert('خطا در ارتباط با سرور');
    }
  }, []);

  // Primary Login Flow: Redirect to server-side Google OAuth 2.0 endpoint
  const triggerLogin = useCallback(() => {
    const loginUrl = getGoogleLoginUrl(window.location.href);
    window.location.href = loginUrl;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setUser(null);
  }, []);

  const updateUser = useCallback((fields) => {
    setUser((prev) => (prev ? { ...prev, ...fields } : null));
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
