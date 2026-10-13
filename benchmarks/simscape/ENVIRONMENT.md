# Simscape benchmark environment

Probe date: 2026-10-05

## Result: golden-import mode

- `C:\Program Files\MATLAB\R2024b\bin\matlab.exe` does NOT exist. The `bin` folder holds only
  `win64\` (with `MATLABWindow.exe`, `matlabwindowhelper.exe`) and metadata files, and there is no
  `matlab.exe`. `matlab` is not on PATH.
- `C:\Program Files\MATLAB\R2024b\toolbox` has only `local`, `matlab` and `shared`. There is no
  `simscape` folder, so Simscape is not installed.
- The `ver` and `license('test', ...)` probe could not be run. License status is unknown, and
  Simscape, Simscape Electrical, Multibody and Fluids are assumed unavailable.

The install looks partial or corrupted (possibly an uninstaller leftover).

## What this means

- The `.m` build scripts are committed but have **not been executed**. The library paths and port
  indices in them are unverified against a real R2024b install.
- `golden/*.csv` and `golden/*.meta.json` are absent. The TS golden comparison is skipped, with a
  reason, until the user runs `run_all.m` on a licensed machine.
- The analytic sanity check (RC vs `10(1-e^{-t})`) still runs without MATLAB.

## Regenerate (user, licensed machine)

```
matlab -batch "cd benchmarks/simscape; run_all"
```
