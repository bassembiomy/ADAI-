# Design Spec: Undeclared Variables Simulation Checking

## Goal
Extend the application's real-time model validation framework (`performValidation` in `src/App.tsx`) to run the code generator checks. This will block running the simulation or generating code if any undeclared variables are referenced in state actions or transitions, displaying the correct error message dialog.

---

## Proposed Changes

### 1. Model Validation Integration (`src/App.tsx`)
Inside the `performValidation` callback in `src/App.tsx`:
- Run `generateMISRACCode` with the current editor variables, states, transitions, junctions, layers, tickMs, and safetyMode.
- Append any errors returned in `genRes.errors` to `newErrors`.
- Update the dependencies array of `performValidation` to include `tickMs` and `safetyMode`.

---

## Verification Plan

### Manual Verification
- Attempt to start the simulation with a variable used in a state action but missing from the variable panel. Verify that the simulation halts and the error dialog displays:
  `Undeclared variable '<name>' referenced in state '<state>' entry action. Add it to the variable panel.`
- Add the variable to the panel and verify that the simulation can now run successfully.
- Run all vitest tests to ensure no regressions.
