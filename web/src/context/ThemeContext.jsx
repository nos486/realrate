import React, { createContext, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
});

export function ThemeProvider({ children }) {
  useEffect(() => {
    // Permanently enforce Dark Mode
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      localStorage.setItem('realrate_theme', 'dark');
    } catch {}

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', '#06080d');
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

