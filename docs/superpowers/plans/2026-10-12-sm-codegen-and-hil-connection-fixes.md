# State-Machine Codegen & HIL Connection Fixes — Implementation Plan

Source: review of 2026-10-12 (state-machine generators + HIL connection; OPM out of scope).
Every task: write a failing regression test FIRST, then the minimal fix, then run the listed tests.
Do not refactor beyond the task. Do not touch OPM generators (`src/engine/opm/*`).

Baseline (before changes): `npx vitest run src/engine/hil src/utils/stateMachine src/utils/stateMachineCodeGenerator.test.ts src/components/hil`
→ 10 failures. 9 need cross-compilers absent in this container (avr-gcc / arm-none-eabi, plus
`smCTestRuntimeRenderer` c90/c11 + e2e). The `Generic` case of `hilCompilation.test.ts` is a real bug (Task H1).

---

## Part A — HIL connection

### H1. Generic target: non-blocking receive + `usleep` declaration
Files: `src/engine/hil/hilDriverTemplates.ts` (Generic template), `src/engine/hil/hilCodeGenerator.ts` (main_hil.c for Generic).
- `serialReceive` for Generic uses blocking `getchar()`; the main loop stalls until the host sends `\n`.
  Make it non-blocking: on POSIX use `poll()`/`select()` on fd 0 with 0 timeout (or set O_NONBLOCK once in init)
  and accumulate into `rx_buffer` across calls (do NOT reset partial lines each call); on `_WIN32` use
  `_kbhit`-free approach: `PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE), …)` to check available bytes.
  Lines longer than the buffer must be discarded up to the next `\n` (not truncated and processed).
- `usleep` is undeclared under `-std=c99`. Define `_POSIX_C_SOURCE 200809L` (or `_DEFAULT_SOURCE`) before any
  include in the Generic `main_hil.c` and in `hal_drivers.c` if it uses POSIX calls, and use `nanosleep` instead of `usleep`.
- Test: `hilCompilation.test.ts` Generic case passes. Add a test that builds the Generic image with gcc, runs it with
  stdin left open (no data) and asserts ≥2 telemetry lines appear within ~1s, then writes `<inputCh>=3.5\n` and
  sees it reflected (or at least that the process keeps emitting). Skip if gcc missing.

### H2. Integer scaling factor emits `2f`
File: `src/engine/hil/hilCodeGenerator.ts:299,332`.
- Add a `cFloatLiteral(n: number): string` helper: throws on non-finite; integers → `${n}.0f`; otherwise
  `String(n)` + (contains `.` or `e` ? '' : '.0') + `f`. Ensure `1e21` → `1e+21f` (valid). Use it for scalingFactor.
- Also validate `safeValue` (line 363-365) is finite; emit via the same helper/integer formatting.
- Test: generate with `scalingFactor: 2` and assert output contains `2.0f` and gcc `-fsyntax-only` accepts it.

### H3. Channel name validation + collision detection
File: `src/engine/hil/hilCodeGenerator.ts` (top of `generateHALCode`), optionally `pinValidator.ts`.
- Reject (push to `errors`, or `warnings` when `errors` undefined, and return `[]` like pin errors) any channel whose
  `name` does not match `/^[A-Za-z_][A-Za-z0-9_]{0,47}$/` (names are used in C strings, snprintf formats, the text protocol
  `name=value;`, and identifiers). Error text: `[HIL] Channel '<id>': name '<name>' must be a C identifier`.
- Reject duplicate names after `sanitize()` and case-folding for `PIN_*` macros (`a` vs `A` collide in PIN_A).
- Test: names `bad%name`, `a"b`, `x;y`, and duplicate pair `Speed`/`SPEED` each produce an error and no files.

### H4. Telemetry references unmapped variable
File: `src/engine/hil/hilCodeGenerator.ts:386-392`.
- Only use `instance->data.<var>` when `smVariables` contains `mapping.adiaVarId`; otherwise fall back to the
  peripheral read path (same as unmapped channels). Push a warning for the dangling mapping.
- Test: mapping to a non-existent variable → generated hil_interface.c does not contain `instance->data.<missing>`.

### H5. Electron `hil-connect` / `hil-send` robustness
File: `src/main.cjs` (~1050-1300).
- Before opening a new native port: if `serialPort` exists, remove listeners and close it.
- Open with `autoOpen: false` and `await` an explicit `open()` callback promise; resolve `false` on error. Attach
  `serialPort.on('error', …)` (log + `event.sender.send('hil-on-error', msg)`) and `on('close', …)` (null it,
  send `hil-on-disconnect`). Never return `true` before the port is open.
- Cap the line accumulation buffer (e.g. 4096 chars; drop on overflow).
- `hil-send`: reject non-string payloads (`typeof payload !== 'string'` → false), limit length (e.g. 256),
  strip CR, and return `false` (not `true`) when no transport is connected.
