# Design Spec: Robust JSON Import Validation & Crash Prevention Guard

**Date**: 2026-08-14  
**Topic**: Comprehensive JSON File Validation for ADIA Project & Module Imports  

---

## 1. Executive Summary
When users import external JSON files into ADIA (via project import, workspace asset file import, or Electron IPC file opening), corrupted, malformed, or invalid JSON structures can cause unhandled runtime exceptions, breaking React component renders and crashing the entire application.

This specification details a pre-flight JSON validation engine (`src/utils/jsonImportValidator.ts`) and an Error UI Popup. Every imported JSON file will be rigorously checked prior to state hydration. Files that fail validation will be safely refused with detailed diagnostic error feedback, leaving the user's current project state completely untouched.

---

## 2. Architecture & System Flow

```
   [ External JSON File ]
             │
             ▼
    [ Parse & Pre-flight ] ──(Invalid JSON Syntax)──► [ Show Validation Error Popup ]
             │                                                  ▲
             ▼                                                  │
    [ Structural Validator ] ──(Schema / Entity Corruption)─────┘
   (jsonImportValidator.ts)
             │
             ▼ (Validation Passed)
   ┌──────────────────────────┐
   │ Safe State Hydration     │
   │ (hydrateProject /        │
   │  onImportFile)           │
   └──────────────────────────┘
```

### Integration Touchpoints
1. **Full Project Web Import** (`App.tsx` -> `handleProjectFileChange`)
2. **Full Project Electron IPC Import** (`App.tsx` -> `handleImportProject`)
3. **Workspace Module Asset Import** (`App.tsx` -> `handleFileChange` in Asset Manager)
4. **Drag & Drop / Direct Paste** (if applicable across workspace panels)

---

## 3. Validation Rules & Validation Pipeline

The `jsonImportValidator` will execute a 4-stage pre-flight check on all incoming JSON payloads:

### Stage 1: Syntax & Envelope Check
- Rejects `null`, `undefined`, empty string, array root (`[]`), or primitive values (`string`, `number`, `boolean`).
- Input MUST be a non-null JavaScript Object (`typeof data === 'object' && !Array.isArray(data)`).

### Stage 2: Format Classification
Classifies incoming JSON into one of two valid categories:
1. **ADIA Unified Project File**: Contains project metadata or arrays such as `projectName`, `workspaceFiles`, `states`, `blocks`, `vlabNodes`, `globalXBridgesNodes`, `hmiComponents`, etc.
2. **ADIA Workspace Module Asset**: Contains specific module keys (`xbridges`, `vlab`, `statemachine`, `sysml`/`bdd`/`requirements`, `entropy`, `hmi`, `doe`, `hil`, `ibd`).

*Rule*: If the payload matches neither category (e.g. arbitrary random JSON format), it is rejected with:  
`"Unrecognized File Format: The JSON file does not contain recognized ADIA project or module structures."`

### Stage 3: Entity & Array Integrity Verification
Verifies that properties expected to be arrays by React renderers are strictly arrays:
- `states`, `junctions`, `transitions`, `blocks`, `relationships`, `parts`, `connectors`, `vlabNodes`, `vlabEdges`, `globalXBridgesNodes`, `globalXBridgesEdges`, `entropyNodes`, `entropyEdges`, `hmiComponents`, `workspaceFiles`, `openTabs`.

If any of these fields are present but NOT arrays (e.g., `states: "corrupted"` or `blocks: {}`), validation fails immediately.

Node Integrity Checks:
- `id`: Every node/state/block in an array must have a valid string or numeric `id`.
- `position` / `coords`: If coordinates exist, `x` and `y` must be finite numbers (reject `NaN`, `null`, `Infinity`, `undefined`).

### Stage 4: Render Crash Prevention Checks
Detects data patterns known to break React diagram viewports:
- Cyclic references or self-referential graph loops that trigger infinite loops in solvers.
- Missing required nested objects (e.g. `doe.headers` when `doe` is present).

---

## 4. Diagnostic Error UI & Refusal Logic

When validation fails:
1. **Import Cancellation**: State hydration function (`hydrateProject` or `onImportFile`) is NOT called.
2. **FileInput Reset**: `fileInputRef.current.value = ''` to allow selecting a corrected file.
3. **Error Modal Display**: Render a prominent error modal/popup containing:
   - Header: ⚠️ **Import Refused: Invalid JSON File**
   - Summary: Explanation of why the file was rejected to prevent app crashes.
   - Bullets: List of specific issues found (e.g., `• Field 'states' must be an array (found string)`, `• Block at index 3 missing required 'id' property`).
   - Action Button: "Dismiss & Keep Workspace Intact".

---

## 5. Testing & Verification Plan

### Unit Tests (`src/utils/jsonImportValidator.test.ts`)
- Test invalid JSON string syntax handling.
- Test primitive/array root object rejection.
- Test rejection of corrupted node/edge structures (`states` as string, `position.x = NaN`, missing `id`).
- Test successful validation and type detection for valid project JSON and valid module asset JSON files.

### End-to-End Verification
- Attempt importing a corrupted JSON file in the UI; verify error popup displays and application state remains stable without crashing.
- Attempt importing a valid project JSON file; verify hydration completes smoothly.
