# Three-Level PWM Generator Design

## Goal

Make `pwm_3ph_3level` a real, explicit three-level PWM generator whose ports, DAE branches, UI parameters, and equation outputs describe the same model.

## Contract

The block keeps physical inputs `vabc`, `vdc`, and `vneut`. `vabc` is a scalar modulation amplitude in the legacy compatibility mode; `vdc` is the DC-link voltage and `vneut` is the measured neutral-point potential/error input. The output ports are independent physical scalars:

- `ga`, `gb`, `gc`: three-level gate states in `{-1, 0, +1}`.
- `ma`, `mb`, `mc`: the three modulation references used to make the gates.

The DAE assembler allocates one branch for each of these six outputs. No vector is hidden behind a scalar `g` or `mod` port.

## Parameters

The UI exposes:

| Parameter | Default | Unit | Meaning |
| --- | ---: | --- | --- |
| `f_sw` | 2000 | Hz | Carrier frequency used by PWM comparisons |
| `output_frequency_hz` | 50 | Hz | Fundamental modulation frequency |
| `neutral_balance_gain` | 0.1 | 1/V | Neutral-point correction gain |

The zero modulation value must remain zero; no truthiness fallback may replace it with `0.5`.

## PWM equations

At time `t`, the references are three sinusoidal signals with 120-degree phase offsets. Two normalized triangular carriers are generated at `f_sw`, vertically shifted around the zero level. Each phase compares its modulation reference against the carriers and emits:

```text
gate = +1 when reference >= upper_carrier
gate = -1 when reference <= lower_carrier
gate = 0 otherwise
```

The neutral-point correction is based on `vneut` and `neutral_balance_gain`; it biases the zero-state decision without changing the three-level gate domain. `vdc` participates in the normalized neutral error and clamps the correction to a bounded interval, preventing invalid gate values.

## Verification criteria

Tests must prove:

- all nine ports are physical and all six outputs receive DAE branches;
- `vabc = 0` produces zero modulation amplitude;
- changing `f_sw` changes switching outputs at a fixed time;
- gate outputs are always exactly `-1`, `0`, or `+1`;
- `ga`, `gb`, and `gc` have 120-degree fundamental offsets;
- changing `vdc` or `vneut` changes neutral balancing behavior;
- no equation path reads a hidden fixed `314.159` or writes shared `grid_freq` state.
