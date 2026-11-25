# XBV-434 / D20 — float32 per-operation rounding: the block inventory (WP-A0)

Generated 2026-11-24 from the source of `src/utils/stateMachine/xbInterpreter.ts` and
`src/utils/stateMachine/xbCGenerator.ts` by `scripts/xbridges-verification/float32Inventory.ts`, then read row by row
against the code. It fixes the scope of WP-A2 to WP-A4: which blocks can carry a float32 signal and change the result
when the rounding moves from "once per signal write" to "after every operation".

## The defect in one line

A float32 signal today is a **label, not an arithmetic type**. Both sides compute the block equation in `double` and round
once at the write:

- interpreter — `writeSignal` (`xbInterpreter.ts:237`) calls `convertScalar`, and `xbNumeric.ts:261` is `Math.fround`
  (`case 'float32': return Math.fround(n)` in the canvas path at `BlockDefinitions.ts:2685` is the same rule);
- generated C — `renderSignalWrite` computes the expression in `double`, then `SM_XB_ConvertFloat32(double)`
  (`xbCGenerator.ts:363` for the destination cast, `:746` for the signal write, definition `:5057`).

Measured today, with three float32 inputs and everything upstream correct:

```
Sum '+' of 16777216, 1, 1
  interpreter: 16777218        (double accumulation, one rounding at the end)
  Simulink single / EEC: 16777216   (round after each addition: 16777216 + 1 = 16777216, + 1 = 16777216)
```

`Math.fround(Math.fround(Math.fround(16777216) + 1) + 1) === 16777216`. This document's job is to say where else the same
thing happens.

## Classification rule

| Class | Meaning | Work in WP-A2 / A3 |
|---|---|---|
| **multi-op** | Two or more float operations reach one output or one state update. One rounding at the write is **not** the same as per-operation rounding. | Real work: temporaries in `float` (C) and an `f32()` step (`Math.fround`) between operations (interpreter). |
| **libm** | Calls a float libm function. `sinf(x)` is not `(float)sin(x)` in general. | Emit `sinf`/`cosf`/`powf`/`expf`/`logf`/`sqrtf`/… and make the interpreter match, per D23. |
| **single-op** | Exactly one float operation on the path to the write, or an exact operation (sign flip, `fabs`, select, comparison). The single rounding at the write already is the per-operation rounding. | Nothing. Listed so that the audit is complete and the acceptance can assert it. |
| **no-arithmetic** | Copies, routes, selects or does integer/boolean work. The operators in the span are **index bookkeeping**, not data arithmetic. | Nothing, but the acceptance keeps them at 0 ULP. |

Where an op count is misleading, the row says so. The three kinds that matter:

1. **index arithmetic** — `DEMUX`, `Transpose`, `MatrixConcat`, `SubMatrix`, `MatrixDiag`/`Diag`/`DiagExtract`/`ExtractDiag`,
   `MUX`, `IdentityMatrix`: the span is full of `+`, `*` and `Math.floor` on *indices*. No float operation touches the data.
2. **op count = port count** — `Sum`, `VectorAdd`, `PRODUCT`/`VectorMul`: `n-1` operations. A 2-input Sum is a single
   rounding and is already correct; the 3-input case above is not. The acceptance must therefore use **≥ 3 inputs**.
3. **a loop whose accumulator is the data** — `SumElements`, `Mean`, `MatrixMul`, `MatrixSolve`: round between iterations.

## Totals

99 codegen-capable block types, 157 entries in `BLOCK_LIBRARY` (the rest are canvas-only or aliases):

| Class | Count |
|---|---|
| multi-op | 19 |
| libm | 32 |
| single-op | 10 |
| no-arithmetic | 38 |

**Scope of the fix: 51 blocks** (19 multi-op + 32 libm). Everything else needs no change and is listed to prove that the
audit covered it.

## multi-op — 19 blocks (the core of WP-A3 / WP-A4)

