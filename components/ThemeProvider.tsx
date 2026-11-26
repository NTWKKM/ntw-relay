'use client';

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import {
  getNextTheme,
  resolveStoredTheme,
  THEME_STORAGE_KEY,
  type MaterialTheme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: MaterialTheme;
  toggleTheme: () => void;
  setTheme: (next: MaterialTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function useMaterialTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const themeListeners = new Set<() => void>();
let memoryTheme: MaterialTheme | null = null;

function notifyThemeListeners() {
  themeListeners.forEach((listener) => listener());
}

function subscribeTheme(onStoreChange: () => void) {
  themeListeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) {
      try {
        memoryTheme = resolveStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
      } catch {
        // Preserve memoryTheme fallback when storage access fails
      }
      onStoreChange();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    themeListeners.delete(onStoreChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function getClientThemeSnapshot(): MaterialTheme {
  if (typeof window === 'undefined') return 'light';
  if (memoryTheme !== null) return memoryTheme;
  try {
    return resolveStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

function getServerThemeSnapshot(): MaterialTheme {
  return 'light';
}

function applyThemeToDocument(theme: MaterialTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getClientThemeSnapshot,
    getServerThemeSnapshot
  );

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: MaterialTheme) => {
    memoryTheme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable
    }
    applyThemeToDocument(next);
    notifyThemeListeners();
  }, []);

  const toggleTheme = useCallback(() => {
    const next = getNextTheme(getClientThemeSnapshot());
    setTheme(next);
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
