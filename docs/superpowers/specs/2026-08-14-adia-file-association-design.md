# Design Spec: Native `.adia` Project Files and Windows Association

**Date:** 2026-08-14

**Status:** Approved for implementation planning

**Scope:** Unified ADIA project persistence and Windows Squirrel installation

## 1. Goal

ADIA will save unified projects as `.adia` files and register that extension during Windows installation. A user can double-click an `.adia` file to open it directly in ADIA without changing Windows settings manually.

The first release targets Windows only. Individual module exports such as `xbridges.json`, `vlab.json`, and `statemachine.json` remain JSON files.

## 2. User Experience

- A new unified project is saved as `ProjectName.adia`.
- The first **Save** or `Ctrl+S` opens a Save dialog. Later saves overwrite the remembered file.
- **Save As** selects a different path and remembers it after a successful write.
- The Save dialog appends `.adia` when the user omits the extension and replaces an incorrect final extension rather than creating names such as `project.json.adia`.
- The existing module-selection flow remains available as an **Export Modules** action and continues producing `.json` files.
- **Open** accepts `.adia` files. Legacy unified `.json` projects remain importable through the existing import path for backward compatibility.
- Double-clicking an `.adia` file starts ADIA and opens that project. If ADIA is already running, its existing window is focused and receives the file.
- If replacing the current project would discard unsaved work, ADIA asks for confirmation first.

## 3. File Format

An `.adia` file is UTF-8 JSON containing the same unified project envelope ADIA currently exports. The custom extension identifies ownership and enables Windows shell integration; it does not introduce a new binary format.

The payload continues to include the current project version, timestamp, project name, workspace state, diagram models, HMI, HIL, DOE, managed windows, and open-file metadata. All opened payloads pass through the existing `validateImportedJson` guard before hydration.

## 4. Architecture

### 4.1 Renderer project serializer

The renderer will expose one function that creates the canonical unified project payload. Save, Save As, module export's unified option, and dirty-state comparison will use this serializer so their project envelopes cannot drift apart.

After a successful save or open, the renderer records a clean serialized snapshot. Before an externally opened file replaces the active project, it compares the current canonical serialization with that clean snapshot. A difference means the project has unsaved changes.

### 4.2 Main-process project-file service

A focused CommonJS service will own filesystem-facing project operations:

- recognize and normalize `.adia` paths;
- enforce the 50 MB open limit;
- read and parse UTF-8 JSON;
- save through a temporary sibling file and replace the destination;
- remove a temporary file after a failed write;
- track the active project path for Save versus Save As; and
- extract candidate `.adia` paths from Windows process arguments.

The service returns structured results that distinguish success, cancellation, validation/read failure, and write failure. A cancelled dialog never changes the active path.

### 4.3 Secure IPC bridge

The preload allowlist will add only the channels required for:

- `project-open-dialog`;
- `project-save`;
- `project-save-as`; and
- `project-accept-open`; and
- the main-to-renderer `project-open-requested` event.

The renderer never receives direct filesystem access. The main process validates the path and reads the file, then sends the parsed payload, normalized path, and an opaque request token. The renderer runs structural validation before calling `hydrateProject`, then invokes `project-accept-open` with that token. Only this acknowledgement changes the main process's active project path; declined, stale, or invalid tokens do nothing.

### 4.4 Single-instance file opening

The main process acquires Electron's single-instance lock before creating a window.

- On cold start, it scans the packaged application's arguments for one `.adia` path and queues it until the renderer is ready.
- On `second-instance`, it extracts the file path, restores and focuses the existing window, and sends the open request.
- Non-file arguments and Squirrel lifecycle switches are ignored.
- Only an existing regular file whose final extension is `.adia` is accepted by the shell-open path.

If the renderer declines because of unsaved work, the active path and current project stay unchanged.

## 5. Windows Installer Association

The existing Electron Forge Squirrel maker remains in place. A custom Squirrel lifecycle handler runs before normal application startup and handles install, update, uninstall, and obsolete-version events.

On `--squirrel-install` and `--squirrel-updated`, ADIA creates or refreshes these per-user entries:

```text
HKCU\Software\Classes\.adia                         = ADIA.Project
HKCU\Software\Classes\ADIA.Project                 = ADIA Project
HKCU\Software\Classes\ADIA.Project\DefaultIcon     = "<adia.exe>",0
HKCU\Software\Classes\ADIA.Project\shell\open\command
                                                       = "<adia.exe>" "%1"
```

