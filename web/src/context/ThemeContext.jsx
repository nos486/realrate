import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const COLOR_PRESETS = [
  { id: 'ocean', name: 'آبی اقیانوسی', primary: '#0284c7', accent: '#38bdf8', border: '#1e293b', cardBg: '#0d131f' },
  { id: 'royal', name: 'آبی کاربنی', primary: '#2563eb', accent: '#60a5fa', border: '#1e2640', cardBg: '#0e1222' },
  { id: 'gold', name: 'طلایی فاخر', primary: '#f59e0b', accent: '#fbbf24', border: '#382a17', cardBg: '#14110b' },
  { id: 'emerald', name: 'زمردی', primary: '#059669', accent: '#34d399', border: '#132e27', cardBg: '#0b1613' },
  { id: 'violet', name: 'بنفش کریپتو', primary: '#7c3aed', accent: '#a78bfa', border: '#2c1e4a', cardBg: '#130e20' },
  { id: 'ruby', name: 'یاقوتی', primary: '#e11d48', accent: '#fb7185', border: '#3b1622', cardBg: '#170b10' },
];

export function hexToRgb(hex) {
  let c = (hex || '#0284c7').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return [2, 132, 199];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function shadeColor(color, percent) {
  const [r, g, b] = hexToRgb(color);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = Math.min(255, Math.max(0, Math.round((t - r) * p) + r));
  const G = Math.min(255, Math.max(0, Math.round((t - g) * p) + g));
  const B = Math.min(255, Math.max(0, Math.round((t - b) * p) + b));
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

/**
 * Calculates accessible foreground text color (W3C standard luminance)
 * Returns dark ink '#090d16' for light colors (e.g. white, yellow) and '#ffffff' for dark colors
 */
export function getContrastColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#090d16' : '#ffffff';
}

export function applyRootThemeVariables(primaryHex, accentHex, borderVal, cardBgVal) {
  if (!primaryHex) return;
  const root = document.documentElement;
  const [r, g, b] = hexToRgb(primaryHex);
  const darker = shadeColor(primaryHex, -18);
  const textColor = getContrastColor(primaryHex);

  root.style.setProperty('--primary-color', primaryHex);
  root.style.setProperty('--primary-color-hover', darker);
  root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${primaryHex} 0%, ${darker} 100%)`);
  root.style.setProperty('--primary-glow', `0 4px 16px rgba(${r}, ${g}, ${b}, 0.38)`);
  root.style.setProperty('--primary-glow-lg', `0 6px 24px rgba(${r}, ${g}, ${b}, 0.48)`);
  root.style.setProperty('--primary-soft-bg', `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.style.setProperty('--primary-border', `rgba(${r}, ${g}, ${b}, 0.4)`);
  root.style.setProperty('--primary-text', textColor);
  root.style.setProperty('--border-input-focus', primaryHex);
  root.style.setProperty('--shadow-input-focus', `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.22)`);
  root.style.setProperty('--accent-blue', primaryHex);

  if (accentHex) {
    const [ar, ag, ab] = hexToRgb(accentHex);
    root.style.setProperty('--accent-color', accentHex);
    root.style.setProperty('--gold-primary', accentHex);
    root.style.setProperty('--gold-light', accentHex);
    root.style.setProperty('--gold-gradient', `linear-gradient(135deg, ${accentHex} 0%, ${primaryHex} 100%)`);
    root.style.setProperty('--gold-soft-bg', `rgba(${ar}, ${ag}, ${ab}, 0.12)`);
  }

  if (borderVal) {
    root.style.setProperty('--card-border', borderVal);
    root.style.setProperty('--border-color', borderVal);
  }

  if (cardBgVal) {
    root.style.setProperty('--card-bg', cardBgVal);
    root.style.setProperty('--bg-card', cardBgVal);
  }
}

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  primaryColor: '#0284c7',
  accentColor: '#38bdf8',
  borderColor: '#1e293b',
  cardBgColor: '#0d131f',
  colorPreset: 'ocean',
  applyThemeColor: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('realrate_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [primaryColor, setPrimaryColor] = useState(() => {
    try {
      return localStorage.getItem('realrate_primary_color') || '#0284c7';
    } catch {
      return '#0284c7';
    }
  });

  const [accentColor, setAccentColor] = useState(() => {
    try {
      return localStorage.getItem('realrate_accent_color') || '#38bdf8';
    } catch {
      return '#38bdf8';
    }
  });

  const [borderColor, setBorderColor] = useState(() => {
    try {
      return localStorage.getItem('realrate_border_color') || '#1e293b';
    } catch {
      return '#1e293b';
    }
  });

  const [cardBgColor, setCardBgColor] = useState(() => {
    try {
      return localStorage.getItem('realrate_card_bg_color') || '#0d131f';
    } catch {
      return '#0d131f';
    }
  });

  const [colorPreset, setColorPreset] = useState(() => {
    try {
      return localStorage.getItem('realrate_color_preset') || 'ocean';
    } catch {
      return 'ocean';
    }
  });

  const applyThemeColor = useCallback((primary, accent, preset, border, cardBg) => {
    const p = primary || '#0284c7';
    const a = accent || '#38bdf8';
    const b = border || '#1e293b';
    const c = cardBg || '#0d131f';

    setPrimaryColor(p);
    setAccentColor(a);
    setBorderColor(b);
    setCardBgColor(c);
    if (preset) setColorPreset(preset);

    applyRootThemeVariables(p, a, b, c);

    try {
      localStorage.setItem('realrate_primary_color', p);
      localStorage.setItem('realrate_accent_color', a);
      localStorage.setItem('realrate_border_color', b);
      localStorage.setItem('realrate_card_bg_color', c);
      if (preset) localStorage.setItem('realrate_color_preset', preset);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('realrate_theme', theme);
    } catch {}

    document.documentElement.setAttribute('data-theme', theme);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#f4f6f9' : '#06080d');
    }
  }, [theme]);

  // Initial application of root theme colors
  useEffect(() => {
    applyRootThemeVariables(primaryColor, accentColor, borderColor, cardBgColor);
  }, [primaryColor, accentColor, borderColor, cardBgColor]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (nextTheme) => {
    if (nextTheme === 'dark' || nextTheme === 'light') {
      setThemeState(nextTheme);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        themes: ['dark', 'light'],
        primaryColor,
        accentColor,
        borderColor,
        cardBgColor,
        colorPreset,
        applyThemeColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