| Block | Interpreter span / C emitter | Where the float rounding has to go |
|---|---|---|
| `DISCRETE_TRANSFER_FUNCTION` | `xbInterpreter.ts:1051`<br>`if (operation.type === 'DISCRETE_TRANSFER_FUNCTION') (dispatch emitter `emitTransferFunctionLifecycleStub` is a stub)` :2690 | direct-form II transposed: per tick a dot product of the b taps, a dot product of the a taps and one divide by a0 |
| `HIGH_PASS_FILTER` | `xbInterpreter.ts:994`<br>`if (operation.type === 'HIGH_PASS_FILTER') (dispatch emitter `emitHighPassLifecycleStub` is a stub)` :2915 | the low-pass recursion plus (u - prev_u): one more subtraction |
| `INTEGRATOR_DISCRETE` | `xbInterpreter.ts:1034`<br>`if (operation.type === 'INTEGRATOR_DISCRETE') (dispatch emitter `emitDiscreteIntegratorLifecycleStub` is a stub)` :2650 | x + dt*u (trapezoidal: two products and two adds) |
| `KALMAN_FILTER` | `xbInterpreter.ts:1236`<br>`if (operation.type === 'KALMAN_FILTER')` :3008 | x = A x + B u, P = A P A^T + Q, K = P C^T (C P C^T + R)^-1, x = x + K (y - C x): matrix products and a solve |
| `LOW_PASS_FILTER` | `xbInterpreter.ts:983`<br>`if (operation.type === 'LOW_PASS_FILTER') (dispatch emitter `emitLowPassLifecycleStub` is a stub)` :2873 | y = (1-alpha)*prev_y + alpha*u, and alpha = dt/(tau+dt) with tau = 1/(2*pi*fc): 3 products, 3 adds, 1 division |
| `MatrixMul` | `xbInterpreter.ts:637`<br>`emitMatrixMultiply` :1384 | the inner accumulation loop of each output element |
| `MatrixSolve` | `xbInterpreter.ts:755`<br>`emitMatrixSolve` :1498 | Gaussian elimination: division, multiply-subtract per pivot |
| `Max` | `xbInterpreter.ts:1199`<br>`emitMax` :1317 | comparison chain; a comparison result is exact but a NaN/signed-zero path copies the operand |
| `Mean` | `xbInterpreter.ts:1181`<br>`emitMean` :1280 | reduction accumulator, then a division |
| `MOVING_AVERAGE` | `xbInterpreter.ts:1007`<br>`if (operation.type === 'MOVING_AVERAGE') (dispatch emitter `emitMovingAverageLifecycleStub` is a stub)` :2963 | running window sum (n adds and n-1 subtracts) then a division by the window size |
| `PID_CONTROLLER` | `xbInterpreter.ts:1026`<br>`emitPidControllerLifecycleStub` :1939 | Kp*e + Ki*e*dt + I accumulated per tick |
| `PRODUCT` | `xbInterpreter.ts:609`<br>`emitProduct` :1082 | n-1 multiplications (or divisions) left to right; a 2-factor product is a single op |
| `RATE_LIMITER` | `xbInterpreter.ts:954`<br>`if (operation.type === 'RATE_LIMITER')` :2720 | prev + rate*dt, and the difference (u - prev) test |
| `STATE_SPACE` | `xbInterpreter.ts:1051`<br>`if (operation.type === 'STATE_SPACE') (dispatch emitter `emitStateSpaceLifecycleStub` is a stub)` :2690 | per state element a dot product A*x + B*u; the output C*x + D*u |
| `Sum` | `xbInterpreter.ts:598`<br>`emitSum` :1074 | n-1 additions left to right in port order; a 2-input Sum is a single op |
| `SUM_JUNCTION` | `xbInterpreter.ts:598`<br>`emitSumJunction` :1080 | alias of Sum |
| `SumElements` | `xbInterpreter.ts:1174`<br>`emitSumElements` :1259 | reduction accumulator over the vector |
| `VectorAdd` | `xbInterpreter.ts:598`<br>`emitVectorElementwiseSum` :1175 | n-1 additions left to right; a 2-input add is a single op |
| `VectorMul` | `xbInterpreter.ts:609`<br>`emitVectorElementwiseProduct` :1184 | alias of PRODUCT |

Notes on individual rows:

- **`Sum` / `SUM_JUNCTION` / `VectorAdd`** — `inputs.reduce` with `applyElementWise` / `binary`, left to right in port
  order; C is `terms.join(' + ')`, also left to right, so the order already agrees. Only the rounding point moves. A
  2-input Sum must keep giving a bit-identical result (it is the `single-op` case in disguise).
- **`PRODUCT` / `VectorMul`** — same shape, `n-1` products; with `operation: 'divide'` it is `u1/u2/u3`, again `n-1`
  divisions left to right.
- **`Max`** — oddly in this class: the comparison is exact, but the NaN / signed-zero branches copy an operand through, so
  a case can be built where the double accumulator differs. Keep it in the parameterised acceptance, expect 0 ULP both
  before and after.
- **`INTEGRATOR_DISCRETE`** — `x + dt*u` (and the trapezoidal variant `x + 0.5*dt*(u + u_prev)`). The interpreter state slot
  and the C state member are both `float` for a float32 signal, and *both* sides round at the state write today — so this
  block is only wrong in the multi-operation methods (trapezoidal: one extra rounding between `0.5*dt` and the sum).
