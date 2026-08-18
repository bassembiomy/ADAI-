# Emerald Ink & Champagne Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully unified, elegant Light Mode across the ADIA application using the **Emerald Ink (`#064E3B`)** and **Champagne (`#F8E7C9`)** design system with a top-bar toggle and localStorage persistence.

**Architecture:** We establish a semantic CSS custom property system on `:root` and `[data-theme="light"]` within `src/index.css`. A dedicated `themeManager.ts` manages the active theme (`'dark' | 'light'`), synchronizes the `data-theme` attribute and `light`/`dark` class on `document.documentElement`, and persists state in `localStorage`. The top navigation bar in `src/App.tsx` provides a responsive toggle switch with smooth micro-animations.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, ReactFlow, Lucide Icons, Vitest.

## Global Constraints
- Light Mode Primary Canvas / Surface: Champagne `#F8E7C9`
- Light Mode Typography & Accents: Emerald Ink `#064E3B`
- Default initial theme: `'dark'` (or restored from `localStorage.getItem('adia_theme')`)
- Smooth visual transitions with zero layout shift or canvas stutter
- Maintain WCAG AA/AAA contrast across all nodes, sidebars, toolbars, and modals

---

### Task 1: Theme State Manager (`src/utils/themeManager.ts`)

**Files:**
- Create: `src/utils/themeManager.ts`
- Test: `src/utils/themeManager.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type AppTheme = 'dark' | 'light';
  export function getStoredTheme(): AppTheme;
  export function setStoredTheme(theme: AppTheme): void;
  export function applyThemeToDOM(theme: AppTheme): void;
  export function toggleTheme(): AppTheme;
  ```

- [ ] **Step 1: Write failing unit tests for Theme Manager**

```typescript
// src/utils/themeManager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredTheme, setStoredTheme, applyThemeToDOM, toggleTheme, AppTheme } from './themeManager';

describe('themeManager', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark when no theme is stored', () => {
    expect(getStoredTheme()).toBe('dark');
  });

  it('persists and retrieves light theme correctly', () => {
    setStoredTheme('light');
    expect(getStoredTheme()).toBe('light');
    expect(localStorage.getItem('adia_theme')).toBe('light');
  });

  it('applies light theme attributes to documentElement', () => {
    applyThemeToDOM('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies dark theme attributes to documentElement', () => {
    applyThemeToDOM('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/themeManager.test.ts`
Expected: FAIL with module/function not found.

- [ ] **Step 3: Implement Theme Manager**

```typescript
// src/utils/themeManager.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/themeManager.test.ts`
Expected: PASS (all 5 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/utils/themeManager.ts src/utils/themeManager.test.ts
git commit -m "feat(theme): add theme manager utility with localStorage persistence and DOM synchronization"
```

---

### Task 2: Emerald & Champagne CSS Design System (`src/index.css`)

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `[data-theme="light"]` attribute selector
- Produces: CSS variables `--bg-main`, `--bg-panel`, `--bg-panel-secondary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-dark`, `--border-med`, `--accent-emerald`, `--node-bg`, `--wire-color`.

- [ ] **Step 1: Update CSS custom properties and theme selectors in `src/index.css`**

Add complete light mode token definitions and smooth transition classes:
```css
:root {
  color-scheme: dark;
  --bg-main: #181818;
  --bg-main-rgb: 24, 24, 24;
  --bg-panel: #242424;
  --bg-panel-rgb: 36, 36, 36;
  --bg-panel-secondary: #1f1f1f;
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --border-dark: #323232;
  --border-med: #424242;
  --accent-emerald: #10b981;
  --accent-emerald-hover: #059669;
  --accent-emerald-glow: rgba(16, 185, 129, 0.2);
  --node-bg: #242424;
  --wire-color: #444444;
  --scrollbar-thumb: rgba(201, 168, 108, 0.5);
  --scrollbar-thumb-hover: rgba(201, 168, 108, 0.9);
}

[data-theme="light"], .light {
  color-scheme: light;
  --bg-main: #F8E7C9;
  --bg-main-rgb: 248, 231, 201;
  --bg-panel: #EFE0BF;
  --bg-panel-rgb: 239, 224, 191;
  --bg-panel-secondary: #E4D4B1;
  --text-primary: #064E3B;
  --text-secondary: #1B5E4B;
  --text-muted: #3D6E5D;
  --border-dark: #D6C29E;
  --border-med: #C7B18A;
  --accent-emerald: #064E3B;
  --accent-emerald-hover: #043D2E;
  --accent-emerald-glow: rgba(6, 78, 59, 0.15);
  --node-bg: #FBF6EB;
  --wire-color: #064E3B;
  --scrollbar-thumb: rgba(6, 78, 59, 0.35);
  --scrollbar-thumb-hover: rgba(6, 78, 59, 0.65);
}

/* Base Body Styles */
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--bg-main);
  color: var(--text-primary);
  overflow: hidden;
  transition: background-color 0.25s ease, color 0.2s ease;
}

