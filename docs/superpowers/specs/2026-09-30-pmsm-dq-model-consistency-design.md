# PMSM dq Model Consistency Design

## Problem

The PMSM UI advertises a rotor-fixed dq model but does not expose `Ld`, `Lq`, or permanent-magnet flux. Runtime phase equations are resistive only, mechanical values are hidden, torque is based on voltage magnitude and a fixed synchronous-speed fallback, and source frequency is not propagated reliably.

## Design

Expose `Ld = 0.005 H`, `Lq = 0.005 H`, `flux = 0.1 Wb`, `J = 0.02 kg-m^2`, and `B = 0.002 N-m-s/rad`. Remove the redundant public `Kt` parameter because torque is defined by flux, pole pairs, and dq currents.

Transform phase voltages, currents, and current derivatives into rotor-fixed dq coordinates using `thetaElectrical = polePairs * thetaMechanical`. Enforce the standard PMSM voltage equations:

- `Vd = Rs*id + Ld*d(id)/dt - omegaElectrical*Lq*iq`
- `Vq = Rs*iq + Lq*d(iq)/dt + omegaElectrical*(Ld*id + flux)`

Add a zero-sequence residual for the third electrical branch. Compute torque as `1.5*P*(flux*iq + (Ld-Lq)*id*iq)`. Mechanical dynamics retain the existing shaft constraint, rotor angle integration, inertia, and damping.

Remove all PMSM dependence on `ctx.parameters.grid_freq`. Source frequency affects PMSM behavior through the actual time-varying phase voltages and resulting currents; rotor electrical speed is always `P * omegaMechanical`.

## Compatibility

Existing models without the new parameters use the documented defaults. A saved `Kt` value is ignored because it conflicts with the explicit dq torque model; new blocks no longer expose it.

## Testing

Tests cover catalog metadata, inductive dq residuals, permanent-magnet back-EMF, saliency torque, rotor-angle transforms, mechanical parameters, and invariance to unrelated `grid_freq` context values.

