# Task: Thermal Blocks Standardization & Physics Engine Corrections

# Task: Thermal Blocks Standardization & Physics Engine Corrections

- [x] Task 1: Write TDD Test Suite for Thermal Blocks
  - [x] Step 1: Create `src/engine/vlab/thermal_blocks_validation.test.ts` with tests for all 12 thermal blocks covering port domains, R/Rth separation, Q=0, T=0, differential temp sensing ($T_a - T_b$), controlled heat & temp sources with port S, and well-posed thermal networks.
  - [x] Step 2: Run tests and verify expected failures before implementation.
- [x] Task 2: Update Library Definitions (`src/utils/vlabLibrary.ts`)
  - [x] Step 1: Add parameter `R` (Electrical Resistance in $\Omega$) to `thermal_resistor` while keeping `Rth` (Thermal Resistance in $\text{K/W}$), update equation text.
  - [x] Step 2: Add `"domain": "Thermal"` to ports `a` and `b` on `conductive_heat`, `convective_heat`, `radiative_heat`, `heat_flow_sensor`, `temp_sensor`, `heat_src`, `ctrl_temp_src`.
  - [x] Step 3: Add `"domain": "Thermal"` to port `a` on `thermal_mass` and `thermal_ref` and `temp_src`.
  - [x] Step 4: Update `conductive_heat` equation to $Q = k \cdot (T_1 - T_2)$ (conductance $k$).
- [x] Task 3: Update Engine Equations (`src/engine/vlab/vlabEquations.ts`)
  - [x] Step 1: Update `thermal_resistor` to use `params.R ?? params.resistance ?? params.Rth ?? 10.0`.
  - [x] Step 2: Update `conductive_heat` to support both conductance $k$ ($\text{W/K}$) and geometric $k \cdot A / L$.
  - [x] Step 3: Update `temp_sensor` to output $T_{out} = T_a - T_b$.
  - [x] Step 4: Update `heat_src` to accept $Q = 0$ using `Q ?? 100`.
  - [x] Step 5: Update `temp_src` to accept $T = 0$ using `T ?? 293.15`.
  - [x] Step 6: Update `ctrl_heat_src` to read control signal from port `s`.
  - [x] Step 7: Update `ctrl_temp_src` to enforce $T_a - T_b = S$ reading $S$ from port `s`.
- [x] Task 4: Update DAE Assembler (`src/engine/vlab/DAEAssembler.ts`)
  - [x] Step 1: In `getComponentSpec`, handle two-terminal branches for `heat_src`, `ctrl_heat_src`, `ctrl_temp_src` when port `b` is present.
  - [x] Step 2: Ensure scope mapping and physical signal ports route correctly.
- [x] Task 5: Update Component Definitions & Metadata (`src/engine/vlab/vlabComponentDefinitions.ts`)
  - [x] Step 1: Update metadata, equations, latex, across/through for `thermal_resistor`, `temp_sensor`, `ctrl_heat_src`, `ctrl_temp_src`.
- [x] Task 6: Verification & Regressions
  - [x] Step 1: Run `npx vitest run src/engine/vlab/thermal_blocks_validation.test.ts`.
  - [x] Step 2: Update existing tests where necessary (e.g. `vlab_connected_models.test.ts`, `test_all_blocks_scope.test.ts`).
  - [x] Step 3: Run full verification suite (`npm run test:vlab`, `npm run test:vlab:connected`, `npm run test:vlab:full`).
