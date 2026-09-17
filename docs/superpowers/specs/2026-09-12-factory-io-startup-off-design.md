# Specification: Factory I/O Default State on Application Startup

**Date:** 2026-09-12  
**Status:** Approved by User  
**Topic:** Factory I/O Startup Configuration

---

## 1. Objective & Motivation

When the ADIA application initializes, the Factory I/O integration should default to **OFF** (`factoryIOEnabled = false`).
Previously, `factoryIOEnabled` was initialized to `true`, causing an immediate probe via IPC (`fetch-factory-io-tags`) to the local loopback Web API (`127.0.0.1:7410`) on application startup, and displaying an active state indicator in the toolbar even when Factory I/O was not intended to run.

---

## 2. Requirements & Behavior

1. **Initial State at Application Launch**:
   - `factoryIOEnabled` MUST initialize to `false`.
   - `factoryIOStatus` MUST initialize to `'disconnected'`.
   - No automatic IPC calls to `fetch-factory-io-tags` shall be executed on application mount while Factory I/O remains disabled.
   - The toolbar button for Factory I/O MUST render in its inactive/unhighlighted state without the green/active indicator dot.

2. **Reactive Lifecycle on User Toggle**:
   - When the user explicitly enables Factory I/O (e.g. via the `FactoryIOGateway` dialog toggle):
     - If running in Electron (`(window as any).require`), query `fetch-factory-io-tags`.
     - Update `factoryIOStatus` to `'connected'` on success or `'error'` on failure.
   - When the user disables Factory I/O:
     - `factoryIOStatus` resets to `'disconnected'`.
     - Output commit / input sync polling ceases.

3. **Persistence**:
   - The disabled state is the default on every application launch (session resets to disabled).

---

## 3. Implementation Design

### File: `src/App.tsx`

1. **State Initialization**:
   ```typescript
   const [factoryIOEnabled, setFactoryIOEnabled] = useState(false);
   const [factoryIOStatus, setFactoryIOStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
   ```

2. **Connection Lifecycle Hook**:
   ```typescript
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

---

## 4. Testing & Verification

1. **Typecheck & Static Analysis**:
   - Run `npx tsc --noEmit` to verify type safety and zero regressions.
2. **Behavior Verification**:
   - Verify that upon initial render, `factoryIOEnabled` is `false`.
   - Verify that the Factory I/O toolbar button displays without the active badge/indicator.
   - Verify that enabling Factory I/O via the gateway dialog properly transitions `factoryIOEnabled` to `true` and triggers the connection query.
