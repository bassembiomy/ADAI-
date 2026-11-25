# Goldens produced by scripts/xbridges-verification/goldens/tangent_touch.m
# CSVs are evidence and are committed once the user runs the script (WP-C2).

## far_root_loop.m (XBV-436)

`scripts/xbridges-verification/goldens/far_root_loop.m` asks Simulink whether it solves the algebraic loop
`y = c + y -/+ k y^2` (roots 1e3 .. 1e10, the 12 cases of `xbEngineB.test.ts` describe 'e') from a zero start, with
`AlgebraicLoopSolver` `TrustRegion` and `LineSearch`, and what a start at 0.9 x root (IC block) does. Run from the
repository root:

    matlab -batch "run('scripts/xbridges-verification/goldens/far_root_loop.m')"

Output: `far_root_loop_TrustRegion.csv`, `far_root_loop_LineSearch.csv` (+ `.meta.json`). Columns are defined in the
script header (`case_id,root,c,k,wiring,start,guess,status,error_id,error_msg,y`; `#` lines are the settings header).
The test is `src/engine/xbridges/verification/xbGoldenLoop.test.ts`: absent CSVs skip each case by name; where Simulink
converges from zero ADIA must reach the same root; where Simulink fails from zero the XBV-436 target is stricter than
Simulink and the case is skipped by name (ADIA's outcome is only logged). `XB_GOLDEN_DIR` overrides the golden folder.