Registration uses `reg.exe` through argument arrays, never a shell-composed command. The executable and file placeholders are quoted in the registry command value. Per-user `HKCU` registration matches Squirrel's non-admin installation model.

The install/update handler also preserves Squirrel shortcut creation. It quits promptly after lifecycle work and does not create the main window or initialize toolchains.

On `--squirrel-uninstall`, ADIA removes the ProgID and extension mapping only when the current mapping is still owned by `ADIA.Project`. If another application or the user has changed the association, ADIA leaves that choice intact. Registry registration failure is logged and does not make installation fail.

The packaged application sets a stable Windows App User Model ID. The association uses the application executable as its icon, avoiding a second icon asset solely for project files.

## 6. Open and Save Flows

### First Save

1. The renderer builds the canonical unified payload.
2. The main process shows a dialog filtered to `ADIA Project (*.adia)`.
3. The selected path is normalized to `.adia`.
4. The service writes a temporary sibling file and replaces the destination.
5. On success, the main process remembers the path and the renderer records a clean snapshot.

### Repeated Save

1. The renderer builds the current payload.
2. The main process writes to the remembered path without showing a dialog.
3. On failure, the remembered path is retained and the project remains dirty.

### Save As

Save As follows First Save and changes the remembered path only after the replacement succeeds.

### File Open

1. A picker, startup argument, or second-instance argument identifies the file.
2. The main process verifies extension, file type, size, readability, and JSON syntax.
3. The renderer checks for unsaved work and requests confirmation if necessary.
4. The existing import validator approves the parsed structure.
5. Only then does the renderer hydrate the project and mark the opened snapshot clean.

## 7. Failure Handling

- Missing, non-file, oversized, unreadable, malformed, or structurally invalid files show a specific error and leave the active project untouched.
- A rejected unsaved-work confirmation leaves both project state and active path unchanged.
- Failed saves do not mark the project clean or silently fall back to browser downloads.
- Temporary save artifacts are cleaned up after errors where possible.
- Registry failures are diagnostic installer events, not fatal application failures.
- Uninstall cleanup never deletes a foreign ProgID or a reassigned `.adia` mapping.

## 8. Compatibility and Scope Boundaries

- `.adia` is used only for unified projects in this release.
- Module exports and third-party document exports keep their current extensions.
- Existing unified JSON files remain importable; ADIA does not rename user files automatically.
- Windows Squirrel installers receive association support. ZIP builds do not modify the registry because they have no installation lifecycle.
- Linux and macOS association metadata is outside this release.
- Autosave, project recovery journals, recent-file menus, and multi-window project opening are outside this release.

## 9. Testing and Verification

### Automated tests

- Path normalization appends `.adia`, handles case-insensitive `.ADIA`, and replaces incorrect final extensions.
- Argument extraction accepts quoted paths and ignores Squirrel switches and unrelated arguments.
- Open rejects missing, directory, oversized, malformed, and non-`.adia` shell files.
- Atomic-save tests cover success, replacement, write failure, and temporary-file cleanup.
- Save state tests cover first Save, repeated Save, Save As, cancellation, and failed replacement.
- Registry tests cover install/update values, fixed argument arrays, owned cleanup, and preservation of reassigned associations.
- Renderer tests cover canonical serialization, clean-snapshot updates, invalid-file refusal, and unsaved-work confirmation.
- IPC tests verify the new channels are narrowly allowlisted.

### Windows acceptance checks

1. Build and install the Squirrel `Setup.exe` on a clean Windows user profile.
2. Confirm `.adia` displays the ADIA association and application icon.
3. Double-click a valid file with ADIA closed and verify it opens.
4. Double-click another file with ADIA running and verify the existing window is focused and updated after confirmation when needed.
5. Verify invalid and oversized files leave the open project intact.
6. Upgrade ADIA and verify the association points to the updated executable.
7. Reassign `.adia`, uninstall ADIA, and verify the user's reassignment is preserved.
8. Install again, leave ADIA as owner, uninstall, and verify ADIA-owned association entries are removed.

### Build gates

- Run the focused unit and integration test suites.
- Run TypeScript compilation and the existing project build.
- Run the protected Electron build.
- Run `electron-forge make` and inspect the generated Squirrel installer.

## 10. Acceptance Criteria

The feature is complete when a Windows Squirrel installation associates `.adia` with ADIA without administrator or manual user configuration; Save and Save As enforce `.adia`; repeat Save reuses the active path; double-click works with the app closed or running; all incoming payloads are validated before hydration; failures preserve current work; upgrades refresh the association; and uninstall removes only ADIA-owned registry entries.
