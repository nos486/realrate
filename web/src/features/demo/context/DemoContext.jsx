/**
 * DemoContext.jsx — Unified Demo Account State, Auto-Vault-Unlock, and Mode Guards
 *
 * Provides:
 * - isDemo: boolean
 * - isDemoView: boolean
 * - isDemoEdit: boolean
 * - readOnly: boolean (true in demo_view mode)
 * - demoVaultPassphrase: string | null
 * - demoNotReady: boolean (true if view mode and vault is uninitialized)
 * - enterDemo(): logs into demo account and navigates to app
 * - exitDemoToRegister(): logs out of demo and navigates to register
 * - exitDemoToAdmin(): restores admin session, resets vault, navigates to admin
 * - isDemoReadOnly(): synchronous helper for non-React code (e.g. background syncs)
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/index.js';
import { authDemo } from '../api/demoApi.js';
import { logout as apiLogout } from '../../auth/api/authApi.js';
import { setToken, DEMO_READ_ONLY_EVENT } from '../../../shared/api/httpClient.js';
import { AUTH_PATHS, appPath } from '../../../shared/routes.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import {
  getVaultState,
  subscribeVault,
  unlockVault,
  createVault,
  resetVault,
} from '../../../shared/vault/vaultStore.js';

const ADMIN_RETURN_TOKEN_KEY = 'rr_admin_return_token';

// Synchronous global flag so background modules (like vault migrations) can check without React hooks
let _isDemoReadOnly = false;

export function isDemoReadOnly() {
  return _isDemoReadOnly;
}

const DemoContext = createContext({
  isDemo: false,
  isDemoView: false,
  isDemoEdit: false,
  readOnly: false,
  demoVaultPassphrase: null,
  demoNotReady: false,
  enterDemo: async () => {},
  exitDemoToRegister: async () => {},
  exitDemoToAdmin: async () => {},
});

export function DemoProvider({ children }) {
  const { user, completeLogin, logout } = useAuth();
  const { toast } = useFeedback();
  const navigate = useNavigate();

  const isDemo = Boolean(user?.demo);
  const mode = user?.demo?.mode || null;
  const isDemoView = mode === 'view';
  const isDemoEdit = mode === 'edit';
  const readOnly = isDemoView;
  const demoVaultPassphrase = user?.demoVaultPassphrase || null;

  const [demoNotReady, setDemoNotReady] = useState(false);
  const unlockingRef = useRef(false);

  // Keep synchronous flag updated
  useEffect(() => {
    _isDemoReadOnly = isDemoView;
  }, [isDemoView]);

  // Central listener for 403 DEMO_READ_ONLY events from httpClient
  useEffect(() => {
    const onDemoReadOnly = (e) => {
      toast.info(e.detail?.message || 'این نسخه دمو است و تغییرات ذخیره نمی‌شود.');
    };
    window.addEventListener(DEMO_READ_ONLY_EVENT, onDemoReadOnly);
    return () => window.removeEventListener(DEMO_READ_ONLY_EVENT, onDemoReadOnly);
  }, [toast]);

  // Auto-unlock vault for demo sessions
  useEffect(() => {
    if (!isDemo || !demoVaultPassphrase) {
      setDemoNotReady(false);
      return;
    }

    const checkAndUnlock = async () => {
      if (unlockingRef.current) return;
      const vaultState = getVaultState();

      if (vaultState.status === 'locked') {
        unlockingRef.current = true;
        try {
          await unlockVault(demoVaultPassphrase);
          setDemoNotReady(false);
        } catch (err) {
          console.error('Failed to auto-unlock demo vault:', err);
        } finally {
          unlockingRef.current = false;
        }
      } else if (vaultState.status === 'off') {
        if (isDemoEdit) {
          unlockingRef.current = true;
          try {
            await createVault(demoVaultPassphrase);
            setDemoNotReady(false);
          } catch (err) {
            console.error('Failed to auto-create demo vault:', err);
          } finally {
            unlockingRef.current = false;
          }
        } else {
          setDemoNotReady(true);
        }
      } else if (vaultState.status === 'unlocked') {
        setDemoNotReady(false);
      }
    };

    checkAndUnlock();
    const unsubscribe = subscribeVault(checkAndUnlock);
    return () => unsubscribe();
  }, [isDemo, demoVaultPassphrase, isDemoEdit]);

  const enterDemo = useCallback(async () => {
    try {
      const data = await authDemo();
      if (data?.token && data?.user) {
        completeLogin(data);
        return true;
      } else {
        toast.error(data?.message || 'ورود به نسخه دمو امکان‌پذیر نیست.');
        return false;
      }
    } catch (err) {
      toast.error(err.message || 'حساب کاربری دمو هنوز ایجاد نشده است.');
      return false;
    }
  }, [completeLogin, toast]);

  const exitDemoToRegister = useCallback(async () => {
    await logout();
    navigate(AUTH_PATHS.register, { replace: true });
  }, [logout, navigate]);

  const exitDemoToAdmin = useCallback(async () => {
    const adminToken = sessionStorage.getItem(ADMIN_RETURN_TOKEN_KEY);
    resetVault();
    await apiLogout().catch(() => {});

    if (adminToken) {
      setToken(adminToken);
      sessionStorage.removeItem(ADMIN_RETURN_TOKEN_KEY);
      // Hard navigation / reload to ensure clean in-memory state and fresh session for admin
      window.location.href = appPath('/admin');
    } else {
      await logout();
    }
  }, [logout]);

  const value = {
    isDemo,
    isDemoView,
    isDemoEdit,
    readOnly,
    demoVaultPassphrase,
    demoNotReady,
    enterDemo,
    exitDemoToRegister,
    exitDemoToAdmin,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  return useContext(DemoContext);
}
