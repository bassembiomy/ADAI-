import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredTheme, setStoredTheme, applyThemeToDOM, toggleTheme } from './themeManager';

describe('themeManager', () => {
  let mockStorage: Record<string, string> = {};
  let mockAttributes: Record<string, string> = {};
  let mockClassList: Set<string> = new Set();

  beforeEach(() => {
    mockStorage = {};
    mockAttributes = {};
    mockClassList = new Set();

    // Mock localStorage
    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      clear: () => {
        mockStorage = {};
      },
    };
    vi.stubGlobal('localStorage', localStorageMock);

    // Mock document
    const documentMock = {
      documentElement: {
        setAttribute: (name: string, val: string) => {
          mockAttributes[name] = val;
        },
        getAttribute: (name: string) => mockAttributes[name] || null,
        removeAttribute: (name: string) => {
          delete mockAttributes[name];
        },
        classList: {
          add: (cls: string) => mockClassList.add(cls),
          remove: (cls: string) => mockClassList.delete(cls),
          contains: (cls: string) => mockClassList.has(cls),
        },
      },
    };
    vi.stubGlobal('document', documentMock);
  });

  it('defaults to dark when no theme is stored', () => {
    expect(getStoredTheme()).toBe('dark');
  });

  it('persists and retrieves light theme correctly', () => {
    setStoredTheme('light');
    expect(getStoredTheme()).toBe('light');
    expect(mockStorage['adia_theme']).toBe('light');
  });

  it('applies light theme attributes to documentElement', () => {
    applyThemeToDOM('light');
    expect(mockAttributes['data-theme']).toBe('light');
    expect(mockClassList.has('light')).toBe(true);
    expect(mockClassList.has('dark')).toBe(false);
  });

  it('applies dark theme attributes to documentElement', () => {
    applyThemeToDOM('dark');
    expect(mockAttributes['data-theme']).toBe('dark');
    expect(mockClassList.has('dark')).toBe(true);
    expect(mockClassList.has('light')).toBe(false);
  });

  it('toggles from dark to light and vice versa', () => {
    setStoredTheme('dark');
    const next1 = toggleTheme();
    expect(next1).toBe('light');
    expect(getStoredTheme()).toBe('light');

    const next2 = toggleTheme();
    expect(next2).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });
});
