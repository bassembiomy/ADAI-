# Native `.adia` Files and Windows Association Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save unified ADIA projects as `.adia` files and register that extension during Windows Squirrel installation so double-clicking a project opens it in the existing ADIA instance.

**Architecture:** Pure CommonJS services own project paths, atomic file I/O, registry commands, and Squirrel lifecycle handling; Electron bootstrap and IPC adapt those services to the installed desktop app. A TypeScript serializer and renderer orchestration keep Save, Save As, Open, validation, dirty-state confirmation, and module export consistent without exposing filesystem access to the renderer.

**Tech Stack:** Electron 43, Electron Forge 7, Squirrel.Windows, Node.js 20 CommonJS services, React 18, TypeScript 5, Vitest 4, Node `assert` tests.

## Global Constraints

- The custom extension is exactly `.adia`; its contents remain UTF-8 JSON.
- `.adia` applies only to unified projects; individual module exports remain `.json`.
- Windows Squirrel is the only installer association target in this release.
- Registration is per-user under `HKCU\Software\Classes` and requires no administrator rights.
- Existing unified `.json` projects remain importable through the legacy import path.
- Every opened payload must pass the 50 MB limit, JSON parsing, and `validateImportedJson` before hydration.
- ADIA reuses one running window; it does not open a second project window.
- Save prompts only until a path is accepted; Save As changes the path only after a successful write.
- Registry and process execution must use fixed argument arrays, never shell-composed command strings.
- Do not modify or stage unrelated changes already present in the working tree.

---

## File Structure

- `src/projectFiles/projectFileService.cjs`: pure extension, argument, read, and atomic-write rules.
- `src/projectFiles/projectFileService.test.cjs`: Node assertion tests for project file I/O.
- `src/projectFiles/windowsFileAssociation.cjs`: safe registry registration and owned cleanup.
- `src/projectFiles/windowsFileAssociation.test.cjs`: registry command and ownership tests.
- `src/projectFiles/squirrelLifecycle.cjs`: Squirrel install/update/uninstall/obsolete dispatch and shortcut handling.
- `src/projectFiles/squirrelLifecycle.test.cjs`: lifecycle dispatch tests.
- `src/projectFiles/projectFileController.cjs`: dialog, active-path, token handshake, and renderer delivery state.
- `src/projectFiles/projectFileController.test.cjs`: controller behavior tests with injected Electron adapters.
- `src/bootstrap.cjs`: lifecycle gate that prevents normal startup during Squirrel events.
- `src/main.cjs`: single-instance coordination, project IPC registration, and window delivery.
- `src/preload.cjs`: narrowly allowlisted project IPC channels.
- `scripts/build_protected_electron.cjs`: use the bootstrap as the protected main-process entry and development fallback.
- `src/utils/adiaProjectPersistence.ts`: canonical unified payload and timestamp-insensitive clean snapshots.
- `src/utils/adiaProjectPersistence.test.ts`: serializer and dirty comparison tests.
- `src/App.tsx`: Save, Save As, Open, external-open acknowledgement, dirty confirmation, and Export Modules wiring.
- `package.json`: stable product metadata and focused test scripts.
- `forge.config.cjs`: Windows Squirrel identity and executable metadata.

---

### Task 1: Pure `.adia` File Service

**Files:**
- Create: `src/projectFiles/projectFileService.cjs`
- Create: `src/projectFiles/projectFileService.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Node `fs` and `path`, supplied through optional dependency parameters for tests.
- Produces: `normalizeAdiaPath(inputPath)`, `extractAdiaPath(argv, deps)`, `readProjectFile(filePath, options)`, `writeProjectFile(filePath, data, deps)`, `MAX_PROJECT_BYTES`, and `PROJECT_EXTENSION`.

- [ ] **Step 1: Write failing extension and argument tests**

Create a Node assertion harness covering these exact cases:

```js
const assert = require('assert');
const {
  normalizeAdiaPath,
  extractAdiaPath,
} = require('./projectFileService.cjs');

