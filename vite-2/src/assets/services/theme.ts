export type ThemePreference = 'light' | 'dark' | 'system';

const themeKeyPrefix = 'pms-theme:';

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

export const getThemeKey = (userId: string | null | undefined): string | null =>
  userId ? `${themeKeyPrefix}${userId}` : null;

export const getStoredTheme = (userId: string | null | undefined): ThemePreference => {
  const key = getThemeKey(userId);
  if (!key) return 'system';
  const stored = localStorage.getItem(key);
  return isThemePreference(stored) ? stored : 'system';
};

export const storeTheme = (userId: string, theme: ThemePreference): void => {
  localStorage.setItem(getThemeKey(userId)!, theme);
};

export const applyTheme = (theme: ThemePreference): void => {
  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};