- Test: there is no harness for main.cjs IPC; extract the pure helpers you add (e.g. `normalizeHilPayload`,
  `createLineSplitter(maxLen)`) into `src/security/hilSerialHelpers.cjs` with a `.test.cjs` node test, wire it into
  `test:security` in package.json, and use them from main.cjs.

### H6. HILDashboard stale `isRecording` / channels closure
File: `src/components/hil/HILDashboard.tsx`.
- Hold `isRecording` and `channels` in refs (`useRef`, updated in an effect) and read the refs inside
  `handleIncomingValues`, so both the IPC listener and the long-lived Web Serial reader loop see current values.
- Do not plot missing channels as `0`: push `null` (Plotly gap) when a channel is absent from a frame; recorded
  data should only contain received values (it already does — keep).
- Use `decoder.decode(value, { stream: true })` in the Web Serial reader.
- Move the IPC/Web-Serial write out of the `onChangeSessionState` updater in `toggleFault` (side effects in a state
  updater run twice in StrictMode); compute `active` from current `sessionState` and send once.
- Only `override` faults are supported by firmware: for `noise`/`clamp` when connected, log a warning
  `'<type> fault is simulation-only; not sent to target'` and do not send.
- Test: add a focused test if existing HILDashboard tests exist; otherwise extract the frame → plot-values mapping into a
  pure function in the same file (exported) and unit test the null-gap behavior.

### H7. `HILSerialSession` protocol + binary framing
Files: `src/engine/hil/hilSerialSession.ts`, `src/engine/hil/hilProtocol.ts`.
- Text mode must match firmware: override → `${name}=${value}\n`; release → `${name}_release=1\n`. Validate `name`
  with the same identifier regex as H3 and `value` finite; throw otherwise.
- Binary: after a successful decode, advance by the frame's `length` byte (`buffer[1]`), not 10. Loop condition must
  allow minimum frame size (6 bytes: AA,len,0-len id,type,1B val,cs ... compute real minimum = 1+1+1+0+1+1+1 = 6).
  If `length` byte > available bytes, wait for more data.
- `decodeBinaryFrame`: validate `length === 3 + idLen + 1 + valueSize(type) + 1` for a known type; unknown type → null;
  never let DataView throw (wrap in bounds checks). Return also `length` so the session can advance.
- `encodeBinaryFrame`: throw if total length > 255.
- Ignore incoming data when `!running`; cap `textBuffer` (e.g. 4096) — drop on overflow.
- Tests (extend `hilSerialSession.test.ts` / add protocol tests): four back-to-back 6-byte bool frames all decode;
  a 20-byte frame followed by a 9-byte frame both decode; malformed frame `[AA,05,00,04,09,0,0,0,0,0]` does not throw;
  260-char id encode throws; text override/release payload format.

### H8. STM32 UART receive (lower priority, do last)
File: `src/engine/hil/hilDriverTemplates.ts` (STM32F4/F1 templates).
- Replace polling `HAL_UART_Receive(...,1,1)` with interrupt-driven single-byte receive into a ring buffer
  (`HAL_UART_Receive_IT` + `HAL_UART_RxCpltCallback` re-arming), and have `HIL_Receive_Poll` drain the ring buffer.
  Also clear ORE in `HAL_UART_ErrorCallback` and re-arm.
- Test: generated STM32 sources contain `HAL_UART_Receive_IT` and `HAL_UART_RxCpltCallback`; existing STM32 compile
  test (skipped here without arm-gcc) must still pass where the toolchain exists — keep code compiling against the
  repo's `hil_build/stm32f4xx_hal.h` stub (extend the stub if needed: add `HAL_UART_Receive_IT`, callbacks).

---

## Part B — Generic state-machine generator (`src/utils/stateMachine/`)

### S1. `renderLiteral` invalid literals
File: `smCExpressions.ts` `renderLiteral` (~line 34).
- Float/double: format via a helper producing valid C: non-finite → throw; if `String(v)` contains `e` or `.` keep it,
  else append `.0`; float adds `f`. So `1e21` → `1e+21` (double) / `1e+21f` (float); `2` → `2.0`/`2.0f`.
- Unsigned: only append `U` when `Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF`; for a non-integer in
  an unsigned context emit the double literal (C promotes correctly); integers > UINT32_MAX → emit with `ULL`? No:
  throw a clear error (out of range for 32-bit target).
- Apply the same formatting wherever initial values are emitted (search `initialValue` in `smCGenerator.ts`).
- Tests: double `1e21`, float `1e21`, uint32 `cnt = cnt * 0.5`, uint initialValue `1.5` all compile with
  `gcc -std=c99 -pedantic-errors -Wall -Wextra -Werror` (follow existing compile helpers in `smCGenerator.test.ts`).

### S2. Math function calls
Files: `smCExpressions.ts` (`call` case), `smCGenerator.ts` `renderUserLogicSource`/`renderUserLogicHeader`.
- Include `<math.h>` in `sm_user_logic.c` (always, or when any call is present — prefer always for simplicity if
  existing goldens can be updated; otherwise conditional).
