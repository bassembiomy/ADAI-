# ADIA Windows `.adia` File Association Auto-Registration Design

## Overview
When users double-click a `.adia` file in Windows File Explorer, Windows should automatically launch or focus the ADIA application and load the selected project. This document specifies the design for auto-registering the `.adia` file association on application startup in Windows, providing a standalone CLI script to register associations on demand, and ensuring seamless single-instance project hydration.

## Goals & Requirements
1. **Double-click to Open**: Double-clicking any `.adia` file in Windows automatically opens ADIA and loads the project.
2. **Auto-Registration on App Startup**: On Windows (`process.platform === 'win32'`), ADIA ensures its association in `HKCU\Software\Classes` is registered on startup so that portable or development executions stay associated without requiring a reinstallation.
3. **Dedicated Registration CLI Script**: Provide `npm run register-associations` to allow developers/users to register or update the `.adia` association in the Windows Registry directly from the terminal.
4. **Non-Admin Execution**: All registry operations target `HKCU\Software\Classes` (`HKEY_CURRENT_USER`), which requires no administrator elevation and avoids UAC prompts.
5. **Single-Instance Handling**:
   - If ADIA is not running, launch ADIA and load the project upon window readiness.
   - If ADIA is already running, focus the existing window and load the project into the existing session without launching duplicate processes.

## Architecture & Components

### 1. Registry Keys & Association Schema
Under `HKCU\Software\Classes`:
- Key: `HKCU\Software\Classes\.adia`
  - `(Default)`: `ADIA.Project`
- Key: `HKCU\Software\Classes\ADIA.Project`
  - `(Default)`: `ADIA Project File`
- Key: `HKCU\Software\Classes\ADIA.Project\DefaultIcon`
  - `(Default)`: `"<execPath>",0`
- Key: `HKCU\Software\Classes\ADIA.Project\shell\open\command`
  - `(Default)`: `"<execPath>" "%1"`

### 2. Startup Auto-Registration
In `src/main.cjs`:
- Inside `app.whenReady()`, if `process.platform === 'win32'` and `app.isPackaged` (or in dev with resolved executable), invoke `registerAdiaAssociation(process.execPath)` non-blockingly.
- Errors are logged safely without interrupting the user or app startup.

### 3. CLI Script: `scripts/register_file_association.cjs`
- Resolves executable path (either built executable or Electron development binary).
- Calls `registerAdiaAssociation(execPath)`.
- Logs confirmation to console.
- Registered in `package.json` under `"scripts"`: `"register-associations": "node scripts/register_file_association.cjs"`.

### 4. Single-Instance & Parameter Passing
- When opened via File Explorer: Windows invokes `"<execPath>" "<filePath.adia>"`.
- `src/main.cjs` extracts the file path using `extractAdiaPath(process.argv)`.
- If ADIA is already running: `app.on('second-instance')` extracts the path and calls `projectFiles.openExternal(requestedPath, win)`.
- The renderer receives the project data over the secure IPC handshake and loads the project into the workspace.

## Error Handling & Edge Cases
- **Registry Execution Failures**: If `reg.exe` fails, it is caught and logged; the app continues normal operation.
- **Corrupted / Invalid Files**: Files are validated before hydration via `validateImportedJson` and bounded by `MAX_PROJECT_BYTES` (50MB).
- **Dirty State**: If unsaved changes exist in the active session when a `.adia` file is opened externally, the user is prompted to confirm before replacing the active project.

## Verification
1. Run `npm run register-associations` and verify Windows Registry keys exist under `HKCU\Software\Classes\.adia` and `HKCU\Software\Classes\ADIA.Project`.
2. Run automated test suite: `npm run test:project-files`.
3. Create a test `.adia` file, double-click it in Windows Explorer, and verify ADIA opens and loads the file automatically.
