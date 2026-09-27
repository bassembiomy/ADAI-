# Factory I/O Startup Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Factory I/O is strictly disabled (`factoryIOEnabled = false`) when the application starts, with no premature loopback IPC connection calls on launch.

**Architecture:** Initialize `factoryIOEnabled` to `false` in `src/App.tsx`, and replace the mount-only connection check with a reactive effect that only queries tags when explicitly enabled and resets status to disconnected when disabled. Add a unit test suite for the gateway component and its enabled toggle lifecycle.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

## Global Constraints

- Factory I/O default state MUST be `false` on every application start.
- `factoryIOStatus` MUST initialize to `'disconnected'`.
- No unsolicited IPC requests to `fetch-factory-io-tags` when `factoryIOEnabled` is false.
- All code must pass `tsc --noEmit` with zero errors.

---

### Task 1: Component Unit Tests for Factory I/O Gateway

**Files:**
- Create: `src/components/FactoryIOGateway.test.tsx`

**Interfaces:**
- Consumes: `FactoryIOGateway` from `src/components/FactoryIOGateway.tsx`
- Produces: Vitest test coverage ensuring the component renders correctly with `isEnabled: false`, shows offline status, and invokes `setIsEnabled` when toggled.

- [ ] **Step 1: Write the unit tests**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FactoryIOGateway } from './FactoryIOGateway';

describe('FactoryIOGateway component', () => {
  it('renders correctly in disabled state with Offline indicator', () => {
    const setIsEnabled = vi.fn();
    const setMapping = vi.fn();
    const onClose = vi.fn();

    render(
      <FactoryIOGateway
        isOpen={true}
        onClose={onClose}
        variables={[]}
        mapping={[]}
        setMapping={setMapping}
        isEnabled={false}
        setIsEnabled={setIsEnabled}
        status="disconnected"
      />
    );

    expect(screen.getByText('Factory I/O Gateway')).toBeDefined();
    expect(screen.getByText('Offline')).toBeDefined();
    expect(screen.getByText('Enable Real-Time Synchronization')).toBeDefined();
  });

  it('triggers setIsEnabled when connection toggle is clicked', () => {
    const setIsEnabled = vi.fn();
    const setMapping = vi.fn();
    const onClose = vi.fn();

    render(
      <FactoryIOGateway
        isOpen={true}
        onClose={onClose}
        variables={[]}
        mapping={[]}
        setMapping={setMapping}
        isEnabled={false}
        setIsEnabled={setIsEnabled}
        status="disconnected"
      />
    );

    const toggleButton = screen.getByRole('button', { name: '' });
    // The toggle switch inside Connection Control
    fireEvent.click(toggleButton);
    expect(setIsEnabled).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes or check test environment**

Run: `npx vitest run src/components/FactoryIOGateway.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/FactoryIOGateway.test.tsx
git commit -m "test: add unit tests for FactoryIOGateway component"
```

---

### Task 2: Configure Default Startup State & Reactive Lifecycle in App.tsx

**Files:**
- Modify: `src/App.tsx:6204-6205`
- Modify: `src/App.tsx:6868-6877`

**Interfaces:**
- Consumes: `useState`, `useEffect` from React
- Produces: `factoryIOEnabled: false` default state; reactive IPC status probe on enable toggle.

- [ ] **Step 1: Update initial state in App.tsx**

Change line 6204 from:
```tsx
  const [factoryIOEnabled, setFactoryIOEnabled] = useState(true);
```
to:
```tsx
  const [factoryIOEnabled, setFactoryIOEnabled] = useState(false);
```

- [ ] **Step 2: Update connection effect in App.tsx**

Change lines 6868-6876 from:
```tsx
  useEffect(() => {
    if (factoryIOEnabled && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.invoke('fetch-factory-io-tags').then((tags: any) => {
        if (tags && !tags.error) setFactoryIOStatus('connected');
        else setFactoryIOStatus('error');
      });
    }
  }, []);
```
to:
```tsx
  useEffect(() => {
    let isMounted = true;
    if (factoryIOEnabled && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.invoke('fetch-factory-io-tags').then((tags: any) => {
        if (!isMounted) return;
        if (tags && !tags.error) setFactoryIOStatus('connected');
        else setFactoryIOStatus('error');
      }).catch(() => {
        if (!isMounted) return;
        setFactoryIOStatus('error');
      });
    } else if (!factoryIOEnabled) {
      setFactoryIOStatus('disconnected');
    }
    return () => {
      isMounted = false;
    };
  }, [factoryIOEnabled]);
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "fix: default factory io state to off on application startup"
```

---

### Task 3: Full Verification & E2E / Diagnostic Checks

**Files:**
- None (verification only)

- [ ] **Step 1: Run Vitest unit tests**

Run: `npx vitest run src/components/FactoryIOGateway.test.tsx`
Expected: PASS

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run security unit tests**

Run: `npm run test:security`
Expected: All security suites pass
