# ADIA ↔ 3DEXPERIENCE Full Integration Plan

A complete, production-grade plan to deeply connect the ADIA Engineering Suite with the Dassault Systèmes **3DEXPERIENCE** platform — covering all diagram types, model sources (XBridges, VLab), code generation artifacts, and robust security hardening against credential theft and man-in-the-middle attacks.

---

## Background

The existing gateway (`ThreeDXGateway.tsx` + `threeDXService.ts`) already provides a skeleton with OAuth 2.0 PKCE login, a BrowserView panel, basic upload/download, and Electron IPC stubs. The **IPC handlers in `main.cjs` for 3DX are entirely missing** — all `3dx-*` channels are declared on the renderer side but never implemented in the main process.

This plan fills every gap, adds full diagram-type awareness, deepens VLab/XBridges model sync, and wraps the whole integration in a defense-in-depth security model.

---

## User Review Required

> [!IMPORTANT]
> You will need a **registered OAuth 2.0 Application** in your company's 3DEXPERIENCE IAM portal. The registered app must have the redirect URI set to `http://localhost:YOUR_PORT/callback`. You will get a **Client ID** from that registration. No client secret is stored — PKCE eliminates that need.

> [!WARNING]
> The plan uses `keytar` (system OS keychain) to store tokens. You must run `npm install keytar` once before this feature works in production. In the Electron dev mode it still works via in-memory cache, but tokens won't persist across restarts until `keytar` is installed.

> [!CAUTION]
> Never commit `clientId` or any token to Git. The `.gitignore` will be updated to ensure this. All secrets stay in OS keychain only.

---

## Open Questions

1. **3DEXPERIENCE platform region**: Is your tenant on `eu1`, `us1`, `ap1`, or a private cloud? The default IAM URL changes per region.
2. **Dashboard embedding approach**: Do you want a **live widget panel** (an iframe/BrowserView pane embedded inside ADIA showing dashboard data in real time), or a **push-pull sync** model (upload artifacts, then browse 3DX separately)?
3. **Diagram artifact format for 3DX**: Should BDD/IBD/State Machine/Requirements diagrams be uploaded as **PNG images + JSON metadata**, or as **pure JSON** for round-trip re-import?
4. **VLab model sync direction**: One-way (VLab → 3DX only), or bidirectional (can changes made in 3DX re-import into VLab)?
5. **XBridges model sync**: Should the full XBridges workspace JSON be uploaded, or only the compiled/generated code artifacts?

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADIA Electron App                             │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │  Renderer Process   │    │   Main Process (main.cjs)    │   │
│  │  ─────────────────  │    │  ────────────────────────── │   │
│  │  ThreeDXGateway.tsx │    │  3DX IPC Handlers (NEW)      │   │
│  │  threeDXService.ts  │◄──►│  OAuth PKCE Flow             │   │
│  │  (IPC bridge)       │    │  keytar secure storage       │   │
│  │                     │    │  HTTPS calls → 3DX REST API  │   │
│  │  Diagram exporters  │    │  CSP enforcement             │   │
│  │  XBridges → JSON    │    │  Rate limiting               │   │
│  │  VLab → JSON        │    │  Audit log                   │   │
│  └─────────────────────┘    └──────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────┘
                                     │ HTTPS (TLS 1.2+)
                                     │ Authorization: Bearer <access_token>
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        3DEXPERIENCE Platform          │
                 │  ┌──────────┐  ┌────────────────────┐│
                 │  │ IAM /    │  │  Collaborative     ││
                 │  │ OAuth2   │  │  Spaces (6WTags,   ││
                 │  │ (PKCE)   │  │  Documents API,    ││
                 │  └──────────┘  │  Engineering BOM)  ││
                 │                └────────────────────┘│
                 └───────────────────────────────────────┘
