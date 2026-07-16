import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredAuthUser, getStoredAuthUser, loginWithEmail, logoutFromServer, storeAuthUser } from '@/api/authClient';
import { getPortalSettings, logoutPresence, normalizeUser, pingPresence } from '@/api/portalClient';
import { firstAllowedPath, hasPermission, normalizeRole } from '@/lib/permissions';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [portalSettings, setPortalSettings] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const stored = normalizeUser(getStoredAuthUser());
    if (stored) stored.role = normalizeRole(stored.role, stored.department);
    setUser(stored);
    setIsLoadingAuth(false);
  }, []);

  const refreshPortalSettings = useCallback(async () => {
    const settings = await getPortalSettings();
    setPortalSettings(settings);
    return settings;
  }, []);

  useEffect(() => {
    refreshPortalSettings().catch(() => {}).finally(() => setIsLoadingPublicSettings(false));
  }, [refreshPortalSettings]);

  const login = useCallback(async (email, password, mfaCode = '') => {
    const authUser = normalizeUser(await loginWithEmail(email, password, mfaCode));
    authUser.role = normalizeRole(authUser.role, authUser.department);
    setUser(authUser);
    lastActivityRef.current = Date.now();
    pingPresence(authUser.id).catch(() => {});
    return authUser;
  }, []);

  const logout = useCallback(async (reason = 'manual') => {
    const current = normalizeUser(getStoredAuthUser());
    await logoutPresence(current?.id).catch(() => {});
    await logoutFromServer().catch(() => clearStoredAuthUser());
    clearStoredAuthUser();
    setUser(null);
    if (reason === 'timeout') window.sessionStorage.setItem('bcb_session_message', 'Your session ended after a period of inactivity. Please sign in again.');
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    const timeoutMinutes = Number(portalSettings?.sessionTimeoutMinutes || 30);
    const timeoutMs = Math.max(5, timeoutMinutes) * 60 * 1000;
    const recordActivity = () => { lastActivityRef.current = Date.now(); };
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    const intervalId = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= timeoutMs) {
        logout('timeout').finally(() => { window.location.href = '/login'; });
      } else if (document.visibilityState === 'visible') {
        pingPresence(user.id).catch(() => {});
      }
    }, 60000);
    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((event) => window.removeEventListener(event, recordActivity));
    };
  }, [user?.id, portalSettings?.sessionTimeoutMinutes, logout]);

  const updateUser = useCallback((nextUser) => {
    const normalized = normalizeUser(nextUser);
    normalized.role = normalizeRole(normalized.role, normalized.department);
    setUser((current) => {
      const csrfToken = current?.csrfToken || normalized?.csrfToken;
      return csrfToken ? storeAuthUser(normalized, csrfToken) : normalized;
    });
  }, []);

  const can = useCallback((permission) => hasPermission(user, permission), [user]);

  const value = useMemo(() => ({
    user, portalSettings, isAuthenticated: Boolean(user), isLoadingAuth, isLoadingPublicSettings,
    authError: null, appPublicSettings: portalSettings, authChecked: !isLoadingAuth,
    refreshPortalSettings, login, logout, setUser, updateUser, can,
    firstAllowedPath: () => firstAllowedPath(user, portalSettings),
    checkUserAuth: async () => {}, checkAppState: async () => {},
    navigateToLogin: () => { window.location.href = '/login'; },
  }), [user, portalSettings, isLoadingAuth, isLoadingPublicSettings, refreshPortalSettings, login, logout, updateUser, can]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
