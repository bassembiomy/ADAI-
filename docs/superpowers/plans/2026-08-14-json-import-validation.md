# JSON Import Validation & Crash Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intercept all JSON file imports across ADIA to validate file integrity and schema before state hydration, showing a clear error modal and refusing malformed files to prevent application crashes.

**Architecture:** A standalone validation module (`src/utils/jsonImportValidator.ts`) performs multi-stage pre-flight checks (Syntax, Root Object, Format Classification, Array & Node Integrity). `App.tsx` integrates this validator at all import entry points (`handleProjectFileChange`, `handleImportProject`, `handleFileChange`) and presents a styled error modal when a file is refused.

**Tech Stack:** TypeScript, React, Vitest / Jest (for unit testing).

## Global Constraints
- Must not break existing valid ADIA project `.json` imports.
- Must refuse any JSON payload that is null, primitive, array-root, or contains corrupted non-array states/blocks/nodes or NaN positions.
- Error modal must display clear diagnostic details about why the file was refused.

---

### Task 1: Pre-Flight Validation Engine (`src/utils/jsonImportValidator.ts`)

**Files:**
- Create: `src/utils/jsonImportValidator.ts`
- Create: `src/utils/jsonImportValidator.test.ts`

**Interfaces:**
- Consumes: Raw parsed JSON payload (`unknown`).
- Produces: `validateImportedJson(data: unknown): ValidationResult`

- [ ] **Step 1: Write failing unit tests for `jsonImportValidator`**

Create `src/utils/jsonImportValidator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateImportedJson } from './jsonImportValidator';

describe('jsonImportValidator', () => {
  it('rejects non-object primitives and null', () => {
    expect(validateImportedJson(null).isValid).toBe(false);
    expect(validateImportedJson("hello").isValid).toBe(false);
    expect(validateImportedJson(123).isValid).toBe(false);
    expect(validateImportedJson([]).isValid).toBe(false);
  });

  it('rejects objects with non-array mandatory collections', () => {
    const badData = { states: "not-an-array" };
    const res = validateImportedJson(badData);
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain("Field 'states' must be an array (found string).");
  });

  it('rejects nodes with invalid positions (NaN/Infinity)', () => {
    const badData = {
      states: [
        { id: 's1', position: { x: NaN, y: 100 } }
      ]
    };
    const res = validateImportedJson(badData);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('position'))).toBe(true);
  });

  it('accepts valid ADIA project payload', () => {
    const validProject = {
      projectName: 'Test Project',
      states: [{ id: 's1', name: 'State1', position: { x: 10, y: 20 } }],
      workspaceFiles: []
    };
    const res = validateImportedJson(validProject);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('accepts valid module asset payload', () => {
    const validModule = {
      vlabNodes: [{ id: 'n1', type: 'resistor', x: 50, y: 50 }],
      vlabEdges: []
    };
    const res = validateImportedJson(validModule);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe('vlab');
  });
});
```

- [ ] **Step 2: Run unit test to verify failure**

Run: `npx vitest run src/utils/jsonImportValidator.test.ts`
Expected: FAIL (Cannot find module `./jsonImportValidator`)

- [ ] **Step 3: Implement `jsonImportValidator.ts`**

