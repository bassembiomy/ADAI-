<task>
Write the MATLAB golden generator that runs one Powertrain Blockset block in Simulink and saves its outputs, so ADIA
X-Bridges can be checked to give the same numbers as Simulink (plan
`docs/superpowers/plans/2026-10-20-powertrain-blockset-xbridges.md` §4 G3).

Prerequisite: `docs/powertrain/inventory.json` exists (WP-01). Read it for library paths and port names.

Create `scripts/powertrain/pt_goldens.m`, a function
`pt_goldens(caseFile, outDir)` where `caseFile` is a JSON file with this shape:
```json
{ "type": "PT_DISC_CLUTCH", "libraryPath": "Powertrain Blockset/Drivetrain/Couplings/Disc Clutch",
  "variant": { "ParamName": "PopupValue" },
  "params": { "MaskVar": 0.1, "TableVar": [[...]] },
  "solver": { "name": "ode4", "fixedStep": 1e-4 } ,          // or { "name": "ode45", "relTol": 1e-6, "absTol": 1e-9, "outputTimes": [...] }
  "stopTime": 2.0,
  "inputs": { "PortName": { "kind": "step|ramp|sine|table|constant", ... } },
  "case": "step_engage" }
```
It must:
1. Build a scratch harness model with `new_system` (never save into the toolbox): `add_block` the library block,
   set the variant popups then the mask parameters from `params` (numbers/arrays via `mat2str` with full precision,
   `mat2str(x,17)`), drive every input port from a source built from `inputs` (Step / Ramp / Sine Wave / From Workspace
   with `timeseries`, or Constant), and log every output port with signal logging; for bus outputs, log every leaf
   element and name the column `Port.element`.
2. Set the solver exactly as given (`SolverType`, `Solver`, `FixedStep` or `RelTol`/`AbsTol`, `StopTime`); for variable
   step with `outputTimes`, use `OutputOption = SpecifiedOutputTimes`.
3. Run `sim`, then write `<outDir>/<type>/<case>.csv` (first column `t`, then one column per output leaf, `%.17g`)
   and `<outDir>/<type>/<case>.params.json` (the case file as run, plus MATLAB release and solver diagnostics).
4. Close the harness without saving. On a Simulink error, write `<case>.error.txt` with the message and continue.

Also create `scripts/powertrain/pt_goldens_all.m`: runs `pt_goldens` for every `*.case.json` under
`tests/fixtures/powertrain/cases/` (Opus writes the case files per block group) into
`tests/fixtures/powertrain/goldens/`, and prints a pass/error table.

Add one example case `tests/fixtures/powertrain/cases/LOOKUP_1D/linear_clip.case.json` that runs the Simulink
`1-D Lookup Table` block (library `simulink/Lookup Tables/1-D Lookup Table`, breakpoints `[0 1 2 4]`, table
`[0 10 15 40]`, linear interpolation, clip, input ramp −1→5 over 6 s, `ode4`, step 0.01) and run it to prove the
harness end to end.
</task>

<verification_loop>
Before finishing:
  - run `matlab -batch "addpath('scripts/powertrain'); pt_goldens_all"` from the repo root; the example case produces
    `tests/fixtures/powertrain/goldens/LOOKUP_1D/linear_clip.csv` with 601 rows plus header;
  - spot-check the CSV: at t = 3 s (input 2) the output is 15; at t = 6 s (input 5, clipped) it is 40;
  - `git status` shows only files under `scripts/powertrain/` and `tests/fixtures/powertrain/`.
</verification_loop>

<action_safety>
Never save or modify a MathWorks library or model; scratch models are closed with `close_system(...,0)`. Goldens contain
only outputs of runs with the parameters in the case file — never copy shipped default tables. Do NOT git add or commit.
</action_safety>

<structured_output_contract>
End with:
  1. What the harness does and the case file schema as implemented
  2. Files touched
  3. The example run output (row count, the two spot values)
  4. Anything you deviated on or want decided
</structured_output_contract>