```

---

## Proposed Changes

### Phase 1 — Security Foundation

#### [MODIFY] [main.cjs](file:///g:/adia%20project/src/main.cjs)
- Add `Content-Security-Policy` headers to the main window's `webContents` (restrict `script-src`, `connect-src` to only 3DX IAM domains and localhost).
- Enable `session.defaultSession.webRequest.onHeadersReceived` to inject CSP on all loaded pages.
- Set `contextIsolation: true` and `nodeIntegration: false` in BrowserWindow — replace with a proper **preload script** (`preload.cjs`) that exposes only the exact IPC channels ADIA needs (no raw `require`).
- Add a dedicated **local HTTP server** on a random loopback port (`127.0.0.1:0`) to receive the OAuth callback — immediately closes after one use.
- Implement all missing `3dx-*` IPC handlers (see Phase 2).

#### [NEW] [src/preload.cjs](file:///g:/adia%20project/src/preload.cjs)
- Replaces the current `nodeIntegration: true` approach.
- Uses `contextBridge.exposeInMainWorld('electronAPI', { ... })` to expose only whitelisted IPC channels.
- Renderer code accesses `window.electronAPI.invoke('3dx-...')` instead of raw `window.require('electron')`.

#### [NEW] [src/security/credentialVault.cjs](file:///g:/adia%20project/src/security/credentialVault.cjs)
- Wraps `keytar` with a consistent API: `setSecret(service, account, value)` / `getSecret(service, account)` / `deleteSecret(service, account)`.
- Falls back to an AES-256-GCM encrypted file store if `keytar` is unavailable (e.g., CI environment).
- **Never** stores secrets in `localStorage`, `sessionStorage`, or any renderer-accessible store.
- Provides an **audit log** function that appends timestamped entries to a local file (no network) for forensic review.

#### [NEW] [src/security/rateLimiter.cjs](file:///g:/adia%20project/src/security/rateLimiter.cjs)
- Simple in-memory token bucket per IPC channel.
- Prevents a compromised renderer from hammering the 3DX API with thousands of requests.
- Default: 60 requests/minute for upload/download, 10 requests/minute for auth channels.

---

### Phase 2 — 3DX IPC Backend (Main Process)

#### [MODIFY] [main.cjs](file:///g:/adia%20project/src/main.cjs)
Implement all the following IPC handlers using native `fetch` (Node 18+, available in Electron 22+):

| IPC Channel | Implementation |
|---|---|
| `3dx-oauth-start` | Launch local callback server, build PKCE `code_challenge`, open system browser to IAM `/authorize` |
| `3dx-refresh-token` | POST to IAM `/token` with `grant_type=refresh_token`, store new tokens via credentialVault |
| `3dx-load-credentials` | Read from credentialVault, redact access token before returning to renderer (renderer only gets expiry/user info) |
| `3dx-save-credentials` | Write to credentialVault only |
| `3dx-logout` | Delete from credentialVault, revoke token via IAM `/revoke` endpoint |
| `3dx-get-workspaces` | GET `{tenantUrl}/resources/v1/modeler/projects` with Bearer token |
| `3dx-upload-document` | POST multipart/form-data to 3DX Document Service REST API |
| `3dx-search-documents` | GET `{tenantUrl}/resources/v1/modeler/documents?$search=...` |
| `3dx-download-document` | GET document stream, return as base64 to renderer |
| `3dx-navigate` | Create/show Electron `BrowserView`, load URL within the session that holds the 3DX auth cookies |
| `3dx-browser-*` | Proxy back/forward/reload/close/state to the BrowserView instance |

> [!IMPORTANT]
> The **access token is NEVER sent to the renderer process**. The main process injects the `Authorization: Bearer` header server-side on every API call. The renderer only sees: user display name, email, token expiry timestamp, and workspace metadata.

---

### Phase 3 — Diagram Export Types

#### [MODIFY] [src/types/threeDX_types.ts](file:///g:/adia%20project/src/types/threeDX_types.ts)
Extend `AdiaExportType` to include all diagram types:

```typescript
export type AdiaExportType =
  | 'project_json'       // Full ADIA project snapshot
  | 'bdd_diagram'        // Block Definition Diagram (JSON + PNG)
  | 'ibd_diagram'        // Internal Block Diagram (JSON + PNG)
  | 'requirements'       // Requirements Diagram / table (JSON + CSV)
  | 'state_machine'      // State Machine diagram (JSON + PNG)
  | 'code_generation'    // Generated C/C++ source code (ZIP)
  | 'xbridges_model'     // XBridges workspace (JSON)
  | 'vlab_model'         // VLab simulation model (JSON)
  | 'hil_c_code'         // HIL C source files (ZIP)
  | 'pdf_report';        // Compiled PDF report