Create `src/utils/jsonImportValidator.ts`:
```ts
export interface ValidationResult {
  isValid: boolean;
  errorTitle?: string;
  errors: string[];
  detectedType?: string;
  sanitizedData?: any;
}

export function validateImportedJson(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (data === null || data === undefined) {
    return {
      isValid: false,
      errorTitle: 'Empty JSON File',
      errors: ['The selected file is empty or null.']
    };
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    return {
      isValid: false,
      errorTitle: 'Invalid Root Structure',
      errors: [`JSON root must be an Object '{}' (found ${Array.isArray(data) ? 'Array' : typeof data}).`]
    };
  }

  const obj = data as Record<string, any>;

  // Check array properties
  const arrayFields = [
    'states', 'junctions', 'transitions', 'layers', 'variables',
    'blocks', 'relationships', 'parts', 'connectors', 'interfaceRealizations',
    'hmiComponents', 'vlabNodes', 'vlabEdges', 'globalXBridgesNodes',
    'globalXBridgesEdges', 'entropyNodes', 'entropyEdges', 'workspaceFiles', 'openTabs'
  ];

  for (const field of arrayFields) {
    if (field in obj && obj[field] !== undefined && !Array.isArray(obj[field])) {
      errors.push(`Field '${field}' must be an array (found ${typeof obj[field]}).`);
    }
  }

  // Validate Node Entities if arrays exist
  if (Array.isArray(obj.states)) {
    obj.states.forEach((st: any, idx: number) => {
      if (!st || typeof st !== 'object') {
        errors.push(`states[${idx}] must be a valid object.`);
      } else if (!st.id || typeof st.id !== 'string' && typeof st.id !== 'number') {
        errors.push(`states[${idx}] missing required string/number 'id'.`);
      }
    });
  }

  if (Array.isArray(obj.blocks)) {
    obj.blocks.forEach((blk: any, idx: number) => {
      if (!blk || typeof blk !== 'object') {
        errors.push(`blocks[${idx}] must be a valid object.`);
      } else if (!blk.id) {
        errors.push(`blocks[${idx}] missing required 'id'.`);
      }
    });
  }

  if (Array.isArray(obj.vlabNodes)) {
    obj.vlabNodes.forEach((nd: any, idx: number) => {
      if (!nd || typeof nd !== 'object') {
        errors.push(`vlabNodes[${idx}] must be a valid object.`);
      } else if (nd.x !== undefined && (!Number.isFinite(nd.x) || Number.isNaN(nd.x))) {
        errors.push(`vlabNodes[${idx}] contains invalid coordinate 'x'.`);
      }
    });
  }

  // Detect Type
  let detectedType = 'project';
  if (obj.globalXBridgesNodes || obj.globalXBridgesEdges) detectedType = 'xbridges';
  else if (obj.vlabNodes || obj.vlabEdges) detectedType = 'vlab';
  else if (obj.states || obj.junctions || obj.transitions) detectedType = 'statemachine';
  else if (obj.entropyNodes || obj.entropyEdges) detectedType = 'entropy';
  else if (obj.hmiComponents) detectedType = 'hmi';
  else if (obj.headers || obj.activeModel) detectedType = 'doe';
  else if (obj.target || obj.clockSpeed) detectedType = 'hil';
  else if (obj.parts || obj.connectors) detectedType = 'ibd';
  else if (obj.blocks) {
    const hasReq = obj.blocks.some((b: any) => b && b.stereotype === 'requirement');
    detectedType = hasReq ? 'requirements' : 'bdd';
  }

  // Final check: if no recognizeable keys at all
  const hasRecognizedKeys = Boolean(
    obj.projectName || obj.workspaceFiles || obj.openTabs ||
    arrayFields.some(f => f in obj) || obj.doe || obj.hilConfig
  );

  if (!hasRecognizedKeys) {
    errors.push('Unrecognized File Format: JSON file does not contain valid ADIA project or module structures.');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errorTitle: 'Corrupted File Structure',
      errors,
      detectedType
    };
  }

  return {
    isValid: true,
    detectedType,
    sanitizedData: obj
  };
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `npx vitest run src/utils/jsonImportValidator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit task 1**

```bash
git add src/utils/jsonImportValidator.ts src/utils/jsonImportValidator.test.ts
git commit -m "feat: add JSON pre-flight import validation engine and unit tests"
```

---

### Task 2: Integration in `App.tsx` & Refusal UI Error Modal

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add error state and ImportValidationErrorModal to `App.tsx`**

In `App.tsx`:
Import `validateImportedJson` and `ValidationResult` from `./utils/jsonImportValidator`.

Add state in `App.tsx`:
```tsx
const [importValidationError, setImportValidationError] = useState<ValidationResult | null>(null);
```

