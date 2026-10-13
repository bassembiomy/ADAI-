# Three-Phase Inverter Model Design

## Goal

Make the `pwm_3ph_2level` block explicit, physically consistent, and suitable for both fast motor-system studies and switch-level PWM studies.

## Scope

The block will expose two simulation modes:

- `averaged`: the default. It produces the averaged phase-leg voltages from the DC-link voltage and the three modulation indices. It is intended for fast simulations and deliberately has no PWM ripple.
- `switching`: it compares each modulation reference with a carrier at `f_sw` and produces two-level switching phase-leg voltages. It is intended for ripple and switching studies.

Both modes retain the electrical DC+ and DC- terminals, the three phase terminals, and a physically represented DC-link current. The model will satisfy instantaneous power balance apart from a visible output resistance loss.

## Parameters and UI

The block parameters will be:

| Parameter | Default | Unit | Meaning |
| --- | ---: | --- | --- |
| `model_mode` | `averaged` | — | `averaged` or `switching` |
| `control_mode` | `three_phase_modulation` | — | Explicit interpretation of control input |
| `output_frequency_hz` | 50 | Hz | Frequency used only by the scalar sinusoidal-modulation mode |
| `f_sw` | 5000 | Hz | Carrier frequency used only in `switching` mode |
| `output_resistance_ohm` | 0.001 | ohm | Per-phase output resistance |

The UI must describe that `f_sw` only affects the switch-level mode. It will never silently infer a control mode from the numeric magnitude of a signal.

## Control inputs

The preferred control contract is three independent scalar modulation inputs, `ma`, `mb`, and `mc`, each limited to `[0, 1]`. They replace the misleading scalar port named `vabc`.

For compatibility with existing diagrams, the legacy scalar control input remains supported under an explicit `control_mode` of `sinusoidal_modulation`. In that mode, the scalar input is modulation amplitude, clamped to `[0, 1]`, and the phase references are generated at `output_frequency_hz` with offsets `0`, `-120`, and `+120` degrees. New diagrams use `ma`, `mb`, and `mc`.

## Electrical model

Let `Vp` and `Vn` be DC+ and DC- potentials, `Vdc = Vp - Vn`, and `m_x` be a phase modulation index.

In averaged mode:

```text
Vx_target = Vn + Vdc * mx
Vx - Vx_target - Ix * Rout = 0
```

In switching mode, each `m_x` is compared with a normalized carrier at `f_sw`; its resulting gate is either `0` or `1` and replaces `m_x` in the voltage equation.

The DC-link branch current is constrained by phase-leg power transfer:

```text
Idc = -(ma * Ia + mb * Ib + mc * Ic)
```

The sign convention will be documented at the DC+ terminal. This gives `Vdc * Idc + sum(Vx_target * Ix) = 0`; visible output-resistance terms account for the remaining loss between target and terminal voltages.

## Expected behavior

With `model_mode = averaged`, `output_frequency_hz = 50`, sinusoidal modulation amplitude `0.4`, and a 160 V DC link:

- phase legs have 120-degree offsets;
- each phase averages approximately 50 V;
- each phase ranges approximately from 18 V to 82 V;
- a 0.1-second simulation contains five electrical cycles.

With `model_mode = switching`, the averaged envelope is the same, while a ripple is visible at `f_sw`.

## Tests

Tests will prove that:

- the parameters are visible with matching units and descriptions;
- the legacy scalar and new three-input control contracts have explicit behavior;
- the 50 Hz averaged waveform has the expected mean, range, phase offsets, and five cycles in 0.1 seconds;
- changing `f_sw` changes only switching-mode behavior;
- switching mode produces two voltage levels and carrier ripple;
- the DC-link branch current obeys the documented power relation;
- no code path uses magnitude-based control inference or a hidden 50 Hz constant.
