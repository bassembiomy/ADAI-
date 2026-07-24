# ADIA Engineering Suite — Security Policy

## Supported Versions

| Version | Security Updates |
|---------|:---:|
| Latest (`main`) | ✅ |
| Older releases | ❌ |

---

## Responsible Disclosure

If you discover a security vulnerability in ADIA, please **do not open a public GitHub issue**.
Instead, report it directly to the ADIA team:

- **Email**: [security@your-domain.com] *(update with actual contact)*
- **Expected response time**: 5 business days for acknowledgment, 30 days for remediation

Please include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)
- Any suggested mitigations

---

## Security Architecture

ADIA is an **Electron desktop application** (no remote server-side backend for user data).
All sensitive data is processed locally. The key security controls are:

### 1. Credential Vault (`src/security/credentialVault.cjs`)
- API keys and OAuth tokens stored in OS keychain via `keytar`
- AES-256-GCM fallback encryption tied to machine-specific entropy
- Audit log with **HMAC-SHA256 integrity** per entry and **automatic rotation** (1 MB limit, 3 generations)

### 2. Role-Level Security (`src/security/roleSecurity.cjs`)
- Three roles: `guest`, `engineer`, `admin`
- Role derived from stored credential state (admin = valid 3DX token, engineer = any stored credentials, guest = none)
- `checkPermission(role, module, action)` enforced at every sensitive IPC handler
- Future-ready: designed for Supabase/SQLite backend role extension

**Permission Matrix:**

| Module/Action | guest | engineer | admin |
|---|:---:|:---:|:---:|
| AI: use | ❌ | ✅ | ✅ |
| HIL: compile | ❌ | ✅ | ✅ |
| HIL: flash | ❌ | ✅ | ✅ |
| 3DX: OAuth | ❌ | ✅ | ✅ |
| 3DX: credentials | ❌ | ✅ | ✅ |
| Project: import/export | ❌ | ✅ | ✅ |
| Audit: view log | ❌ | ❌ | ✅ |

### 3. Input Validation (`src/security/inputValidator.cjs`)
- Toolchain key allowlist (`Generic`, `Arduino`, `STM32`) — prevents injection via key names
- Service name allowlist (`gemini`, `openai`, `local`, `n8n`) — prevents key poisoning
- SSRF-safe redirect URL validation against an explicit `ALLOWED_DOWNLOAD_HOSTS` list
- Filename sanitization (strips `..`, separators, null bytes) + path-prefix guard

### 4. Electron IPC Security (`src/preload.cjs`)
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — always enabled
- Full allowlist of permitted IPC channels — no wildcard passthrough
- Rate limiting on all channels (token bucket, per-channel + per-sender)

### 5. ASAR Integrity (`src/security/asarGuard.cjs`)
- SHA-256 hash of the packaged ASAR checked at startup (production only)
- DevTools unconditionally disabled in packaged builds
- Sensitive files excluded from ASAR: `.env`, `audit.log`, `hil_build/`, test files

### 6. Content Security Policy
Production CSP (applied via `webRequest.onHeadersReceived`):
- `script-src 'self'` — no `unsafe-inline` in production
- `connect-src` scoped to: 3DEXPERIENCE, Gemini API, OpenAI API, local Factory I/O
- `object-src 'none'`, `base-uri 'self'`
- `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`

### 7. API Key Handling
- Gemini API key sent via `x-goog-api-key` header (not URL query string) to prevent server-log exposure
- OpenAI key sent via `Authorization: Bearer` header
- Key format validation before use (Gemini: `AIza...`, OpenAI: `sk-...`)
- Keys masked in log output as `****...XXXX`

### 8. Shell & Process Security
- `extractZip` uses `spawn()` with array arguments — not `exec()` with string interpolation
- All toolchain downloads validate redirect chains against `ALLOWED_DOWNLOAD_HOSTS`
- HIL compile uses allowlisted arguments for targets, optimization levels, warning levels

---

## Known Residual Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `xlsx@0.18.5` prototype pollution (GHSA-4r6h-8v6p-xvw6) | High | No upstream fix in npm registry. Tracked for migration to `exceljs`. |
| `tar` deep transitive vulnerabilities in forge toolchain | Critical | Only in devDependency chain (build tools), not in packaged app. `overrides.tar >= 6.2.1` applied. |
| Electron source extraction | Informational | Electron apps cannot be fully protected from a machine owner. ASAR integrity raises the bar but is not absolute. |
| ASAR integrity bypass (`GHSA-vmqv-hx8q-j7mg`) | High | Mitigated by upgrading to Electron ^43.2.0 which includes the fix. |

---

## Security Test Commands

```bash
# Run all security unit tests (no framework required)
npm run test:security

# Dependency vulnerability scan
npm run audit:security

# Full vulnerability report
npm run audit:security:full

# Verify audit log integrity (from app or CLI)
node -e "const v = require('./src/security/credentialVault.cjs'); console.log(v.verifyAuditLog())"
```

---

## Changelog (Security)

| Date | Change |
|------|--------|
| 2026-07-25 | P1: Shell injection fix (`exec` → `spawn`), path traversal in hil-save-build-files, SSRF redirect validation |
| 2026-07-25 | P2: Role-Level Security module (guest/engineer/admin) with permission matrix |
| 2026-07-25 | P3: ASAR integrity guard, DevTools disabled in prod, sensitive files excluded from package |
| 2026-07-25 | P4: Gemini API key moved to `x-goog-api-key` header, key format validation |
| 2026-07-25 | P5: CSP tightened (no `unsafe-inline` in prod), AI API origins added to `connect-src` |
| 2026-07-25 | P6: Audit log HMAC integrity + rotation |
| 2026-07-25 | P7: Electron upgraded to ^43.2.0, `overrides` for tar/postcss CVEs |