Add rendering for `ImportValidationErrorModal`:
```tsx
{importValidationError && (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-200" onMouseDown={() => setImportValidationError(null)}>
    <div className="bg-[#121212] border-2 border-red-500/80 rounded-2xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
      <div className="px-6 py-4 bg-red-950/40 border-b border-red-500/30 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h2 className="text-base font-bold text-red-400 uppercase tracking-wider">{importValidationError.errorTitle || 'Import Failed: Invalid File'}</h2>
            <p className="text-xs text-slate-400">File import refused to prevent application crash</p>
          </div>
        </div>
        <button onClick={() => setImportValidationError(null)} className="text-slate-400 hover:text-white text-lg">✕</button>
      </div>

      <div className="p-6 overflow-y-auto space-y-3 font-mono text-xs">
        <p className="text-slate-300 font-sans text-sm">The selected JSON file contains structural errors and cannot be imported:</p>
        <div className="bg-[#080808] border border-red-900/40 p-4 rounded-xl space-y-2 text-red-300 max-h-60 overflow-y-auto no-scrollbar">
          {importValidationError.errors.map((err, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-red-500 font-bold">•</span>
              <span>{err}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 bg-[#181818] border-t border-[#222] flex justify-end">
        <button
          onClick={() => setImportValidationError(null)}
          className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
        >
          Dismiss & Refuse File
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Update `handleProjectFileChange` in `App.tsx`**

Modify `handleProjectFileChange` around line 10623:
```tsx
const handleProjectFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const rawText = event.target?.result as string;
      const importedData = JSON.parse(rawText);
      const validation = validateImportedJson(importedData);
      
      if (!validation.isValid) {
        setImportValidationError(validation);
        return;
      }
      
      hydrateProject(validation.sanitizedData || importedData);
    } catch (error) {
      setImportValidationError({
        isValid: false,
        errorTitle: 'JSON Syntax Error',
        errors: [`Failed to parse JSON file: ${error instanceof Error ? error.message : 'Invalid JSON format'}`]
      });
    }
  };
  reader.readAsText(file);
  if (projectImportRef.current) projectImportRef.current.value = '';
}, [hydrateProject]);
```

- [ ] **Step 3: Update `handleFileChange` in Workspace Asset Manager modal (`App.tsx`)**

Modify `handleFileChange` around line 4198:
```tsx
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  setImportFileName(file.name.replace(/\.[^/.]+$/, ""));
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const json = JSON.parse(evt.target?.result as string);
      const validation = validateImportedJson(json);
      
      if (!validation.isValid) {
        setImportValidationError(validation);
        setImportedJson(null);
        return;
      }
      
      setImportedJson(validation.sanitizedData || json);
      if (validation.detectedType) {
        setDetectedType(validation.detectedType);
      }
    } catch (err) {
      setImportValidationError({
        isValid: false,
        errorTitle: 'JSON Syntax Error',
        errors: [`Failed to parse JSON file: ${err instanceof Error ? err.message : 'Invalid JSON format'}`]
      });
      setImportedJson(null);
    }
  };
  reader.readAsText(file);
};
```

- [ ] **Step 4: Update `handleImportProject` (Electron IPC) in `App.tsx`**

Modify `handleImportProject` around line 10639:
```tsx
const handleImportProject = useCallback(async () => {
  try {
    if ((window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      const importedData = await ipcRenderer.invoke('import-json');
      if (importedData) {
        const validation = validateImportedJson(importedData);
        if (!validation.isValid) {
          setImportValidationError(validation);
          return;
        }
        hydrateProject(validation.sanitizedData || importedData);
      } else {
        addError('info', 'Import cancelled or file could not be read.');
      }
    } else {
      projectImportRef.current?.click();
    }
  } catch (error) {
    console.error('Import failed:', error);
    addError('error', `Failed to import project: ${error instanceof Error ? error.message : 'Unknown error'}. Tip: Ensure the file is a valid ADIA project JSON file.`);
  }
}, [addError, hydrateProject]);
```

- [ ] **Step 5: Run tests and type check to verify build success**

Run: `npx tsc --noEmit` and `npx vitest run src/utils/jsonImportValidator.test.ts`
Expected: 0 errors, tests PASS

- [ ] **Step 6: Commit Task 2**

```bash
git add src/App.tsx
git commit -m "feat: integrate JSON validation guard and error modal popup into App import handlers"
```

---
