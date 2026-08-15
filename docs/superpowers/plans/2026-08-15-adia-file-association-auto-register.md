# ADIA Windows `.adia` File Association Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure double-clicking any `.adia` file in Windows automatically launches or focuses ADIA and loads the project by auto-registering the `.adia` file association on app startup and providing a dedicated CLI registration script.

**Architecture:** Utilize `src/projectFiles/windowsFileAssociation.cjs` to write `HKCU\Software\Classes\.adia` and `HKCU\Software\Classes\ADIA.Project` registry keys. Hook auto-registration into `src/main.cjs` during `app.whenReady()` on Windows, and expose a standalone CLI script `scripts/register_file_association.cjs` via `npm run register-associations`.

**Tech Stack:** Node.js CommonJS, Electron 43, Windows Registry (`reg.exe`), Node `assert` tests.

## Global Constraints

- Association keys must only be written to `HKCU\Software\Classes` (no administrator privileges / UAC prompts required).
- Double-clicking a `.adia` file must reuse a running ADIA instance or launch a new instance if none is running.
- All tests must pass before and after changes.

---

### Task 1: Dedicated Registration CLI Script

**Files:**
- Create: `scripts/register_file_association.cjs`
- Create: `scripts/register_file_association.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `registerAdiaAssociation` from `src/projectFiles/windowsFileAssociation.cjs`.
- Produces: `resolveTargetExecutable(options)` and executable CLI script.

- [ ] **Step 1: Write failing CLI script resolution tests**

Create `scripts/register_file_association.test.cjs`:
```js
'use strict';
const assert = require('assert');
const { resolveTargetExecutable } = require('./register_file_association.cjs');

console.log('Running register_file_association tests...');

// 1. Packaged or specified executable override
assert.strictEqual(
  resolveTargetExecutable({ execPath: 'C:\\Program Files\\ADIA\\ADIA.exe', isPackaged: true }),
  'C:\\Program Files\\ADIA\\ADIA.exe'
);

// 2. Fallback to electron or local executable in dev
const devTarget = resolveTargetExecutable({
  execPath: 'C:\\Node\\node.exe',
  electronPath: 'C:\\Project\\node_modules\\electron\\dist\\electron.exe',
  projectDir: 'C:\\Project',
  isPackaged: false,
});
assert.ok(devTarget.includes('electron.exe') || devTarget.includes('ADIA.exe'));

console.log('All register_file_association tests PASSED.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/register_file_association.test.cjs`
Expected: FAIL with `Cannot find module './register_file_association.cjs'`.

- [ ] **Step 3: Implement `scripts/register_file_association.cjs` and update `package.json`**

Implement `scripts/register_file_association.cjs`:
```js
'use strict';
const path = require('path');
const fs = require('fs');
const { registerAdiaAssociation } = require('../src/projectFiles/windowsFileAssociation.cjs');

function resolveTargetExecutable(options = {}) {
  if (options.execPath && options.isPackaged) {
    return options.execPath;
  }
  if (options.targetPath && fs.existsSync(options.targetPath)) {
    return path.resolve(options.targetPath);
  }
  
  // Check for built package binary
  const builtApp = path.resolve(__dirname, '../out/ADIA-win32-x64/ADIA.exe');
  if (fs.existsSync(builtApp)) {
    return builtApp;
  }

  // Check for electron binary
  if (options.electronPath && fs.existsSync(options.electronPath)) {
    return options.electronPath;
  }

  try {
    const electron = require('electron');
    if (typeof electron === 'string' && fs.existsSync(electron)) {
      return electron;
    }
  } catch {}

  return options.execPath || process.execPath;
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('File association registration is only applicable on Windows.');
    return;
  }

  const targetExe = resolveTargetExecutable({
    execPath: process.execPath,
    isPackaged: false,
  });

  console.log(`Registering .adia file association for executable: ${targetExe}`);
  await registerAdiaAssociation(targetExe);
  console.log('Successfully registered .adia file association in HKCU\\Software\\Classes.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to register file association:', err);
    process.exit(1);
  });
}

module.exports = {
  resolveTargetExecutable,
  main,
};
```

Add `"register-associations": "node scripts/register_file_association.cjs"` to `package.json`.

- [ ] **Step 4: Run CLI test to verify it passes**

Run: `node scripts/register_file_association.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/register_file_association.cjs scripts/register_file_association.test.cjs
git commit -m "feat: add CLI script to register .adia file association"
```

---

### Task 2: Application Startup Auto-Registration

**Files:**
- Modify: `src/main.cjs`

**Interfaces:**
- Consumes: `registerAdiaAssociation` from `src/projectFiles/windowsFileAssociation.cjs`.
- Produces: background registry verification/registration in `app.whenReady()`.

- [ ] **Step 1: Add startup association call in `src/main.cjs`**

In `src/main.cjs`, import `registerAdiaAssociation` from `./projectFiles/windowsFileAssociation.cjs`.
Inside `app.whenReady().then(...)`, trigger registration on Windows:
```js
const { registerAdiaAssociation } = require('./projectFiles/windowsFileAssociation.cjs');
// ...
if (process.platform === 'win32') {
  registerAdiaAssociation(process.execPath).catch(err => {
    console.warn('[STARTUP] Could not auto-register .adia file association:', err.message);
  });
}
```

- [ ] **Step 2: Run all test suites**

Run: `npm run test:project-files`
Expected: PASS for all project file test suites.

- [ ] **Step 3: Commit**

```powershell
git add src/main.cjs
git commit -m "feat: auto-register .adia file association on Windows app startup"
```

---

### Task 3: Execution and End-to-End Verification

**Files:**
- Run CLI command: `npm run register-associations`

- [ ] **Step 1: Execute registration script**

Run: `npm run register-associations`
Expected: Output showing `.adia` successfully registered in `HKCU\Software\Classes`.

- [ ] **Step 2: Verify registry keys in Windows**

Verify via `reg query "HKCU\Software\Classes\.adia"` and `reg query "HKCU\Software\Classes\ADIA.Project"`.
Expected: `(Default) REG_SZ ADIA.Project` and command pointing to executable with `"%1"`.
