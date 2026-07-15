import React, { createContext, useContext, useState, useEffect } from 'react';
import { getPortalSettings } from '@/api/portalClient';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('bcb-payslip-theme') || 'light';
  });
  const [policy, setPolicy] = useState({ allowLightMode: true, allowDarkMode: true, defaultTheme: 'light' });

  useEffect(() => {
    getPortalSettings().then((settings) => {
      const nextPolicy = { allowLightMode: settings.allowLightMode !== false, allowDarkMode: settings.allowDarkMode !== false, defaultTheme: settings.defaultTheme || 'light' };
      setPolicy(nextPolicy);
      setTheme((current) => current === 'dark' && !nextPolicy.allowDarkMode ? 'light' : current === 'light' && !nextPolicy.allowLightMode ? 'dark' : current || nextPolicy.defaultTheme);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('bcb-payslip-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => {
    const next = prev === 'dark' ? 'light' : 'dark';
    return (next === 'dark' && !policy.allowDarkMode) || (next === 'light' && !policy.allowLightMode) ? prev : next;
  });

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, policy }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
