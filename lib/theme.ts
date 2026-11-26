export type MaterialTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ntw_relay_material_theme_v1';

/**
 * Resolves the active material theme from persisted preference.
 * Defaults to 'light' (Atelier Paper) unless the user explicitly selected 'dark' (Inkstone).
 */
export function resolveStoredTheme(raw: string | null | undefined): MaterialTheme {
  if (raw === 'dark') return 'dark';
  return 'light';
}

export function getNextTheme(current: MaterialTheme): MaterialTheme {
  return current === 'light' ? 'dark' : 'light';
}
