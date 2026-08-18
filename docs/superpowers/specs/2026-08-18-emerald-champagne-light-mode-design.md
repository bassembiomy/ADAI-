# Emerald Ink & Champagne Light Mode Design Specification

## Overview
This specification details the architecture and implementation of a unified **Light Mode** across the entire ADIA application suite, styled with an editorial palette of **Emerald Ink (`#064E3B`)** and **Champagne (`#F8E7C9`)**, complementing the existing Dark Mode.

---

## 1. Color Palette & Token Design System

All surface, border, typography, and accent tokens are structured via CSS custom variables defined on `:root` and `[data-theme="light"]` in `src/index.css`.

| Token Name | Dark Mode (Default) | Light Mode (Emerald & Champagne) | Semantic Role |
| :--- | :--- | :--- | :--- |
| `--bg-main` | `#181818` | `#F8E7C9` | Main canvas, application body, root backdrop |
| `--bg-main-rgb` | `24, 24, 24` | `248, 231, 201` | RGB values for transparency channels |
| `--bg-panel` | `#242424` | `#EFE0BF` | Toolbars, sidebars, panel bodies, card surfaces |
| `--bg-panel-rgb` | `36, 36, 36` | `239, 224, 191` | RGB values for panel transparencies |
| `--bg-panel-secondary` | `#1F1F1F` | `#E4D4B1` | Text inputs, dropdown lists, table rows, node titlebars |
| `--text-primary` | `#FFFFFF` | `#064E3B` | High-contrast headings, main body text, active labels |
| `--text-secondary` | `#A1A1AA` | `#1B5E4B` | Sub-labels, metadata, descriptions, section subtitles |
| `--text-muted` | `#71717A` | `#3D6E5D` | Placeholder text, hotkey indicators, disabled elements |
| `--border-dark` | `#323232` | `#D6C29E` | Primary structural borders, panel dividers |
| `--border-med` | `#424242` | `#C7B18A` | Active borders, focused inputs, tab outlines |
| `--accent-emerald` | `#10B981` | `#064E3B` | Primary call-to-action buttons, active switches, icons |
| `--accent-emerald-hover` | `#059669` | `#043D2E` | Hover states on primary controls |
| `--accent-emerald-glow` | `rgba(16, 185, 129, 0.2)` | `rgba(6, 78, 59, 0.15)` | Focus rings, active node halos, selection outlines |
| `--node-bg` | `#242424` | `#FBF6EB` | ReactFlow block nodes background |
| `--wire-color` | `#444444` | `#064E3B` | ReactFlow connection curves, handles, and paths |
| `--scrollbar-thumb` | `rgba(201, 168, 108, 0.5)` | `rgba(6, 78, 59, 0.35)` | Custom scrollbar handle |
| `--scrollbar-thumb-hover` | `rgba(201, 168, 108, 0.9)` | `rgba(6, 78, 59, 0.65)` | Custom scrollbar handle hover |

---

## 2. Component & Workspace Adaptations

### 2.1 Top Navigation & Header
- **Container**: Champagne background (`--bg-panel`) with crisp bottom border (`--border-dark`).
- **Brand & Title**: Emerald Ink typography (`#064E3B`) with high contrast.
- **Theme Toggle Switch**:
  - Interactive Sun/Moon button positioned in the primary top toolbar.
  - Displays Sun icon in dark mode and Moon icon in light mode.
  - Micro-animation with smooth icon rotation on toggle.

### 2.2 ReactFlow Canvas & Node Graph
- **Canvas Dots / Grid**: Champagne backdrop (`#F8E7C9`) with subtle muted emerald dots (`rgba(6, 78, 59, 0.12)`).
- **Block Nodes**: Ivory card bodies (`#FBF6EB`) with emerald header bars and champagne borders (`--border-dark`).
- **Connection Handles & Wires**: Emerald Ink (`#064E3B`) stroke with glow animations on hover and active connection dragging.
- **Controls & Minimap**: Champagne backdrop, emerald action icons, and transparent viewport frame.

### 2.3 Sidebars (Block Library, AI Architect, Properties, Inspector)
- **Panels**: Soft champagne surface (`--bg-panel`) with clear section separation.
- **Search & Input Bars**: Inset surface (`--bg-panel-secondary`) with emerald ink text and emerald focus rings.
- **List Items & Accordions**: Smooth emerald hover states (`rgba(6, 78, 59, 0.08)`).

### 2.4 Floating Trays & Modals
- **Consoles & Live Monitors**: High-contrast champagne background with deep emerald syntax and log text.
- **Modals & Overlays**: Warm backdrop blur (`rgba(6, 78, 59, 0.2)`), layered champagne modal card, and emerald primary action buttons.

---

## 3. State Management & Persistence

- **State Storage**: `localStorage.getItem('adia_theme')`.
- **Default State**: `'dark'` (or restored from `localStorage`).
- **DOM Synchronization**:
  ```typescript
  document.documentElement.setAttribute('data-theme', currentTheme);
  if (currentTheme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
  ```
- **Transitions**: Controlled CSS transitions applied to `background-color`, `border-color`, and `color` ensuring no layout jitter or canvas rendering stutter.

---

## 4. Verification Plan
- **Theme Switching**: Verify that clicking the toggle button switches instantly between Dark and Emerald/Champagne Light mode.
- **Persistence**: Verify that refreshing or restarting the application preserves the selected theme.
- **Component Contrast**: Verify that all texts, inputs, dropdowns, ReactFlow nodes, wire connections, and modal dialogs maintain WCAG AA/AAA visual contrast.
- **Automated Tests**: Run existing test suites (`npm test` / Vitest) to ensure no component regressions.
