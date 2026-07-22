# State Validation Error Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show syntax and logical validation errors inside the State Properties Panel, and highlight invalid inputs (Entry, During, Exit, Internal Transitions, and State Name) with red borders.

**Architecture:** Use an Immediately Invoked Function Expression (IIFE) inside the `selectedState` block of the properties panel in `App.tsx` to derive state-specific error flags from the global `errors` list. Conditionally append red border CSS classes to the relevant inputs.

**Tech Stack:** React (TypeScript), Tailwind CSS.

## Global Constraints
- Do not modify backend/MCAL generator layers.
- Rely only on existing validation error messages from `performValidation`.
- Follow the existing styling system (Tailwind).

---

### Task 1: Integrate IIFE and Error Banner in State Properties Panel

**Files:**
- Modify: `src/App.tsx:16711-16720`

**Interfaces:**
- Consumes: `errors` (array of ErrorItem from state), `selectedState` (StateData)
- Produces: derived validation flags and top error list banner in State properties panel

- [ ] **Step 1: Write derived flags and top error display block**
  Modify the `selectedState ? (` block to wrap its content in an IIFE. Define the state-specific error flags and display the list of errors.
  
  Code change to make:
  ```typescript
  {selectedState ? (() => {
    const stateErrors = errors.filter(e => e.elementId === selectedState.id && e.source === 'Validation');
    const hasEntryError = stateErrors.some(e => e.message.includes('Entry'));
    const hasDuringError = stateErrors.some(e => e.message.includes('During'));
    const hasExitError = stateErrors.some(e => e.message.includes('Exit'));
    const hasInternalError = stateErrors.some(e => e.message.includes('Internal Transition') || e.message.includes('Internal transition'));
    const hasNameError = stateErrors.some(e => e.message.includes('spaces') || e.message.includes('Duplicate'));
    
    return (
      <>
        <div>
          <Label>State Name</Label>
          <Input
            value={selectedState.name}
            onChange={(e) => updateState(selectedState.id, { name: e.target.value })}
            className={`mt-1 ${hasNameError ? 'border-red-500 ring-red-500 focus-visible:ring-red-500' : ''}`}
          />
        </div>

        {stateErrors.map(err => (
          <div key={err.id} className={`p-3 rounded-lg border text-xs mb-3 ${err.type === 'error' ? 'bg-red-950/20 border-red-900/50 text-red-300' : 'bg-amber-950/20 border-amber-900/50 text-amber-300'}`}>
            <div className="font-semibold flex items-center gap-1.5 mb-1">
              {err.type === 'error' ? (
                <span className="text-red-400">🔴 Error</span>
              ) : (
                <span className="text-amber-400">⚠️ Warning</span>
              )}
            </div>
            <p className="mb-2 leading-relaxed whitespace-pre-line">{err.message}</p>
            {err.canAutoFix && (
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAutoFix(err)}
                  className="bg-green-600/15 hover:bg-green-600/30 text-green-300 border-green-600/30 text-[10px] h-7 px-2.5"
                >
                  Auto-Fix
                </Button>
              </div>
            )}
          </div>
        ))}
  ```

- [ ] **Step 2: Commit Task 1**
  ```bash
  git add src/App.tsx
  git commit -m "feat: show validation errors at the top of the state properties panel"
  ```

---

### Task 2: Highlight Action and Internal Transition Textareas

**Files:**
- Modify: `src/App.tsx:16940-17070`

**Interfaces:**
- Consumes: `hasEntryError`, `hasDuringError`, `hasExitError`, `hasInternalError` (derived flags)
- Produces: CSS-highlighted input fields inside the state properties panel

- [ ] **Step 3: Update input classes for entry, during, exit actions, and internal transitions**
  Apply dynamic classes to highlight textareas with a red border if they fail validation.
  
  Code change to make:
  * For Internal Transitions container (structured list):
    ```typescript
    <div className={`space-y-2 p-2 bg-[#1a1a1a] rounded border ${hasInternalError ? 'border-red-500' : 'border-[#333]'}`}>
    ```
  * For Entry Action textarea:
    ```typescript
    className={`w-full h-20 min-h-[4rem] bg-[#1a1a1a] border rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasEntryError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
    ```
  * For During Action textarea:
    ```typescript
    className={`w-full h-20 min-h-[4rem] bg-[#1a1a1a] border rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasDuringError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
    ```
  * For Internal Transitions container (raw text editor):
    ```typescript
    <div className={`space-y-2 p-2 bg-[#1a1a1a] rounded border ${hasInternalError ? 'border-red-500' : 'border-[#333]'}`}>
    ```
  * For Internal Transitions raw textarea:
    ```typescript
    className={`w-full h-20 min-h-[4rem] bg-[#0a0a0a] border rounded text-xs font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasInternalError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
    ```
  * For Exit Action textarea:
    ```typescript
    className={`w-full h-20 min-h-[4rem] bg-[#1a1a1a] border rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasExitError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
    ```
  * Make sure to close the IIFE parenthesization before `selectedJunction` logic starts:
    ```typescript
          </>
        );
      })() : selectedJunction ? (
    ```

- [ ] **Step 4: Verify no unit test regressions**
  Run the test suite to ensure type safety and no syntax regressions.
  Run: `npx.cmd vitest run src/utils/smAnalysisEngine.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit Task 2**
  ```bash
  git add src/App.tsx
  git commit -m "feat: highlight invalid state inputs with red borders"
  ```
