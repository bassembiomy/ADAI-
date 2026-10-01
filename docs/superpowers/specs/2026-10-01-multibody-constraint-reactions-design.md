# Multibody Constraint Reaction Stabilization Design

## 1. Scope

This change stabilizes the reaction outputs of `dist_constraint` and
`angle_constraint` by coupling each scalar Lagrange multiplier to the complete
spatial force or torque balance of its connected 6-DOF frames.

The existing Frame-domain ports, distance and angle measurements, zero-safe
`dist` parameter handling, and degree-to-radian conversion remain in place.
This design specifically replaces the current scalar `Fx`/`Tx` reaction model
and adds deterministic diagnostics for structurally redundant constraints.

## 2. Current Failure

Each constraint currently owns one through branch:

- `dist_constraint.force` is assigned only to frame coordinate `Fx`.
- `angle_constraint.torque` is assigned only to frame coordinate `Tx`.

The constraint equation consumes the corresponding component residual, but no
equation relates that scalar branch to the geometric direction of the
constraint. In fully imposed or redundant models the multiplier is therefore
underdetermined. The nonlinear solver may select extremely large values before
reporting a convergence failure, producing invalid `f_reac` and `t_reac`
measurements.

## 3. Selected Architecture

Each constraint receives one internal scalar multiplier, `lambda`, plus the
three spatial components that participate in frame equilibrium:

- Distance: `lambda`, `fx`, `fy`, `fz`, followed by measurement branches.
- Angle: `lambda`, `tx`, `ty`, `tz`, followed by measurement branches.

The internal `lambda` branch has no physical port association. The component
equations map it to the three port-associated reaction components. The existing
per-coordinate Frame Kirchhoff equations then couple those components to all
other loads connected to the same frames.

This introduces one kinematic constraint equation and three multiplier mapping
equations for four internal/component variables. Frame equilibrium supplies the
remaining network equations needed to determine the reaction.

## 4. Governing Equations

### 4.1 Distance Constraint

For base and follower positions `Pb` and `Pf`:

```text
deltaP = Pf - Pb
d      = norm(deltaP)
n      = deltaP / d
```

The kinematic equation is:

```text
d - targetDistance = 0
```

The reaction mapping is:

```text
Ff =  lambda * n
Fb = -lambda * n
```

The component residuals bind `fx`, `fy`, and `fz` to the three components of
`lambda * n`. The branch port signs apply the equal and opposite reactions to
F and B. The measurement equations are:

```text
signal_d     = d
signal_fReac = abs(lambda)
```

`targetDistance` continues to use an explicit missing-value check, so a valid
zero is never replaced by the default value.

When `d` is below a small geometric tolerance:

- If the target distance is nonzero, assembly/evaluation reports that the
  distance direction is undefined for the current coincident configuration.
- If the target distance is zero and no external load selects a direction,
  `n = [0, 0, 0]` and a dedicated residual enforces `lambda = 0`.
- A loaded coincident zero-distance constraint is rejected as directionally
  indeterminate instead of returning an arbitrary force vector.

### 4.2 Angle Constraint

Euler coordinates are converted to rotation matrices `Rb` and `Rf`. The
relative rotation is:

```text
Rrel = transpose(Rb) * Rf
```

The relative angle is derived from the matrix trace, with the cosine clamped to
`[-1, 1]` before `acos`. The rotation axis is extracted from the skew-symmetric
part of `Rrel`, with explicit stable handling near zero and pi.

The kinematic equation is:

```text
relativeAngle - targetAngleRadians = 0
```

The reaction mapping is:

```text
Tf =  lambda * axis
Tb = -lambda * axis
```

The component residuals bind `tx`, `ty`, and `tz` to the three components of
`lambda * axis`. Measurements are:

```text
signal_angle = relativeAngle * 180 / pi
signal_tReac = abs(lambda)
```

At zero relative angle, the axis is not unique. With no applied moment,
a dedicated residual enforces `lambda = 0`. A nonzero target or applied moment
requiring an undefined axis produces a clear diagnostic. Near pi, the axis is
recovered from the diagonal terms of the rotation matrix rather than dividing
by `sin(angle)`.

## 5. Structural Diagnostics

The assembler performs a constraint-rank validation before invoking the
nonlinear solver. It constructs the active kinematic constraint rows over the
connected Frame coordinates and detects:

- a constraint between two frames whose relevant coordinates are already
  prescribed by references and rigid transforms;
- duplicate or linearly dependent distance/angle constraints;
- a constraint row with no free coordinate on which it can act;
- a coincident configuration whose force or torque direction is undefined.

On detection, assembly stops with a diagnostic containing:

- the constraint block ID and type;
- the connected frame-node IDs;
- whether the issue is a fully prescribed frame pair, a dependent constraint,
  or an undefined geometric direction;
- corrective guidance to remove the redundant constraint or release an
  appropriate degree of freedom.

These cases must not be passed to `ImplicitSolver`, and must not be reported as
a generic convergence failure.

## 6. Compatibility and Outputs

- Ports `B` and `F` remain `Frame` domain ports.
- Scope outputs remain `d`, `f_reac`, `ang`, and `t_reac`.
- Distance is reported in metres, angle in degrees, force in newtons, and torque
  in newton-metres.
- The sign of `lambda` is internal; public reaction outputs report magnitude.
- World-frame coordinates remain fixed and are never used to absorb constraint
  displacement.

## 7. Test Strategy

Tests are added before production changes and must first fail for the current
scalar-axis implementation.

1. A satisfied, unloaded distance constraint reports `f_reac = 0 N`.
2. A satisfied, unloaded angle constraint reports `t_reac = 0 N*m`.
3. A distance constraint aligned with a non-X direction applies equal and
   opposite force components along `n`.
4. An angular constraint around a non-X axis applies equal and opposite torque
   components along the extracted relative axis.
5. Known external axial force and torque loads produce equal-magnitude reaction
   outputs without solver fallback.
6. `dist = 0` remains zero-safe and an unloaded coincident constraint reports
   zero reaction.
7. Relative angles near zero and pi remain finite and deterministic.
8. Fully prescribed, duplicate, and linearly dependent constraints fail during
   assembly with the dedicated diagnostic and never reach `ImplicitSolver`.
9. The current B39 reproduction, in which both constrained frames are already
   prescribed by rigid transforms from World, is changed from a solver-success
   test to the expected fully-prescribed diagnostic test.
10. Distance, angle, Frame-domain, Scope-routing, and world-drift behavior is
    retained in nonredundant test topologies with at least one free relevant
    degree of freedom.

## 8. Acceptance Criteria

- No unloaded, satisfied constraint produces a nonzero reaction outside solver
  tolerance.
- Reaction vectors participate in all applicable Frame equilibrium equations.
- Reaction directions follow the current frame geometry rather than a fixed
  global X axis.
- Redundant constraints produce actionable deterministic diagnostics.
- The multibody test suite runs without convergence warnings or solver fallback
  for valid models.
