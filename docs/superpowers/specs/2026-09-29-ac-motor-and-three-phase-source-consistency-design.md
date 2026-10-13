# AC Motor and Three-Phase Source Consistency Design

## Problem

The V-Lab AC Motor exposes `Rr` and `Lm`, but the runtime ignores `Rr` and hard-codes `Lm`. The runtime also uses hidden `J` and `B` values. Separately, the 3-Phase Source returns three voltage residuals without owning the three branch variables required for those equations and KCL participation.

## Design

Extend the AC Motor from its voltage/slip approximation to a two-axis stationary-frame rotor-flux model. Add `psi_r_alpha` and `psi_r_beta` as differential states. Compute `Tr = Lr / Rr`, evolve both rotor-flux states from Clarke-transformed stator currents, and calculate electromagnetic torque from rotor flux and stator current. Read `Lm` from `params.Lm ?? 0.05`; retain `Lr = 0.06 H` as the model's internal fixed rotor inductance because it is not currently a public parameter.

Expose the existing mechanical runtime defaults in the AC Motor catalog:

- `J = 0.05 kg-m^2`
- `B = 0.005 N-m-s/rad`

Allocate three independent branch variables for `three_phase_source`:

- `phase_a` mapped to port `a`
- `phase_b` mapped to port `b`
- `phase_c` mapped to port `c`

The source equation continues to impose the three balanced phase voltages; the new branches provide the source currents used by KCL.

## Compatibility

Existing AC Motor models retain their current parameter defaults. Saved models without `J` or `B` continue to use the same runtime values. The AC Motor gains two internal states, so no saved-model schema changes are required. Existing 3-Phase Source models gain the missing internal source-current unknowns automatically during DAE assembly.

## Testing

Add focused tests proving:

- AC Motor catalog metadata exposes `J` and `B`.
- Changing `Rr` changes rotor-flux residuals.
- Changing `Lm` changes the flux/torque equations.
- AC Motor DAE assembly allocates both rotor-flux states.
- 3-Phase Source DAE assembly allocates exactly the three named phase branches.