```

Add a new `ThreeDXDiagramMeta` interface that attaches SysML metadata (diagram type, version, element count) to each upload.

#### [MODIFY] [src/components/ThreeDXGateway.tsx](file:///g:/adia%20project/src/components/ThreeDXGateway.tsx)
- Add a new **"Sync"** tab alongside Auth/Browser/Upload/Download.
- The Sync tab shows a live **dashboard panel** with connection status to each ADIA module: BDD, IBD, Requirements, State Machine, Code Gen, XBridges, VLab.
- Each row has: last sync time, sync direction toggle (↑ push / ↓ pull / ↔ bidirectional), and a **Sync Now** button.
- Add a **diagram preview thumbnail** before upload (small canvas render of the current diagram).
- Add a **3DX Passport** section: shows tenant avatar, roles, licenses visible to ADIA.

---

### Phase 4 — Diagram Capture & Export Engine

#### [NEW] [src/services/diagramExporter.ts](file:///g:/adia%20project/src/services/diagramExporter.ts)
- `exportBddAsJson(bddState)` — serializes the BDD node/edge graph + block metadata.
- `exportIbdAsJson(ibdState)` — serializes parts, ports, connectors, boundary blocks.
- `exportRequirementsAsJson(reqState)` — serializes requirement tree, traces, verification status.
- `exportStateMachineAsJson(smState)` — serializes states, transitions, guards, actions.
- `exportCodeGenAsZip(codeFiles)` — bundles generated C files into a base64 ZIP string.
- `exportXBridgesAsJson(xbState)` — serializes the XBridges workspace (blocks + scopes + wiring).
- `exportVLabAsJson(vlabState)` — serializes VLab simulation parameters and model graph.
- Each exporter also calls `html2canvas` or React Flow's built-in SVG export to produce an image preview.

#### [MODIFY] [src/App.tsx](file:///g:/adia%20project/src/App.tsx)
- Wire all exporters: when `ThreeDXGateway` opens, compute `adiaExports` dynamically from the **current live state** of all diagram editors, not hardcoded placeholders.
- Pass `xbridgesState` and `vlabState` into the `adiaExports` array.

---

### Phase 5 — 3DEXPERIENCE Dashboard Homogeneity

#### [NEW] [src/components/ThreeDXDashboardPanel.tsx](file:///g:/adia%20project/src/components/ThreeDXDashboardPanel.tsx)
- An embedded Electron `BrowserView` controller that shows a **live 3DEXPERIENCE dashboard widget** inside ADIA.
- The widget is a real `<iframe>`-equivalent rendered via BrowserView, authenticated with the existing session cookies.
- It is positioned in a dedicated side panel (right-hand collapsible drawer) so it doesn't obscure diagram editing.
- Supported widgets: **Compass Home**, **My Projects**, **My Tasks**, **Collaborative Space Explorer**.
- The panel respects the ADIA dark theme by injecting a CSS override script into the BrowserView: `document.documentElement.setAttribute('data-theme', 'dark')` for 3DS apps that support theming.

#### [NEW] [src/styles/threedx_theme.css](file:///g:/adia%20project/src/styles/threedx_theme.css)
- CSS variables that mirror 3DEXPERIENCE's design tokens (DS Blue `#005386`, Compass orange, etc.) so ADIA's gateway panels feel native to 3DX users.
- Shared between `ThreeDXGateway.tsx` and `ThreeDXDashboardPanel.tsx`.

---

### Phase 6 — Security Hardening

