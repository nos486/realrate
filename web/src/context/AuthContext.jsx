/**
 * AuthContext.jsx — Global auth state + Google Sign-In integration
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiGetMe, apiGoogleLogin, apiLogout, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: check existing session
  useEffect(() => {
    apiGetMe()
      .then(data => {
        if (data.authenticated && data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initialize Google Sign-In after GIS script loads
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const tryInit = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
      } else {
        setTimeout(tryInit, 400);
      }
    };
    tryInit();
  }, []);

  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) return;
    try {
      const data = await apiGoogleLogin(response.credential);
      if (data.success && data.user) {
        if (data.token) setToken(data.token);
        setUser(data.user);
      } else {
        alert(data.message || 'خطا در ورود با گوگل');
      }
    } catch (e) {
      console.error('Auth error:', e);
      alert('خطا در ارتباط با سرور');
    }
  }, []);

  const triggerLogin = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      alert('VITE_GOOGLE_CLIENT_ID در فایل .env.local تنظیم نشده است.');
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          const btn = document.querySelector('#_hidden_gsi_btn div[role="button"]');
          if (btn) btn.click();
        }
      });
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setUser(null);
  }, []);

  const updateUser = useCallback((fields) => {
    setUser((prev) => (prev ? { ...prev, ...fields } : null));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, triggerLogin, logout, updateUser }}>
      {children}
      {/* Hidden GSI button for fallback trigger */}
      <div id="_hidden_gsi_btn" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, overflow: 'hidden' }} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