assert.strictEqual(normalizeAdiaPath('C:\\work\\Pump'), 'C:\\work\\Pump.adia');
assert.strictEqual(normalizeAdiaPath('C:\\work\\Pump.JSON'), 'C:\\work\\Pump.adia');
assert.strictEqual(normalizeAdiaPath('C:\\work\\Pump.ADIA'), 'C:\\work\\Pump.ADIA');

const existing = new Set(['C:\\work\\Pump.adia']);
const deps = {
  resolvePath: (value) => value,
  existsSync: (value) => existing.has(value),
  statSync: () => ({ isFile: () => true }),
};
assert.strictEqual(
  extractAdiaPath(['adia.exe', '--squirrel-firstrun', 'C:\\work\\Pump.adia'], deps),
  'C:\\work\\Pump.adia'
);
assert.strictEqual(extractAdiaPath(['adia.exe', 'C:\\work\\Pump.json'], deps), null);
```

End the harness with a non-zero exit on any failure, matching `src/security/inputValidator.test.cjs`.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node src/projectFiles/projectFileService.test.cjs`

Expected: FAIL with `Cannot find module './projectFileService.cjs'`.

- [ ] **Step 3: Implement extension normalization and safe argument extraction**

Implement the public contract with these rules:

```js
'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT_EXTENSION = '.adia';
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;

function normalizeAdiaPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new TypeError('Project path must be a non-empty string');
  }
  const parsed = path.parse(inputPath);
  if (parsed.ext.toLowerCase() === PROJECT_EXTENSION) return inputPath;
  return path.join(parsed.dir, `${parsed.name || parsed.base}${PROJECT_EXTENSION}`);
}

function extractAdiaPath(argv, deps = {}) {
  const resolvePath = deps.resolvePath || path.resolve;
  const existsSync = deps.existsSync || fs.existsSync;
  const statSync = deps.statSync || fs.statSync;
  for (const raw of Array.isArray(argv) ? argv : []) {
    if (typeof raw !== 'string' || raw.startsWith('--')) continue;
    const candidate = raw.replace(/^"|"$/g, '');
    if (path.extname(candidate).toLowerCase() !== PROJECT_EXTENSION) continue;
    const resolved = resolvePath(candidate);
    try {
      if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
    } catch {}
  }
  return null;
}
```

- [ ] **Step 4: Add failing read and atomic-write tests**

Use a temporary directory from `fs.mkdtempSync(path.join(os.tmpdir(), 'adia-project-'))` and verify:

```js
const savedPath = writeProjectFile(path.join(tempDir, 'Pump.json'), { version: '1.0', states: [] });
assert.strictEqual(path.extname(savedPath), '.adia');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(savedPath, 'utf8')), { version: '1.0', states: [] });
assert.deepStrictEqual(readProjectFile(savedPath).data, { version: '1.0', states: [] });
assert.throws(() => readProjectFile(path.join(tempDir, 'legacy.json')), /extension/i);
assert.deepStrictEqual(
  readProjectFile(path.join(tempDir, 'legacy.json'), { allowLegacyJson: true }).data,
  { projectName: 'Legacy' }
);
```

Inject a `renameSync` that throws, then assert the destination is unchanged and no `.tmp-` sibling remains.

- [ ] **Step 5: Implement bounded reads and atomic replacement**

Add:

```js
function readProjectFile(filePath, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  const allowed = extension === PROJECT_EXTENSION || (options.allowLegacyJson && extension === '.json');
  if (!allowed) throw new Error('Unsupported ADIA project extension');
  const stats = fsImpl.statSync(resolved);
  if (!stats.isFile()) throw new Error('Project path is not a regular file');
  if (stats.size > MAX_PROJECT_BYTES) throw new Error('Project file exceeds the 50 MB limit');
  return { filePath: resolved, data: JSON.parse(fsImpl.readFileSync(resolved, 'utf8')) };
}

function writeProjectFile(filePath, data, deps = {}) {
  const fsImpl = deps.fsImpl || fs;
  const target = normalizeAdiaPath(path.resolve(filePath));
  const temporary = `${target}.tmp-${process.pid}-${deps.randomId ? deps.randomId() : Date.now()}`;
  try {
    fsImpl.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fsImpl.renameSync(temporary, target);
    return target;
  } catch (error) {
    try { if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary); } catch {}
    throw error;
  }
}
```

