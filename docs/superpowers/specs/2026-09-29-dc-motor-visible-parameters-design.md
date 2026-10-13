# DC Motor Visible Parameters Design

## Problem

The V-Lab `DC Motor` catalog entry exposes `Ra`, `La`, `Ke`, and `J`, while its simulation equation also consumes `Kt` and `B`. Because those two parameters are absent from the catalog, users cannot see or edit values that affect simulation results.

## Design

Add `Kt` and `B` to the `dc_motor` parameter definitions in `src/utils/vlabLibrary.ts` with the runtime defaults already used by the equation:

- `Kt`: `0.05 N·m/A`, labeled `Torque Const`
- `B`: `0.001 N·m·s/rad`, labeled `Viscous Damping`

The simulation fallback behavior remains unchanged. Existing models that omit either property therefore continue to use `Kt = Ke` and `B = 0.001`, while newly created blocks expose and persist both values explicitly.

## Data Flow

The block catalog supplies the parameter metadata and defaults to the existing property editor. The editor stores user values in the node parameter map. The existing `dc_motor` equation reads `params.Kt` and `params.B`, so no new UI component or simulation interface is required.

## Compatibility

- Existing saved models remain valid because the runtime fallbacks are retained.
- New DC Motor nodes receive explicit `Kt` and `B` defaults from the catalog.
- No equation or port behavior changes.

## Testing

Add a focused catalog test that locates `dc_motor` and asserts that `Kt` and `B` are exposed with the intended values, units, and labels. Run that test first to demonstrate the current failure, then add the catalog fields and rerun the focused test plus relevant V-Lab tests and TypeScript checking.
