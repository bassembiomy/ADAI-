<task>
Write and run a MATLAB script that produces the authoritative inventory of every block in the installed Powertrain
Blockset, for the ADIA X-Bridges port of that blockset.

Create `scripts/powertrain/pt_inventory.m` (a function `pt_inventory(outFile)`, default
`docs/powertrain/inventory.json`). It must:
1. Find the Powertrain Blockset library models: `fullfile(matlabroot,'toolbox','autoblks')`, search recursively for
   `*.slx`/`*.mdl` whose `BlockDiagramType` is `library` (use `load_system`, never `open_system`). Record the MATLAB
   release (`version`) and `ver('autoblks')` (or the product found) in the JSON header.
2. For every library block that is a user-facing block (has a mask or is a top-level block in a sublibrary; skip
   annotations, the library's own internal helper subsystems under `*/Private*` or masked "Info" links), record:
   - `name`, `libraryPath` (e.g. `Powertrain Blockset/Drivetrain/Couplings/Disc Clutch`), `referenceBlock` handle path;
   - `maskDescription`, `maskType`;
   - `parameters`: for each mask parameter — `name` (variable), `prompt`, `type` (edit/popup/checkbox),
     `typeOptions` (popup values), `value` (default as string), `unit` if the prompt or `MaskParameter` unit carries one,
     `visible`, `enabled`;
   - `ports` for the default configuration: for each Inport/Outport (and connection ports if any) — `name`
     (port label from `get_param(...,'PortHandles')` + the inner `Inport`/`Outport` block `Name`), `index`, `direction`,
     `unit` (`get_param(inner,'Unit')`), `dataType`, `dimensions` if set;
   - `variants`: for every popup parameter that changes the port set, loop over its values (set on a copy of the block
     in a scratch model created with `new_system` + `add_block`), and record the port list per value;
   - `busElements`: for outputs named `Info` (or whose `OutDataTypeStr` is `Bus: ...`), the element names and units of the
     bus (`Simulink.Bus` object, recursively).
3. Write pretty-printed JSON (`jsonencode(...,'PrettyPrint',true)`), blocks sorted by `libraryPath`.
4. Print a summary: block count per top-level sublibrary, and the list of blocks whose ports or units could not be read
   (with the error message) — never drop a block silently.

Then run it once:
`matlab -batch "addpath('scripts/powertrain'); pt_inventory('docs/powertrain/inventory.json')"`
(on Windows: `& "C:\Program Files\MATLAB\R2024b\bin\matlab.exe" -batch "..."` from the repository root).

If Powertrain Blockset is not installed or not licensed, stop and report exactly what MATLAB said; do not fabricate the
inventory from documentation.

Leave untouched: everything outside `scripts/powertrain/` and `docs/powertrain/inventory.json`. Do not copy block icons,
images or default calibration tables (lookup-table data) into the JSON — record table parameters with their size
(`size(eval(value))` in a scratch workspace if it evaluates) and the string `"<table>"` as the value.
</task>

<verification_loop>
Before finishing:
  - `docs/powertrain/inventory.json` exists, parses (`jsondecode(fileread(...))`), and has one entry per block in the
    summary;
  - spot-check three blocks against the Simulink Library Browser (Disc Clutch, Datasheet Battery, Mapped SI Engine):
    port names and order match what the browser shows;
  - `git status` shows only `scripts/powertrain/pt_inventory.m` and `docs/powertrain/inventory.json`.
</verification_loop>

<action_safety>
Scope strictly to the inventory. Do not modify any library or save any MathWorks model; close every scratch model with
`close_system(...,0)`. Do NOT git add or commit; leave the files in the working tree for review.
</action_safety>

<structured_output_contract>
End with:
  1. MATLAB release and Powertrain Blockset version found
  2. Block count per sublibrary (table)
  3. Blocks with unreadable ports/units and why
  4. Files touched
  5. Anything you deviated on or want decided
</structured_output_contract>
