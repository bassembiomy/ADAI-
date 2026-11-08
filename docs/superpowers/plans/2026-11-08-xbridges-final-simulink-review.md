# X-Bridges final review against Simulink

Planner/tester: Opus. Executor: Sonnet.
Acceptance tests: `src/engine/xbridges/simulinkBlockReview.test.ts`, `src/utils/stateMachine/xbSimEmbeddedParity.test.ts`.

## Scope and method

Blocks in the Simulink-equivalent palette families (about 90): Sources, Element-wise Math, Reductions, Linear
Algebra, Continuous, Discontinuities, Discrete & Delay, Trigonometric & Hyperbolic, PID, Signal Processing basics,
Routing, Logic, Bitwise, Sequential, Ports. Domain families (robot vacuum, motor control, learning, fuzzy, DEM, MPC,
DOE) are out of scope.

Each block was executed against the Simulink / MATLAB definition of its function; dynamic blocks were simulated and
compared with analytic responses; solvers were checked for their convergence order; and the simulation engine was
compared with the embedded interpreter (the reference for generated C) on code-generation-capable blocks.

## Verified as matching (no change)

| Area | Evidence |
|---|---|
| Solvers | observed order on y' = −y: ode1 1.03, ode2 2.06, ode3 3.06, ode4 4.06, ode5 5.12; ode23 5.6e−7, ode45 1.1e−9, ode14x 3.0e−11, ode23tb 8.1e−6 error at t = 1 |
| Continuous | 1/(s²+2s+1), 2/((s+1)(s+2)), state space ẋ = −x + u, Integrator with initial condition, first-order low/high-pass filters |
| Math / reductions | Sum with signs, Gain, Product, Divide, Power, Abs, Unary Minus, Sum of Elements, Mean, Max (vector and multi-input), element-wise vector operation |
| Trig / hyperbolic | SIN … ATANH, ASEC, ACOSEC, ACOSH, ACOTH, ASECH (MATLAB definitions) |
| Logic / bitwise / sequential | AND, OR, NOT, NAND, NOR, XOR (odd parity), bitwise AND/OR/XOR/NOT, shifts, Counter, D flip-flop |
| Routing / sources | Step (final value at t ≥ step time), Signal Generator sine/square, Mux, Demux, If-Else, Multiport switch (1-based) |
| Discrete | Unit Delay (UNIT_DELAY), discrete TF, discrete PID (parallel, forward Euler, filtered derivative), discrete impulse, moving average |
| Simulation = embedded | discrete integrator (forward Euler), unit delay |

## Findings to fix

| Id | Finding | Simulink behaviour |
|---|---|---|
| R1 | Palette entry `COSEC` (Cosecant) has no block definition: dropping it fails | every palette entry is a working block |
| R2 | `ACOSECH` returns `1/sin(u)` (the cosecant) | `acsch(u) = asinh(1/u)` |
| R3 | `RATE_LIMITER` with inherited sample time uses `Number('inherited') \|\| 1` = 1 s per step, so limits are per step, not per second (0→10 reaches 10 in 1 s at 1/s) | slew rates in units/s on the elapsed time since the previous output |
| R4 | `DELAY` (palette "Unit Delay", N samples) drops its `sampleTime`; it delays by N solver steps | Delay of N samples of its sample time (inherited = per step, as now) |
| R5 | `PID_BASIC` / `PID_CONTROLLER` continuous mode ignores `mode` (P still integrates) | the chosen controller form (P, PI, PD, PID) |
| R6 | `RELAY` outputs a boolean; no "Output when on/off" | `onValue` (default 1) and `offValue` (default 0) |
| R7 | `SWITCH` default criterion is `>` | default `u2 >= Threshold` (`>=`); saved models keep their explicit criterion |
| R8 | Embedded discrete integrator ignores the method: backward Euler and Tustin generate forward-Euler results | backward Euler y(k) = y(k−1) + T·u(k); Tustin y(k) = y(k−1) + T/2·(u(k) + u(k−1)), x(0) = IC |
| R9 | Embedded path rejects unconnected PID Enable/Reset (`XB_PORT_DANGLING`), the simulation uses their defaults | control ports with a default may stay unconnected; generated code uses the default |

## Reported, not changed

| Item | Reason |
|---|---|
| X-Bridges `Clock` is a pulse/clock-signal generator (`freq`), Simulink's Clock outputs simulation time | changing it would break existing models and labs; the label could be clarified later |
| `SWITCH` port order is u1, u2, control; Simulink is u1, control, u3 | port ids are stored in models; reordering would rewire saved diagrams |
| Logic blocks output JavaScript booleans | numerically equal to 1/0 everywhere they are consumed |
| PID discrete clamping reverts the stored integrator after the saturated step | output is already saturated; behaviour differs only in the integrator's internal timing |