Export all four functions and constants.

- [ ] **Step 6: Add and run the focused script**

Add `"test:project-files": "node src/projectFiles/projectFileService.test.cjs"` to `package.json`.

Run: `npm run test:project-files`

Expected: PASS with all file-service assertions reported and exit code 0.

- [ ] **Step 7: Commit the file service**

```powershell
git add -- package.json src/projectFiles/projectFileService.cjs src/projectFiles/projectFileService.test.cjs
git commit -m "feat: add native ADIA project file service"
```

---

### Task 2: Owned Windows Registry Association

**Files:**
- Create: `src/projectFiles/windowsFileAssociation.cjs`
- Create: `src/projectFiles/windowsFileAssociation.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: an injected `runReg(args)` function returning `{ stdout }`.
- Produces: `registerAdiaAssociation(execPath, deps)`, `unregisterOwnedAdiaAssociation(execPath, deps)`, `buildAssociationValues(execPath)`, and `createRegRunner(execFileImpl)`.

- [ ] **Step 1: Write failing registry command tests**

Record every `runReg` call and assert registration uses only arrays containing these keys and values:

```js
const expected = {
  extensionKey: 'HKCU\\Software\\Classes\\.adia',
  progIdKey: 'HKCU\\Software\\Classes\\ADIA.Project',
  icon: '"C:\\Apps\\ADIA\\adia.exe",0',
  command: '"C:\\Apps\\ADIA\\adia.exe" "%1"',
};
assert.deepStrictEqual(buildAssociationValues('C:\\Apps\\ADIA\\adia.exe'), expected);
assert.ok(calls.every(Array.isArray));
assert.ok(calls.every((args) => !args.join(' ').includes('cmd.exe')));
```

Test cleanup twice: `.adia = ADIA.Project` plus an ADIA-owned open command deletes both trees; `.adia = Other.App` deletes neither.

- [ ] **Step 2: Run the registry test and verify failure**

Run: `node src/projectFiles/windowsFileAssociation.test.cjs`

Expected: FAIL because `windowsFileAssociation.cjs` does not exist.

- [ ] **Step 3: Implement registry values and safe runner**

Use this ownership model:

```js
const EXTENSION_KEY = 'HKCU\\Software\\Classes\\.adia';
const PROG_ID = 'ADIA.Project';
const PROG_ID_KEY = `HKCU\\Software\\Classes\\${PROG_ID}`;

function buildAssociationValues(execPath) {
  return {
    extensionKey: EXTENSION_KEY,
    progIdKey: PROG_ID_KEY,
    icon: `"${execPath}",0`,
    command: `"${execPath}" "%1"`,
  };
}

