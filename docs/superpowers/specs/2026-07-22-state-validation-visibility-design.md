# Design Specification: State Validation Error Visibility

Show syntax and logical validation errors inside the State Properties Panel, and highlight invalid inputs to match the error visibility workflow of transition guards.

## User Review Required

> [!IMPORTANT]
> The errors are derived dynamically from the existing `errors` list using substring keyword matching (e.g., `'Entry'`, `'During'`, `'Exit'`, `'Internal Transition'`). This allows for an isolated change entirely within the frontend rendering layer of [App.tsx](file:///g:/adia%20project/src/App.tsx) without breaking the shared interfaces or the MISRA-C code generator.

## Proposed Changes

### State Properties Panel (UI)

#### [MODIFY] [App.tsx](file:///g:/adia%20project/src/App.tsx)

1. Filter the global `errors` list for the selected state and render a warning/error alert block at the top of the properties panel.
2. Define boolean flags for each section using message substring matching:
   ```typescript
   const stateErrors = errors.filter(e => e.elementId === selectedState.id && e.source === 'Validation');
   const hasEntryError = stateErrors.some(e => e.message.includes('Entry'));
   const hasDuringError = stateErrors.some(e => e.message.includes('During'));
   const hasExitError = stateErrors.some(e => e.message.includes('Exit'));
   const hasInternalError = stateErrors.some(e => e.message.includes('Internal Transition'));
   const hasNameError = stateErrors.some(e => e.message.includes('spaces') || e.message.includes('Duplicate'));
   ```
3. Dynamically add styling classes (`border-red-500` / `ring-red-500` / `focus:ring-red-500`) to the following input elements when their respective error flag is true:
   * State Name input
   * Entry Action textarea
   * During Action textarea
   * Exit Action textarea
   * Internal Transitions container and textarea

---

## Verification Plan

### Automated Tests
- Run existing test suites (`npm test`) to ensure we did not break any existing code behavior.

### Manual Verification
- Run the app in development mode (`npm run dev`).
- Select a state in the State Machine editor.
- Write a syntax error in the **Entry Action** (e.g., `counter = ;`).
- Verify that a red error block is shown at the top of the State Properties Panel.
- Verify that the **Entry Action** textarea is outlined with a red border.
- Remove the syntax error and verify that the red border and error block disappear.
- Repeat the check for **During**, **Exit**, **Internal Transitions**, and **State Name** (e.g., add spaces in the state name).