/* React Flow Nodes & Handles in Light / Dark */
.react-flow__node {
  border-radius: 8px;
  background: var(--node-bg);
  border: 1px solid var(--border-dark);
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.react-flow__handle {
  background: var(--accent-emerald);
  border: 2px solid var(--bg-main) !important;
}

.react-flow__edge-path {
  stroke: var(--wire-color);
  stroke-width: 2;
}

.react-flow__controls {
  background: var(--bg-panel);
  border: 1px solid var(--border-dark);
}

.react-flow__controls-button {
  background: var(--bg-panel-secondary);
  border-bottom: 1px solid var(--border-dark);
  fill: var(--text-primary);
}

/* Light mode utility mappings for existing dark Tailwind classes */
[data-theme="light"] .bg-\[\#18181c\],
[data-theme="light"] .bg-\[\#181818\],
[data-theme="light"] .bg-zinc-900,
[data-theme="light"] .bg-zinc-950 {
  background-color: var(--bg-panel) !important;
}

[data-theme="light"] .bg-zinc-800,
[data-theme="light"] .bg-\[\#1f1f1f\] {
  background-color: var(--bg-panel-secondary) !important;
}

[data-theme="light"] .border-\[\#27272f\],
[data-theme="light"] .border-zinc-800,
[data-theme="light"] .border-zinc-700 {
  border-color: var(--border-dark) !important;
}

[data-theme="light"] .text-white,
[data-theme="light"] .text-zinc-100,
[data-theme="light"] .text-zinc-200 {
  color: var(--text-primary) !important;
}

[data-theme="light"] .text-zinc-300,
[data-theme="light"] .text-zinc-400 {
  color: var(--text-secondary) !important;
}

[data-theme="light"] .text-zinc-500,
[data-theme="light"] .text-zinc-600 {
  color: var(--text-muted) !important;
}

[data-theme="light"] .hover\:bg-zinc-800:hover,
[data-theme="light"] .hover\:bg-zinc-700:hover {
  background-color: rgba(6, 78, 59, 0.08) !important;
  color: var(--text-primary) !important;
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "style(theme): add emerald ink and champagne css tokens and light mode overrides"
```

---

### Task 3: Top Navigation Bar Theme Toggle Button in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getStoredTheme`, `setStoredTheme`, `applyThemeToDOM`, `toggleTheme` from `src/utils/themeManager`
- Produces: Visual Sun/Moon toggle button in top bar header with rotation micro-animation and instant theme change.

- [ ] **Step 1: Initialize theme state on App mount and add Theme Switcher button**

In `src/App.tsx`:
1. Import `getStoredTheme`, `setStoredTheme`, `applyThemeToDOM`, `toggleTheme`, `AppTheme` from `./utils/themeManager`.
2. Add `const [currentTheme, setCurrentTheme] = useState<AppTheme>(getStoredTheme);`
3. Add `useEffect(() => { applyThemeToDOM(currentTheme); }, [currentTheme]);`
4. In the top toolbar navigation (around the right action bar near FPS monitor, settings, and help), add:
```tsx
<button
  id="adia-theme-toggle-btn"
  title={currentTheme === 'dark' ? 'Switch to Emerald & Champagne Light Mode' : 'Switch to Dark Mode'}
  onClick={() => {
    const next = toggleTheme();
    setCurrentTheme(next);
  }}
  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-all duration-200 shadow-sm"
  style={{
    backgroundColor: currentTheme === 'light' ? '#E4D4B1' : '#242424',
    borderColor: currentTheme === 'light' ? '#C7B18A' : '#3d3d3d',
    color: currentTheme === 'light' ? '#064E3B' : '#F8E7C9',
  }}
>
  {currentTheme === 'dark' ? (
    <>
      <Sun className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
      <span className="hidden sm:inline">Light</span>
    </>
  ) : (
    <>
      <Moon className="w-3.5 h-3.5 text-[#064E3B]" />
      <span className="hidden sm:inline">Dark</span>
    </>
  )}
</button>
```

- [ ] **Step 2: Verify Toggle button renders without TypeScript or runtime errors**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(ui): add sun/moon theme switcher button to main application header"
```

---

### Task 4: ReactFlow Canvas, Node Cards & Wire Theming

**Files:**
- Modify: `src/App.tsx` / Node renderer components

- [ ] **Step 1: Ensure ReactFlow background pattern, grid dots, and wire connections adapt dynamically to `currentTheme`**
- When `currentTheme === 'light'`:
  - Background color is `#F8E7C9`
  - Grid color is `rgba(6, 78, 59, 0.12)`
  - Edge default stroke is `#064E3B`
- When `currentTheme === 'dark'`:
  - Background color is `#181818`
  - Grid color is `#2a2a2a`
  - Edge default stroke is `#444444`

- [ ] **Step 2: Verify ReactFlow canvas appearance in both themes**

- [ ] **Step 3: Commit**

```bash
git commit -am "style(canvas): harmonize ReactFlow grid, node frames, and edge paths with active theme"
```

---

### Task 5: Polish Floating Overlays, Modals, and Sidebars

**Files:**
- Modify: `src/index.css` & Modal components if needed

- [ ] **Step 1: Verify and fine-tune contrast for AI Architect Sidebar, Properties Panel, Scope Panel, and HIL Overlays**
- [ ] **Step 2: Commit**

```bash
git commit -am "style(panels): ensure high-contrast emerald typography and champagne surfaces across all panels"
```

---

### Task 6: Full Verification & Automated Test Run

**Files:**
- Test: Run all unit & security tests

- [ ] **Step 1: Run theme tests**
Run: `npx vitest run src/utils/themeManager.test.ts`
Expected: PASS

- [ ] **Step 2: Run full build and test suites**
Run: `npm run test:security` and `npx tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 3: Final commit**

```bash
git commit -m "feat: complete unified Emerald Ink and Champagne Light Mode implementation"
```
