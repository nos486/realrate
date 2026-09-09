import React, { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
});

export function ThemeProvider({ children }) {
  useEffect(() => {
    // Permanently enforce Dark Mode
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      localStorage.setItem('realrate_theme', 'dark');
      // Clean up legacy custom color keys
      localStorage.removeItem('realrate_primary_color');
      localStorage.removeItem('realrate_accent_color');
      localStorage.removeItem('realrate_border_color');
      localStorage.removeItem('realrate_card_bg_color');
      localStorage.removeItem('realrate_color_preset');
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

export function useTheme() {
  return useContext(ThemeContext);
}