- Map `abs` → `fabs` for double, `fabsf` for float, `abs` only for int types ≤ 32 bits (`labs` not needed);
  `sin/cos/exp/sqrt` → `sinf/cosf/expf/sqrtf` when the inferred type is float. Keep the interpreter semantics
  (`smInterpreter`/`smExpressions` evaluate with JS Math.abs → float abs) — the C must match.
- If linking needs `-lm`, check generated build files / compile test commands and add `-lm` where the generator emits
  a link command or platformio flags.
- Test: action `ratio = sin(total) + abs(total);` on float and double variables compiles strict and `abs(-0.5)` behaves
  as 0.5 in a host run if a runtime harness exists (`smCHarness`), else compile-only.
- Update golden snapshot (`src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`) with `-u` ONLY
  for the intended include/diff; inspect the snapshot diff.

### S3. Identifier collisions: `_IDX` suffix and layers
Files: `smSemanticValidator.ts` (`register` ~line 199-210), `smCGenerator.ts:90,114`.
- Register both `SM_ST_<ID>` and `SM_ST_<ID>_IDX` for states, and `SM_LYR_<ID>_IDX` for layers, in the same collision
  set; emit `C_IDENTIFIER_COLLISION` diagnostics.
- Tests: states `a` + `a_IDX` → collision diagnostic; layers `l-1` + `l_1` → collision diagnostic.

### S4. `/*` inside comments
File: `smCGenerator.ts:836` `cCommentText`.
- Also replace `/*` with `/ *`. Test: state name `a /* b` compiles with `-Werror`.

### S5. `SM_TICK_MIN_MS 0U` → `-Wtype-limits`
File: `smCGenerator.ts` (~881 config, ~1624 `SM_Step`).
- When min is 0 omit the `delta_ms < SM_TICK_MIN_MS` comparison (emit only the max check), or emit
  `#if SM_TICK_MIN_MS > 0U` around it. Test: `tickMs = 1` compiles with `-Wextra -Werror`.

### S6. Temporal threshold range
File: `smSemanticValidator.ts` (near the afterTicks check ~582).
- Add diagnostic `TEMPORAL_THRESHOLD_INVALID` when `afterTicks * tickMs > 0xFFFFFFFF` or not a safe integer.
- Test: afterTicks large enough to overflow → diagnostic, no C emitted.

### S7. Unknown variable type in `renderCType`
File: `smCExpressions.ts` (~97-115).
- Add a default branch that throws `Unsupported variable type '<t>'` (fail closed). Test it.

## Part C — XBridges generator (`src/utils/stateMachine/xbCGenerator.ts`)

### X1. `sim_time` collision
Line ~161: allocate via `allocateName('sim_time', 'clock')`, store the chosen name in the layout (e.g.
`simTimeField`), and replace every hard-coded `sim_time` reference in emitted C with that field. Test: Clock op +
signal `nodeId='sim', portId='time'` compiles with gcc.

### X2. Saturating float→int output mapping
Lines ~2005-2035 (`renderMappedOutputExpression`): when the source is floating and destination is an integer type, emit
a call to a new static helper per destination type, e.g. `SM_XB_SatToI16(double)` that maps NaN → 0, clamps to
[MIN,MAX], and truncates; for `bool` emit `SM_XB_Truth(x)` (existing helper) instead of `(bool)`. Emit helpers once in
the lifecycle source next to existing helpers. Interpreter parity: check `xbInterpreter.ts` output mapping — if it does
not saturate, make it match (saturate + NaN→0) and note it. Tests: values 1e10→INT16_MAX, -1→0 for uint32, NaN→0,
NaN bool → false (run under gcc host harness if present, else assert emitted text + compile).

### X3. Non-numeric parameters
`scalarParameter` (~383): if the parameter is present but not a finite number, throw (fail closed) with
operation id + parameter name. Validate fixed-point `wordLength` integer 1..32 and `fractionLength` integer in
[-32768,32767] before emission (~335, ~702); throw otherwise. Tests for gain `'2'` and wordLength `2.5`.

### X4. Lower-priority (only if X1–X3 done and green)
- Schedule counter: use `counter = (counter + inc) % period` to match interpreter (~4042).
- Moving average: `% windowSize` the index before the buffer write; reject non-vector buffer slot (throw).
- LPF/HPF: generation-time check that cutoff > 0 (throw).

---

## Verification (executor must run and report)
1. `npx vitest run src/engine/hil src/utils/stateMachine src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts src/utils/stateMachineCodeGenerator.behavior.test.ts src/components/hil`
   → only the 9 toolchain-absent failures may remain; Generic HIL compile must pass.
2. `npm run test:security` (with the new helper test wired in).
3. `npx tsc --noEmit -p .` → no new errors vs baseline (record baseline count first).
4. Report per task: status, files changed, tests added, anything deferred and why.
