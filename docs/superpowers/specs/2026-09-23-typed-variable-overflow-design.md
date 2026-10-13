# Typed Variable Simulation and Overflow Design

## Goal

Make simulation semantics match each variable's declared data type and make simulation behavior agree with generated C for saturation and overflow errors.

## Scope

- Supported variable types remain the existing `bool`, signed/unsigned integer widths, `float`, `single`, and `double` types.
- Each variable receives an overflow policy: `saturate` or `error`.
- New variables default to `saturate` to preserve existing project behavior.
- Existing variables gain an editable type and overflow-policy control with validation before the change is committed.
- The same typed-value rules apply to initial values, runtime edits, action/transition assignments, arithmetic results, and hardware input mappings.

## Semantics

The simulator uses a single typed-value utility as the source of truth. Boolean values are normalized to `true` or `false`. Integer values are converted to the declared signedness and width. Values within range are retained exactly. Values outside the range are either clamped to the type minimum/maximum when policy is `saturate`, or rejected when policy is `error`.

For an overflow error, the variable retains its previous value, the simulation enters its existing error/reporting path, and the diagnostic identifies the variable, declared type, attempted value, and policy. Floating-point variables retain distinct `float` and `double` semantics; non-finite results caused by numeric overflow are treated as overflow events. Ordinary finite values are not integer-clamped.

Changing a variable's type revalidates its initial and current values, expressions, and hardware bindings. An incompatible edit is rejected with a diagnostic and does not mutate the model.

## Code Generation Contract

Generated C declarations continue to map `float`/`single` to `float` and `double` to `double`, while preserving all integer widths and signedness. Generated assignments and hardware mappings apply the same policy as the simulator. Saturation emits bounded behavior; error policy preserves the prior value and raises the generated runtime error state. The generated code must not silently wrap values when the configured policy is `saturate` or `error`.

## Architecture

Create or extend a focused typed-value/overflow module under `src/utils/stateMachine`. The interpreter, application adapter, UI variable editing path, semantic validation, and C generator consume that module's type limits and policy definitions rather than duplicating ranges or conversions. Variable model types are extended with the policy field, with migration/defaulting for persisted models that do not have it.

## Testing

- Unit-test every supported integer width for lower/upper bounds, saturation, and error behavior.
- Test signed negative overflow and unsigned negative input.
- Test `float` versus `double` preservation and non-finite overflow diagnostics.
- Test action assignment and runtime input paths use the same coercion result.
- Test type/policy edits reject invalid values without mutation.
- Generate C for representative variables and verify declarations, casts, saturation branches, and error branches.
- Add parity tests proving TypeScript simulation and generated C produce the same result for in-range, saturation, and error cases.

## Non-goals

- Full MATLAB fixed-point support such as word-length/scaling metadata, quantization modes, or configurable rounding modes.
- Silent modulo/wraparound behavior.
- Changing unrelated timer overflow behavior.