function createRegRunner(execFileImpl = require('child_process').execFile) {
  return (args) => new Promise((resolve, reject) => {
    execFileImpl('reg.exe', args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}
```

Registration issues `reg.exe ADD <key> /ve /d <value> /f` for the extension, ProgID description, icon, and open command. `unregisterOwnedAdiaAssociation` first queries both default values; it deletes with `reg.exe DELETE <key> /f` only when the extension equals `ADIA.Project` and the open command equals the generated ADIA command. Treat a missing key as already clean.

- [ ] **Step 4: Run all ownership tests**

Run: `node src/projectFiles/windowsFileAssociation.test.cjs`

Expected: PASS for registration arrays, owned cleanup, reassigned preservation, and missing-key cleanup.

- [ ] **Step 5: Extend the focused script and commit**

Change `test:project-files` to run the file service and association tests in sequence.

```powershell
git add -- package.json src/projectFiles/windowsFileAssociation.cjs src/projectFiles/windowsFileAssociation.test.cjs
git commit -m "feat: register owned Windows ADIA file association"
```

---

### Task 3: Squirrel Lifecycle Bootstrap

**Files:**
- Create: `src/projectFiles/squirrelLifecycle.cjs`
- Create: `src/projectFiles/squirrelLifecycle.test.cjs`
- Create: `src/bootstrap.cjs`
- Modify: `scripts/build_protected_electron.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 2 registration functions and injected `spawnUpdate`, `register`, `unregister`, and `quit` adapters.
- Produces: `handleSquirrelLifecycle(options): boolean`; `src/bootstrap.cjs` loads `src/main.cjs` only when it returns `false`.

- [ ] **Step 1: Write failing lifecycle routing tests**

Assert exact behavior for each switch:

```js
assert.strictEqual(handle({ argv: ['adia.exe', '--squirrel-install'] }), true);
assert.deepStrictEqual(actions, ['register', 'shortcut:create', 'quit']);

assert.strictEqual(handle({ argv: ['adia.exe', '--squirrel-updated'] }), true);
assert.deepStrictEqual(actions, ['register', 'shortcut:create', 'quit']);

assert.strictEqual(handle({ argv: ['adia.exe', '--squirrel-uninstall'] }), true);
assert.deepStrictEqual(actions, ['unregister', 'shortcut:remove', 'quit']);

assert.strictEqual(handle({ argv: ['adia.exe', '--squirrel-obsolete'] }), true);
assert.deepStrictEqual(actions, ['quit']);

assert.strictEqual(handle({ argv: ['adia.exe', 'Pump.adia'] }), false);
assert.deepStrictEqual(actions, []);
```

The test adapter awaits a returned `completion` promise exposed only through the injected `onCompletion` callback, making action order deterministic.

- [ ] **Step 2: Run the lifecycle test and verify failure**

Run: `node src/projectFiles/squirrelLifecycle.test.cjs`

Expected: FAIL because the lifecycle module is missing.

- [ ] **Step 3: Implement lifecycle handling**

`handleSquirrelLifecycle` must synchronously return whether it recognized an event, then perform async work in this order:

```js
const event = argv[1];
const target = path.basename(execPath);
const actions = {
  '--squirrel-install': async () => {
    await register(execPath);
    await spawnUpdate([`--createShortcut=${target}`]);
  },
  '--squirrel-updated': async () => {
    await register(execPath);
    await spawnUpdate([`--createShortcut=${target}`]);
  },
  '--squirrel-uninstall': async () => {
    await unregister(execPath);
    await spawnUpdate([`--removeShortcut=${target}`]);
  },
  '--squirrel-obsolete': async () => {},
};
```

Catch and log registry or shortcut errors, always call `app.quit()` in `finally`, and never throw into normal bootstrap.

- [ ] **Step 4: Add the startup gate and protected-build entry**

Create `src/bootstrap.cjs`:

```js
'use strict';
const { app } = require('electron');
const { handleSquirrelLifecycle } = require('./projectFiles/squirrelLifecycle.cjs');

if (!handleSquirrelLifecycle({ app, argv: process.argv, execPath: process.execPath })) {
  require('./main.cjs');
}
```

In `scripts/build_protected_electron.cjs`, change the esbuild entry point from `src/main.cjs` to `src/bootstrap.cjs` and change the loader fallback from `../src/main.cjs` to `../src/bootstrap.cjs`, including the corresponding variable names and `require` calls.

- [ ] **Step 5: Run lifecycle tests and protected build**

Run: `node src/projectFiles/squirrelLifecycle.test.cjs`

Expected: PASS for all five lifecycle routes.

Run: `npm run build:electron`

Expected: exit code 0 and regenerated `dist-electron/main.jsc`, `dist-electron/index.cjs`, and `dist-electron/preload.cjs`.

- [ ] **Step 6: Extend the focused script and commit**

Add the lifecycle test to `test:project-files`, then commit only source, script, and package metadata; do not stage generated `dist-electron` artifacts unless they are already tracked by project policy.

```powershell
git add -- package.json scripts/build_protected_electron.cjs src/bootstrap.cjs src/projectFiles/squirrelLifecycle.cjs src/projectFiles/squirrelLifecycle.test.cjs
git commit -m "feat: handle Squirrel association lifecycle before startup"
```

---

### Task 4: Project Controller, IPC, and Single Instance

**Files:**
- Create: `src/projectFiles/projectFileController.cjs`
- Create: `src/projectFiles/projectFileController.test.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 `readProjectFile`, `writeProjectFile`, and `extractAdiaPath`.
- Produces: `createProjectFileController(deps)` with `registerIpc()`, `openExternal(filePath, window)`, `setWindow(window)`, and `getActivePath()`.
- IPC result: `{ status: 'opened', token, filePath, data }`, `{ status: 'saved', filePath }`, `{ status: 'cancelled' }`, or `{ status: 'error', message }`.

- [ ] **Step 1: Write failing controller tests**

With fake `ipcMain.handle`, dialogs, writer, reader, UUID, and window sender, verify:

- first `project-save` opens the dialog and remembers the normalized successful path;
- repeated `project-save` skips the dialog;
- `project-save-as` changes the active path only after success;
- cancellation and write failure preserve the prior path;
- `project-open-dialog` permits `.adia` and legacy `.json`;
- `openExternal` sends `project-open-requested` with an opaque token;
- `project-accept-open` accepts one matching token exactly once and ignores stale tokens.

Use this assertion for the handshake:

```js
const request = sent.find(([channel]) => channel === 'project-open-requested')[1];
assert.strictEqual(request.token, 'token-1');
assert.strictEqual(controller.getActivePath(), null);
assert.deepStrictEqual(await handlers['project-accept-open']({}, { token: 'token-1' }), { accepted: true });
assert.strictEqual(controller.getActivePath(), 'C:\\work\\Pump.adia');
assert.deepStrictEqual(await handlers['project-accept-open']({}, { token: 'token-1' }), { accepted: false });
```

- [ ] **Step 2: Run the controller test and verify failure**

Run: `node src/projectFiles/projectFileController.test.cjs`

Expected: FAIL because the controller module is absent.

- [ ] **Step 3: Implement controller state and handlers**

Use a `Map` of token to normalized file path. Do not set `activeProjectPath` during reads. Register these handlers:

```js
ipcMain.handle('project-open-dialog', openFromDialog);
ipcMain.handle('project-save', (_event, data) => save(data, false));
ipcMain.handle('project-save-as', (_event, data) => save(data, true));
ipcMain.handle('project-accept-open', (_event, { token }) => acceptOpen(token));
```

The save dialog configuration is:

```js
{
  title: 'Save ADIA Project',
  defaultPath: 'adia_project.adia',
  filters: [{ name: 'ADIA Project', extensions: ['adia'] }],
}
```

The open dialog filter is `[{ name: 'ADIA Project', extensions: ['adia', 'json'] }]`; pass `allowLegacyJson: true` only for the picker, never for shell arguments.

- [ ] **Step 4: Add secure preload channels**

Add `project-open-dialog`, `project-save`, `project-save-as`, and `project-accept-open` to `ALLOWED_INVOKE_CHANNELS`. Add only `project-open-requested` to `ALLOWED_ON_CHANNELS`.

- [ ] **Step 5: Integrate single-instance startup in `src/main.cjs`**

Before `app.whenReady()`, add:

```js
const { extractAdiaPath } = require('./projectFiles/projectFileService.cjs');
const { createProjectFileController } = require('./projectFiles/projectFileController.cjs');
const projectFiles = createProjectFileController({ ipcMain, dialog });
projectFiles.registerIpc();

app.setAppUserModelId('com.squirrel.adia.adia');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const initialProjectPath = extractAdiaPath(process.argv);

if (!hasSingleInstanceLock) app.quit();

app.on('second-instance', (_event, argv) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  const requestedPath = extractAdiaPath(argv);
  if (requestedPath && win) projectFiles.openExternal(requestedPath, win);
});
```

Guard the existing `app.whenReady()` block with `if (hasSingleInstanceLock)`. Make `createWindow()` return `win`; after creation call `projectFiles.setWindow(win)`, and after `did-finish-load` call `openExternal(initialProjectPath, win)` once when an initial path exists.

- [ ] **Step 6: Run controller and existing security tests**

Run: `npm run test:project-files`

Expected: PASS for service, registry, lifecycle, and controller suites.

Run: `npm run test:security`

Expected: all existing security suites pass.

- [ ] **Step 7: Commit Electron integration**

```powershell
git add -- package.json src/main.cjs src/preload.cjs src/projectFiles/projectFileController.cjs src/projectFiles/projectFileController.test.cjs
git commit -m "feat: coordinate single-instance ADIA project opening"
```

---

### Task 5: Canonical Unified Project Serializer

**Files:**
- Create: `src/utils/adiaProjectPersistence.ts`
- Create: `src/utils/adiaProjectPersistence.test.ts`

**Interfaces:**
- Consumes: the current unified-project fields assembled in `App.tsx`.
- Produces: `createUnifiedProjectPayload(input, now?)`, `createProjectSnapshot(payload)`, and `hasUnsavedProjectChanges(current, cleanSnapshot)`.

- [ ] **Step 1: Write failing serializer tests**

Cover preservation, timestamp injection, and timestamp-insensitive comparison:

```ts
import { describe, expect, it } from 'vitest';
import {
  createProjectSnapshot,
  createUnifiedProjectPayload,
  hasUnsavedProjectChanges,
} from './adiaProjectPersistence';

describe('ADIA unified project persistence', () => {
  it('creates the unified envelope without dropping module fields', () => {
    const payload = createUnifiedProjectPayload(
      { version: '1.0', projectName: 'Pump', states: [], globalXBridgesNodes: [] },
      () => new Date('2026-08-14T12:00:00.000Z')
    );
    expect(payload).toMatchObject({
      version: '1.0',
      timestamp: '2026-08-14T12:00:00.000Z',
      projectName: 'Pump',
      states: [],
      globalXBridgesNodes: [],
    });
  });

  it('ignores timestamp changes but detects model changes', () => {
    const first = { version: '1.0', timestamp: 'one', states: [] };
    const clean = createProjectSnapshot(first);
    expect(hasUnsavedProjectChanges({ ...first, timestamp: 'two' }, clean)).toBe(false);
    expect(hasUnsavedProjectChanges({ ...first, states: [{ id: 's1' }] }, clean)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts`

Expected: FAIL because `adiaProjectPersistence.ts` is missing.

- [ ] **Step 3: Implement the serializer and stable snapshot**

```ts
export type UnifiedProjectInput = Readonly<Record<string, unknown> & {
  version: string;
  projectName: string;
}>;

export function createUnifiedProjectPayload(
  input: UnifiedProjectInput,
  now: () => Date = () => new Date(),
): Record<string, unknown> {
  return { ...input, timestamp: now().toISOString() };
}

export function createProjectSnapshot(payload: Record<string, unknown>): string {
  const { timestamp: _timestamp, ...stable } = payload;
  return JSON.stringify(stable);
}

export function hasUnsavedProjectChanges(
  current: Record<string, unknown>,
  cleanSnapshot: string | null,
): boolean {
  return cleanSnapshot !== null && createProjectSnapshot(current) !== cleanSnapshot;
}
```

- [ ] **Step 4: Run the focused test and TypeScript build**

Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts`

Expected: 2 tests PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 5: Commit the serializer**

```powershell
git add -- src/utils/adiaProjectPersistence.ts src/utils/adiaProjectPersistence.test.ts
git commit -m "feat: add canonical ADIA project serializer"
```

---

### Task 6: Renderer Save, Save As, Open, and Dirty Confirmation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/utils/adiaProjectPersistence.test.ts`

**Interfaces:**
- Consumes: Task 4 IPC result shapes and Task 5 serializer functions.
- Produces: `buildUnifiedProjectPayload()`, `handleSaveProject()`, `handleSaveProjectAs()`, and one shared `acceptOpenedProject(result)` path for picker and shell opens.

- [ ] **Step 1: Add failing acceptance-decision tests to the persistence utility test**

Extract and test a pure helper before wiring React:

```ts
export function shouldConfirmProjectReplacement(
  current: Record<string, unknown>,
  cleanSnapshot: string | null,
): boolean {
  return hasUnsavedProjectChanges(current, cleanSnapshot);
}
```

Assert a clean project returns `false`, a modified project returns `true`, and a never-snapshotted new session returns `false`.

- [ ] **Step 2: Run the focused test and verify the missing export failure**

Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts`

Expected: FAIL because `shouldConfirmProjectReplacement` is not exported.

- [ ] **Step 3: Implement the helper and canonical App serializer**

Import the Task 5 functions. Replace the duplicated object currently assigned to `projectFiles['adia_project_unified.json']` with one `buildUnifiedProjectPayload` callback that contains exactly the existing unified fields:

```ts
const buildUnifiedProjectPayload = useCallback(() => createUnifiedProjectPayload({
  version: VERSION,
  projectName: currentProjectName,
  openTabs,
  ...createPersistedAppSimulationModel({ tickMs, states, junctions, transitions, layers, variables, safetyMode, hilConfig }),
  view,
  blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes,
  hmiComponents, vlabNodes, vlabEdges, globalXBridgesNodes, globalXBridgesEdges,
  hilConfig,
  doe: { headers, data, activeModel, taguchiConfig, results },
  managedWindows,
  entropyNodes,
  entropyEdges,
  workspaceFiles: saveCurrentFileState(workspaceFiles, activeFileId),
  openTabIds,
  activeFileId,
}), [
  currentProjectName, openTabs, tickMs, states, junctions, transitions, layers, variables,
  safetyMode, hilConfig, view, blocks, relationships, parts, connectors,
  interfaceRealizations, customStereotypes, hmiComponents, vlabNodes, vlabEdges,
  globalXBridgesNodes, globalXBridgesEdges, headers, data, activeModel, taguchiConfig,
  results, managedWindows, entropyNodes, entropyEdges, workspaceFiles, activeFileId,
  openTabIds, saveCurrentFileState,
]);
```

The Export Modules unified branch stores this payload under `adia_project_unified.json`; other module names stay unchanged.

- [ ] **Step 4: Add Save and Save As handlers**

Add a clean snapshot ref initialized after mount and update it only after successful saves:

```ts
const cleanProjectSnapshotRef = useRef<string | null>(null);

useEffect(() => {
  if (cleanProjectSnapshotRef.current === null) {
    cleanProjectSnapshotRef.current = createProjectSnapshot(buildUnifiedProjectPayload());
  }
}, [buildUnifiedProjectPayload]);

const saveUnifiedProject = useCallback(async (saveAs: boolean) => {
  const payload = buildUnifiedProjectPayload();
  const electron = (window as any).electronAPI;
  if (!electron) {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentProjectName || 'adia_project'}.adia`;
    anchor.click();
    URL.revokeObjectURL(url);
    cleanProjectSnapshotRef.current = createProjectSnapshot(payload);
    return;
  }
  const result = await electron.invoke(saveAs ? 'project-save-as' : 'project-save', payload);
  if (result.status === 'saved') {
    cleanProjectSnapshotRef.current = createProjectSnapshot(payload);
    addError('info', `Project saved to ${result.filePath}`);
  } else if (result.status === 'error') {
    addError('error', result.message);
  }
}, [addError, buildUnifiedProjectPayload, currentProjectName]);
```

Expose `handleSaveProject = () => saveUnifiedProject(false)` and `handleSaveProjectAs = () => saveUnifiedProject(true)`.

- [ ] **Step 5: Add one validated open path and token acknowledgement**

Create `pendingAcceptedOpen` state holding `{ token, payload } | null`. `acceptOpenedProject` performs these operations in order:

1. Return on `cancelled`.
2. Display `result.message` on `error`.
3. Compare `buildUnifiedProjectPayload()` with `cleanProjectSnapshotRef.current` and call `window.confirm('Open this project and discard unsaved changes?')` only when dirty.
4. Run `validateImportedJson(result.data)` and preserve current state on failure.
5. Call `hydrateProject(validation.sanitizedData || result.data)`.
6. Store the accepted token for a post-hydration effect.

The post-hydration effect must use the newly rendered `buildUnifiedProjectPayload` callback:

```ts
useEffect(() => {
  if (!pendingAcceptedOpen) return;
  const payload = buildUnifiedProjectPayload();
  cleanProjectSnapshotRef.current = createProjectSnapshot(payload);
  if (pendingAcceptedOpen.token) {
    (window as any).electronAPI?.invoke('project-accept-open', { token: pendingAcceptedOpen.token });
  }
  setPendingAcceptedOpen(null);
}, [pendingAcceptedOpen, buildUnifiedProjectPayload]);
```

Both `handleImportProject` and the `project-open-requested` listener call `acceptOpenedProject`. The hidden browser input accepts `.adia,.json` and follows the same validation function without a token.

- [ ] **Step 6: Rewire commands without changing module export behavior**

- Global `Ctrl+S` calls `handleSaveProject`.
- Add toolbar buttons labeled **Save** and **Save As**.
- Keep the existing selection modal behind a button labeled **Export Modules**.
- Rename the unified import button to **Open** and route it to `project-open-dialog` in Electron.
- Keep browser/mobile fallback through the hidden input.
- Do not change DOE, report, generated-code, CSV, PDF, Word, or 3DEXPERIENCE export extensions.

- [ ] **Step 7: Run focused tests and compile**

Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts src/utils/jsonImportValidator.test.ts`

Expected: all persistence and import-validator tests PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0 with no hook dependency or type errors.

- [ ] **Step 8: Commit renderer integration**

```powershell
git add -- src/App.tsx src/utils/adiaProjectPersistence.test.ts src/utils/adiaProjectPersistence.ts
git commit -m "feat: save and open unified ADIA project files"
```

---

### Task 7: Installer Metadata and End-to-End Verification

**Files:**
- Modify: `package.json`
- Modify: `forge.config.cjs`
- Verify: `dist-electron/index.cjs`
- Verify: `out/make/squirrel.windows/x64/ADIA Setup.exe`

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: a Windows Squirrel installer that registers `.adia` during installation and removes only its owned mapping during uninstall.

- [ ] **Step 1: Add stable Windows product metadata**

Set these package fields:

```json
{
  "name": "adia",
  "productName": "ADIA",
  "description": "ADIA Engineering Suite"
}
```

In the Squirrel maker config, retain `name: 'adia'` and add:

```js
setupExe: 'ADIA Setup.exe',
exe: 'ADIA.exe',
```

Set `packagerConfig.executableName` to `ADIA`. Keep the existing signing placeholders and makers unchanged.

- [ ] **Step 2: Run all focused automated checks**

Run: `npm run test:project-files`

Expected: all project file, association, lifecycle, and controller assertions PASS.

Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts src/utils/jsonImportValidator.test.ts`

Expected: all selected Vitest tests PASS.

Run: `npm run test:security`

Expected: all existing security suites PASS.

- [ ] **Step 3: Run compile and protected production build**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run build`

Expected: Vite and protected Electron build exit 0; the protected loader names `bootstrap.cjs` as its development fallback.

- [ ] **Step 4: Build the Windows installer**

Run: `npx electron-forge make --platform win32 --arch x64`

Expected: exit code 0 and a Squirrel setup executable under `out/make/squirrel.windows/x64`.

- [ ] **Step 5: Perform Windows acceptance checks in a disposable user profile**

Run these checks in order and record results in the task handoff:

1. Install `ADIA Setup.exe` without elevation.
2. Run `reg.exe query HKCU\Software\Classes\.adia /ve` and verify `ADIA.Project`.
3. Run `reg.exe query HKCU\Software\Classes\ADIA.Project\shell\open\command /ve` and verify the installed ADIA executable plus `"%1"`.
4. Save `Pump.adia`, close ADIA, and double-click the file; verify Pump loads.
5. Modify Pump without saving, double-click another `.adia`, decline, and verify Pump remains active.
6. Double-click again, accept, and verify the same ADIA window loads the second project.
7. Install an updated build and verify the command points to the updated executable.
8. Change `.adia` to `Other.App`, uninstall ADIA, and verify `Other.App` remains.
9. Reinstall ADIA, leave it as owner, uninstall, and verify ADIA-owned keys are removed.

- [ ] **Step 6: Commit packaging metadata**

```powershell
git add -- package.json forge.config.cjs
git commit -m "build: package native ADIA file association"
```

- [ ] **Step 7: Review the complete diff**

Run: `git status --short`

Expected: only pre-existing unrelated user changes and intentionally untracked build artifacts remain.

Run: `git diff HEAD~7 --check`

Expected: no whitespace errors in the feature commits.

Run: `git log -7 --oneline`

Expected: one focused commit per task boundary, with no unrelated files included.