- **`PID_CONTROLLER`** — `Kp*e + I + Ki*e*dt` then the clamp: three products and three additions per tick, accumulated in
  the `float` state slot. This is one of the plan's named acceptance blocks.
- **`LOW_PASS_FILTER` / `HIGH_PASS_FILTER` / `MOVING_AVERAGE`** — the loop is emitted as `double` temporaries
  (`const double lpf_<i>_tau`, `_alpha`, `_y`) even for a float32 output: a direct, visible instance of D20 in the
  generator. **Simulink documents double accumulators for some filter implementations** (the plan's risk note): where that
  is the documented behaviour, the block keeps the double accumulator and the difference is recorded as a *documented
  difference*, not a finding. WP-A2 must decide per block and write the decision in the ledger (D23 or its own entry).
- **`STATE_SPACE`** and **`DISCRETE_TRANSFER_FUNCTION`** — dot products of the coefficients: a natural double-accumulator
  candidate on the same grounds. Same treatment.
- **`KALMAN_FILTER`** — the largest one (74 arithmetic tokens in the C chain). XBV-432 already made both sides round the
  state `x`, `P`, so the *writes* agree; per-operation rounding inside the matrix products is still open. It also carries
  the known `innovation` cancellation, so it keeps its vector-wise 4-ULP bound in `xbCodeParityB` and is **not** part of
  the 0-ULP set.
- **`MatrixSolve`** — Gaussian elimination with a pivot tolerance `1e-12`. Rounding per operation changes pivoting in
  principle; the acceptance must pick a matrix that is not near a pivot swap, and the block's `solve-pivot-failure` fault
  contract must not change.

## libm — 32 blocks (WP-A3 libm shim, decision D23)

| Block | Interpreter span / C emitter | Math function the interpreter uses |
|---|---|---|
| `ACOS` | `xbInterpreter.ts:894`<br>`emitAcos` :1707 | `acosf` |
| `ACOSEC` | `xbInterpreter.ts:898`<br>`emitAcosec` :1711 | `asinf` |
| `ACOSECH` | `xbInterpreter.ts:910`<br>`emitAcosech` :1723 | `asinhf` |
| `ACOSH` | `xbInterpreter.ts:906`<br>`emitAcosh` :1719 | `acoshf` |
| `ACOT` | `xbInterpreter.ts:896`<br>`emitAcot` :1709 | `atanf` |
| `ACOTH` | `xbInterpreter.ts:908`<br>`emitAcoth` :1721 | `atanhf` |
| `ASEC` | `xbInterpreter.ts:897`<br>`emitAsec` :1710 | `acosf` |
| `ASECH` | `xbInterpreter.ts:909`<br>`emitAsech` :1722 | `acoshf` |
| `ASIN` | `xbInterpreter.ts:893`<br>`emitAsin` :1706 | `asinf` |
| `ASINH` | `xbInterpreter.ts:905`<br>`emitAsinh` :1718 | `asinhf` |
| `ATAN` | `xbInterpreter.ts:895`<br>`emitAtan` :1708 | `atanf` |
| `ATANH` | `xbInterpreter.ts:907`<br>`emitAtanh` :1720 | `atanhf` |
| `BAND_LIMITED_NOISE` | `if (operation.type === 'BAND_LIMITED_NOISE')` :2786 | `sqrtf`, `logf`, `sinf` |
| `CLARKE_TRANSFORM` | `xbInterpreter.ts:771`<br>`emitClarke` :1554 | `sqrtf` |
| `COS` | `xbInterpreter.ts:888`<br>`emitCos` :1701 | `cosf` |
| `COSEC` | `xbInterpreter.ts:892`<br>`emitCosec` :1705 | `sinf` |
| `COSECH` | `xbInterpreter.ts:904`<br>`emitCosech` :1717 | `sinhf` |
| `COSH` | `xbInterpreter.ts:900`<br>`emitCosh` :1713 | `coshf` |
| `COT` | `xbInterpreter.ts:890`<br>`emitCot` :1703 | `tanf` |
| `COTH` | `xbInterpreter.ts:902`<br>`emitCoth` :1715 | `tanhf` |
| `INVERSE_CLARKE` | `xbInterpreter.ts:793`<br>`emitInverseClarke` :1577 | `sqrtf` |
| `INVERSE_PARK` | `xbInterpreter.ts:787`<br>`emitInversePark` :1570 | `cosf`, `sinf` |
| `PARK_TRANSFORM` | `xbInterpreter.ts:781`<br>`emitPark` :1563 | `cosf`, `sinf` |
| `SEC` | `xbInterpreter.ts:891`<br>`emitSec` :1704 | `cosf` |
| `SECH` | `xbInterpreter.ts:903`<br>`emitSech` :1716 | `coshf` |
| `SIN` | `xbInterpreter.ts:887`<br>`emitSin` :1700 | `sinf` |
| `SINH` | `xbInterpreter.ts:899`<br>`emitSinh` :1712 | `sinhf` |
| `TAN` | `xbInterpreter.ts:889`<br>`emitTan` :1702 | `tanf` |
| `TANH` | `xbInterpreter.ts:901`<br>`emitTanh` :1714 | `tanhf` |
| `VectorPow` | `xbInterpreter.ts:1161`<br>`emitVectorElementwisePower` :1190 | `powf` |
| `WaveformGen` | `xbInterpreter.ts:1137`<br>`emitWaveformGen` :1036 | `asinf`, `sinf` |
| `WHITE_NOISE` | `if (operation.type === 'WHITE_NOISE')` :2786 | `sqrtf`, `logf`, `sinf` |

Notes:

- The `*f` column is the C function the block must call once the profile is a real float32 profile. Today the generator
  emits the **double** function and rounds the result (`sin(...)` → `SM_XB_ConvertFloat32`); `VectorPow` is the single
  exception that already emits `powf` (`xbCGenerator.ts:1193`, `powf((float)(base), (float)(exp))`).
- The interpreter cannot call `sinf`. The plan's decision D23 covers exactly this: either pin the C result in the test
  (the C compiler is the oracle, so the interpreter must reproduce glibc's `sinf`) or use `Math.sin` + `Math.fround`
  where the two agree. **WP-A1 must settle this before WP-A3 starts**, with a search that finds inputs where the two
  disagree; such inputs exist, so the "`Math.sin` + `fround`" option is expected to fail and D23 should be "the
  interpreter needs a float-libm shim with the same results as glibc" or "the contract for libm blocks is interpreter =
  C at 1 ULP". This is the one place where the plan's "0 ULP for everything" may not be reachable; the WP-A1 test must
  show which it is with numbers, not opinion.
- `BAND_LIMITED_NOISE` / `WHITE_NOISE` are `sqrt`, `log`, `sin` chains (Box–Muller). They sit outside the
  per-block parity matrix (noise is not reproducible per block), so they are listed here for scope but are not in the
  0-ULP acceptance.
- `WaveformGen` is a *stimulus*: it is the same on both sides and is the baseline that `xbCodeParityB` subtracts when it
  decides whether a block "has a libm call of its own". It stays double: changing it would move every model's stimulus at
  once, which is a separate decision. Record it as excluded, with this reason.

## single-op — 10 blocks

| Block | Interpreter span / C emitter | Why one rounding at the write is enough |
|---|---|---|
| `Abs` | `xbInterpreter.ts:635`<br>`emitAbsolute` :1097 | fabs is exact (clears the sign bit); a rounding is a no-op |
| `DEADZONE` | `xbInterpreter.ts:934`<br>`emitDeadzone` :1173 | u - limit (one subtraction) after the region test |
| `GAIN` | `xbInterpreter.ts:590`<br>`emitGain` :1067 | one product |
| `RELAY` | `xbInterpreter.ts:1225`<br>`emitRelay` :2000 | threshold comparison, then writes 1.0 / 0.0 |
| `SATURATION` | `xbInterpreter.ts:913`<br>`emitSaturation` :1164 | selects the input or a limit; no arithmetic |
| `SWITCH` | `xbInterpreter.ts:827`<br>`emitSwitch` :1783 | selects one of two inputs; no arithmetic |
| `UnaryNeg` | `xbInterpreter.ts:633`<br>`emitNegate` :1095 | sign flip, exact |
| `VectorDiv` | `xbInterpreter.ts:630`<br>`emitVectorElementwiseDivide` :1188 | one division |
| `VectorSub` | `xbInterpreter.ts:627`<br>`emitVectorElementwiseSubtract` :1186 | one subtraction |
| `XOR` | `xbInterpreter.ts:808`<br>`emitXor` :1685 | boolean, no float arithmetic |

## no-arithmetic — 38 blocks

| Block | Interpreter span / C emitter | Why there is nothing to round |
|---|---|---|
| `AND` | `xbInterpreter.ts:798`<br>`emitAnd` :1659 | | boolean |
| `BitwiseAND` | `xbInterpreter.ts:815`<br>`bitwiseBinary` :1690 | | integer |
| `BitwiseNOT` | `xbInterpreter.ts:821`<br>`emitBitwiseNot` :1693 | | integer |
| `BitwiseOR` | `xbInterpreter.ts:817`<br>`bitwiseBinary` :1690 | | integer |
| `BitwiseXOR` | `xbInterpreter.ts:819`<br>`bitwiseBinary` :1690 | | integer |
| `Clock` | `xbInterpreter.ts:1233`<br>`emitClock` :1029 | | reads sim_time |
| `Constant` | `xbInterpreter.ts:578`<br>`emitConstant` :903 | | writes the cast constant |
| `Counter` | `xbInterpreter.ts:1098`<br>`state-update switch` :4267 | integer counter |
| `DATA_TYPE_CONVERSION` | `emitDataTypeConversion` :1927 | | converts (that is `SM_XB_ConvertFloat32` itself) |
| `DELAY` | `xbInterpreter.ts:1230`<br>`if (operation.type === 'DELAY') (dispatch emitter `emitDelayLifecycleStub` is a stub)` :2619 | stores and returns the previous input |
| `DEMUX` | `xbInterpreter.ts:870`<br>`emitDemux` :1969 | slices the input; index arithmetic only |
| `DFlipFlop` | `xbInterpreter.ts:1103`<br>`state-update switch` :4265 | boolean state |
| `IdentityMatrix` | `xbInterpreter.ts:1217`<br>`emitIdentityMatrix` :1346 | writes 1.0 / 0.0 constants; index arithmetic only |
| `IF_ELSE` | `xbInterpreter.ts:852`<br>`emitIfElse` :1793 | | selects one of two inputs |
| `Inport` | `xbInterpreter.ts:584`<br>`emitInport` :945 | | copies the input |
| `Integrator` | `emitIntegratorLifecycleStub` :1937 | | exposes the solver state |
| `INTEGRATOR_CONTINUOUS` | `emitContinuousIntegratorLifecycleStub` :1936 | | exposes the solver state |
| `JKFlipFlop` | `xbInterpreter.ts:1103`<br>`state-update switch` :4266 | boolean state |
| `MatrixConcat` | `xbInterpreter.ts:674`<br>`emitMatrixConcat` :1461 | copies elements; index arithmetic only |
| `MatrixDiag` | `xbInterpreter.ts:709`<br>`emitMatrixDiag` :1420 | copies or zero-fills; index arithmetic only |
| `MEMORY` | `emitMemoryLifecycleStub` :1934 | stores and returns the previous input |
| `MUX` | `xbInterpreter.ts:866`<br>`emitMux` :1946 | concatenates the inputs; index arithmetic only |
| `NAND` | `xbInterpreter.ts:804`<br>`emitNand` :1675 | | boolean |
| `NOR` | `xbInterpreter.ts:806`<br>`emitNor` :1680 | | boolean |
| `NOT` | `xbInterpreter.ts:802`<br>`emitNot` :1669 | | boolean |
| `NUMERIC_REPRESENTATION` | `emitNumericRepresentation` :1929 | | converts |
| `OR` | `xbInterpreter.ts:800`<br>`emitOr` :1664 | | boolean |
| `Outport` | `xbInterpreter.ts:584`<br>`emitOutport` :946 | | terminal connection |
| `PID_BASIC` | `xbInterpreter.ts:1026`<br>`emitBasicPidLifecycleStub` :1938 | | alias of PID_CONTROLLER parameters |
| `Register` | `xbInterpreter.ts:1115`<br>`state-update switch` :4268 | copies the input |
| `ShiftLeft` | `xbInterpreter.ts:823`<br>`emitShiftLeft` :1695 | | integer |
| `ShiftRight` | `xbInterpreter.ts:825`<br>`emitShiftRight` :1697 | | integer |
| `SIX_STEP_COMMUTATION` | `xbInterpreter.ts:1120`<br>`emitSixStepCommutation` :1597 | sector lookup, integer only |
| `Step` | `xbInterpreter.ts:1083`<br>`emitStep` :949 | selects the before/after constant; no arithmetic on the time |
| `SubMatrix` | `xbInterpreter.ts:735`<br>`emitSubMatrix` :1444 | copies an index window; index arithmetic only |
| `TERMINATOR` | `xbInterpreter.ts:911`<br>`emitTerminator` :947 | sink, no output |
| `Transpose` | `xbInterpreter.ts:661`<br>`emitTranspose` :1408 | permutes elements; index arithmetic only |
| `UNIT_DELAY` | `if (operation.type === 'UNIT_DELAY') (dispatch emitter `emitUnitDelayLifecycleStub` is a stub)` :2619 | stores and returns the previous input |