#### [MODIFY] [main.cjs](file:///g:/adia%20project/src/main.cjs)
- **Certificate pinning**: Before each HTTPS request to 3DX IAM, verify the server certificate's public key fingerprint matches a stored SHA-256 pin. Alert user and abort if mismatch (prevents MITM).
- **TLS version enforcement**: Use `tls.createSecureContext({ minVersion: 'TLSv1.2' })` in the Node `https` module options.
- **Request signing**: All outbound API requests include an `X-ADIA-Request-Id` nonce header for replay-attack detection.
- **Token refresh guard**: If `3dx-refresh-token` is called more than 5 times in 60 seconds, lock out and alert user — protects against token-refresh loops caused by XSS.
- **BrowserView sandboxing**: The 3DX BrowserView runs with `sandbox: true` and a custom session partition (`persist:3dx`) isolated from the ADIA renderer session. No shared cookies.
- **IPC allowlist validation**: Each IPC handler validates its input payload against a strict schema (using a tiny Zod-like validator) before processing — prevents renderer injection attacks from passing malicious payloads.
- **Audit log**: Every auth event, token refresh, upload, and download is logged with timestamp, action, and user email to `%APPDATA%/ADIA/audit.log`. The log is append-only (never overwritten).

#### [NEW] [.gitignore additions](file:///g:/adia%20project/.gitignore)
Ensure these patterns are present:
```
*.keystore
*.pem
*.key
adia_secrets.*
audit.log
.env*
```

---

### Phase 7 — VLab & XBridges Deep Sync

#### [MODIFY] [src/components/xbridges/XbridgesWorkspace.tsx](file:///g:/adia%20project/src/components/xbridges/XbridgesWorkspace.tsx)
- Add a **"Push to 3DX"** icon button in the XBridges toolbar that triggers a single-click upload of the current workspace JSON + the last compiled code to the selected 3DX collaborative space.
- Add a **"Pull from 3DX"** button that searches for XBridges model files in the current 3DX space and offers to import them.

#### [MODIFY] [src/components/vlab/VLabWorkspace.tsx](file:///g:/adia%20project/src/components/vlab/VLabWorkspace.tsx)
- Same push/pull buttons in the VLab toolbar.
- On pull: downloads a VLab JSON from 3DX and calls the VLab state restoration function.
- Simulation results (time series data) can optionally be uploaded as a CSV attachment to the 3DX document.

---

## Verification Plan

### Automated Tests
- Run existing build: `npm run dev` (already running) — should compile without TypeScript errors after type additions.
- After implementing preload: verify app still launches and all existing features (HIL, Factory I/O, diagrams) still work.
- Verify CSP headers: use Electron's `--enable-logging` flag and check console for CSP violations.

### Manual Verification
1. **Auth flow**: Enter tenant URL + client ID → click Authenticate → system browser opens IAM login → after login, app shows "Connected" status.
2. **Token security**: Confirm `localStorage` and renderer DevTools show **no access tokens** (only expiry timestamp and display name).
3. **Upload BDD**: Open BDD editor, add some blocks, open 3DX Gateway → Upload tab → check "BDD Diagram" → Upload. Verify document appears in 3DX collaborative space.
4. **Upload XBridges**: Open XBridges, build a model, click "Push to 3DX" — verify model JSON is in 3DX.
5. **Download round-trip**: Download a previously uploaded ADIA project JSON from 3DX → confirm it imports correctly into ADIA.
6. **Certificate pinning test**: Temporarily replace the pin with a wrong value — app should show an error and refuse to connect.
7. **Rate limiter test**: Rapidly click Upload 70+ times — verify it throttles after 60/min.
8. **Audit log**: After performing auth + upload + download, open `%APPDATA%/ADIA/audit.log` — all events should be present with timestamps.

---

## Implementation Order

1. `preload.cjs` + `contextIsolation` fix (security baseline — must do first)
2. `credentialVault.cjs` + `rateLimiter.cjs`
3. All `3dx-*` IPC handlers in `main.cjs`
4. `threeDX_types.ts` extended export types
5. `diagramExporter.ts`
6. `App.tsx` wiring of live diagram states to exports
7. `ThreeDXGateway.tsx` Sync tab + Passport section
8. `ThreeDXDashboardPanel.tsx`
9. XBridges + VLab Push/Pull buttons
10. Certificate pinning + audit log
11. `.gitignore` updates
12. End-to-end verification
