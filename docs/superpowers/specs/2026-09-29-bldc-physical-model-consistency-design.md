# BLDC Physical Model Consistency Design

## Problem

The DC Motor catalog still displays `T = Ke*I` after adding a separate torque constant. The BLDC Motor exposes `Ls` but omits it from runtime equations, hides `J` and `B`, has no independent `Kt`, and advertises trapezoidal back-EMF while executing a voltage-magnitude/slip approximation.

## Design

Correct the DC Motor display equation to use `Kt`.

For the BLDC Motor:

- Expose `Kt = 0.1 N-m/A`, `J = 0.02 kg-m^2`, and `B = 0.002 N-m-s/rad`.
- Read `Ls` as `params.Ls ?? 0.002`.
- Compute electrical angle as pole pairs times mechanical rotor angle.
- Generate three normalized trapezoidal phase shapes separated by 120 electrical degrees.
- Compute each phase back-EMF as `Ke * omega * phaseShape`.
- Enforce each phase equation as `Vphase - Rs*Iphase - Ls*dIphase - ephase = 0`.
- Compute electromagnetic torque as `Kt * sum(phaseShape * phaseCurrent)`.
- Retain the existing shaft constraint, angle integration, inertia, and viscous damping equations.

Electronic six-step commutation remains the responsibility of the external inverter/controller; the motor supplies the rotor-position-dependent phase back-EMF and torque conversion.

## Compatibility

The default `Kt` equals the existing `Ke` default, preserving the prior implicit equality unless a user chooses distinct values. Existing models without `Kt`, `J`, or `B` continue to use the same runtime defaults.

## Testing

Add focused tests proving the DC display equation uses `Kt`, BLDC metadata exposes all runtime parameters, `Ls` changes phase residuals, rotor angle changes the phase back-EMF pattern, `Kt` changes torque independently from `Ke`, and the balanced trapezoidal phase shapes produce finite residuals at zero and nonzero speed.

