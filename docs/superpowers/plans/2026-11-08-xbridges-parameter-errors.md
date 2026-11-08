# X-Bridges: Simulink-style parameter evaluation and errors

Planner/tester: Opus. Coding: Haiku (WP2, mechanical schema) and Sonnet (WP1, WP3–WP6).
Acceptance tests: `src/engine/xbridges/parameterValidation.test.ts`, `src/utils/stateMachine/xbParameterExpressions.test.ts`,
and `src/help` (the help vocabulary test now also scans `parameterEvaluation.ts`).

## Evidence (sweep of 95 in-scope blocks, before this work)
For 127 user-editable numeric parameters, the text `abc` or `1.2.3` produced **no error** (254 of 336 cases).
- Constant `abc` outputs the string "abc"; an empty field is silently 0/1; `2*pi`, `inf`, `sqrt(2)` are not understood.
- Gain `abc` throws inside `execute`; `executeBlockOrCache` and `computeDerivatives` swallow exceptions with
  `console.error`, so the run continues with stale values and the user sees nothing.
- Constant integer data types are checked only by code generation; enumerations (Switch criterion, PID mode …) and
  integer parameters (numInputs, window size …) are not checked.

## Simulink behaviour followed
Block parameters are MATLAB expressions (numbers, `pi`, `inf`, arithmetic, math functions, `[1 2; 3 4]`). An undefined
name or a malformed expression is an "Invalid setting" error that stops the model from updating; integer, range and
option rules are enforced; a runtime error in a block stops the simulation with an error.

## Work packages

### WP1 (Sonnet) — `src/engine/xbridges/parameterEvaluation.ts`
`ParameterKind` (`number`, `numeric`, `vector`, `matrix`, `integer{min,max}`, `positive`, `nonnegative`, `sampleTime`,
`boolean`, `option{options}`) and `evaluateParameter(raw, kind)` returning `{ ok: true, value }` or
`{ ok: false, code, reason }` with codes `PARAMETER_EMPTY`, `PARAMETER_INVALID`, `PARAMETER_NOT_INTEGER`,
`PARAMETER_OUT_OF_RANGE`, `PARAMETER_OPTION_INVALID`. Use mathjs with a restricted, isolated instance: only numbers,
arithmetic operators, `pi`, `e`, `inf`/`Inf`, and pure math functions; no assignment, function definition, `import`,
`evaluate`, `parse`, `createUnit`, `simplify`, units or strings. MATLAB arrays: spaces or commas between elements,
semicolons between rows. Reasons read like MATLAB ("Undefined function or variable 'abc'.", "Invalid expression.").
Numbers and numeric arrays already given as JSON values are accepted as is.

### WP2 (Haiku) — `src/engine/xbridges/parameterSchema.ts`
`XB_PARAMETER_SCHEMA: Record<blockType, Record<param, ParameterKind>>` and `parameterKind(type, param)` for every block
of the in-scope palette families (see the test's SCOPE list, plus UNIT_DELAY and MEMORY): every user-editable numeric
parameter (the test lists how they are found; TF-family A/B/C/D/x0 are derived and excluded) and the enumerated string
parameters, whose options come from the Properties panel `<option>` lists in
`src/components/xbridges/XbridgesPropertiesPanel.tsx` and from each block's `execute` (the factory default must be an
option). Integer parameters: input/output counts, window sizes, delay lengths, bit widths, port indices, dimensions,
counts (min 1 unless the code allows 0). Positive: cut-off frequencies, frequencies of sources where 0 is meaningless;
nonnegative: variances, noise power, max values. Sample-time parameters (`sampleTime`, `sample_time`, `dt`) are
`sampleTime`. Matrices: State Space A–D, Kalman matrices; vectors: numerator, denominator, zeros, poles, initial-state
vectors. Read each block's factory and `execute` to choose; when unsure use `number` or `numeric`, never a stricter rule.

### WP3 (Sonnet) — engine
- Compile (`modelChecks.ts`): for every block, evaluate every schema parameter; push one error per bad parameter with the
  evaluation code, `blockIds: [block.id]` and a message naming the block, the parameter, the entered text and the reason.
  Also `SUM_SIGNS_INVALID` (signs only `+`, `-`, `|`; count of `+`/`-` equals the inputs) and, for Constant with an
  integer/boolean `output_type`, `CONSTANT_VALUE_OUT_OF_RANGE` / `CONSTANT_VALUE_NOT_REPRESENTABLE` (same rules as the
  embedded validator).
- Resolution: the engine simulates with evaluated values. Blocks may already have been built by their factory from the
  raw text, and some factories derive values (TF → A..D), so compile rebuilds each block from its evaluated parameters
  (`BLOCK_LIBRARY[type](id, resolved)`, keeping id/label/state shape as the engine already does when it re-instantiates).
- `engine.applyParameterUpdates(blockId, raw)`: evaluates; valid values replace the block's parameters (rebuilding when
  the factory derives values); invalid ones add a `PARAMETER_*` error once and keep the last valid value. The workspace
  main-thread loop and the worker use it instead of `Object.assign(block.params, …)`.
- Exceptions in `execute` / `evaluateDerivatives` become `BLOCK_RUNTIME_FAULT` errors (message includes the exception
  text) and set a fatal flag: `engine.hasFatalError()`. All solvers' run loops and the live loop stop when it is set; the
  live canvas status becomes Failed (the status bar already shows errors).

### WP4 (Sonnet) — Properties panel
Validate on edit with the same schema and evaluator: invalid field gets a red border, `aria-invalid="true"` and the
reason under the field; the value is still stored (like Simulink, the model refuses to run until it is fixed).

### WP5 (Sonnet) — code generation
The embedded builder/validator evaluates numeric parameter expressions with the same evaluator (so `2*pi` generates
the same number) and reports `XB_PARAMETER_INVALID` for invalid text on codegen-capable blocks.

### WP6 (Sonnet) — help
Diagnostic guidance for every new code (the help test extracts them), a section in the `xbridges-simulation` chapter
on entering parameters (expressions, arrays, inf, errors), and block help where a parameter's rule matters. Keep
`helpCoverage.test.ts` green with the repository's help tooling.
