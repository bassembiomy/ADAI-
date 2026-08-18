export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'adia_theme';

export function getStoredTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch (e) {
    console.warn('Unable to access localStorage for theme preference:', e);
  }
  return 'dark';
}

export function applyThemeToDOM(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

export function setStoredTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    console.warn('Unable to store theme preference in localStorage:', e);
  }
  applyThemeToDOM(theme);
}

export function toggleTheme(): AppTheme {
  const current = getStoredTheme();
  const next: AppTheme = current === 'dark' ? 'light' : 'dark';
  setStoredTheme(next);
  return next;
}
