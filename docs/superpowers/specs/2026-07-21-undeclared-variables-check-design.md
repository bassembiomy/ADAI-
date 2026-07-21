# Design Spec: Undeclared Variables Validation

## Goal
Implement validation checks in the Stateflow code generator and HIL/simulation build runner to ensure all variables used in state actions and transition conditions/actions are explicitly defined in the variable list. We will block code generation, HIL compilation, and simulation execution until all referenced variables are defined, alerting the user with clear and descriptive error messages.

---

## Proposed Changes

### 1. Code Generator Validator (`src/utils/stateMachineCodeGenerator.ts`)
Add a validation helper `validateExpressionVariables` to inspect all user-written actions and conditions:
- **Ignored Tokens Set (`IGNORED_IDENTIFIERS`)**:
  A set of C/C++ keywords, standard C library types (`uint32_t`, etc.), system variables (`delta_ms`, `state_timer`), and standard C math functions (`sin`, `cos`, `fabs`, `log`) that are bypassed.
- **Parsing Heuristic**:
  - Strip single-line (`//`) and multi-line (`/* */`) comments.
  - Strip function calls using a regex pattern `\b[A-Za-z_][A-Za-z0-9_]*\s*\(` to ignore function names (but still check their arguments).
  - Extract remaining identifiers matching `\b[A-Za-z_][A-Za-z0-9_]*\b`.
  - Filter out identifiers present in `IGNORED_IDENTIFIERS`.
  - Compare any remaining identifiers with `chart.variables`. If not found, append a validation error item to the `errors` list.
- **Checked Locations**:
  - State entry, during, exit, and internal transitions actions.
  - Transition conditions and actions.

### 2. HIL Workspace build validation (`src/components/hil/HILWorkspace.tsx`)
- In `handleBuild` (the handler for compile/build), we will run `generateMISRACCode` first to evaluate the state machine chart.
- If the result contains any validation errors (`res.errors.length > 0`):
  - Print all the error messages to the compiler log console.
  - Set the build status to `error`.
  - Halt the build pipeline immediately, preventing Electron from invoking the files exporter or compilation routines.

---

## Verification Plan

### Automated Unit & Integration Tests
Add the following unit test inside `src/utils/stateMachineCodeGenerator.test.ts`:
- Check that `generateMISRACCode` returns validation errors if an undeclared variable is used in:
  - A state entry action
  - A state during action
  - A state exit action
  - A transition condition
  - A transition action
- Check that valid C/C++ keywords, math functions, standard types, and function calls themselves are correctly bypassed and do not trigger errors.

### Manual / Integration Verification
Run Vitest:
```bash
npx vitest run src/utils/stateMachineCodeGenerator.test.ts --exclude "**/.kilo/**"
```
Ensure 100% of tests pass.
