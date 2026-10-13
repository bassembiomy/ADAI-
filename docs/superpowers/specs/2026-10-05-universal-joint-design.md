# Universal joint repair design

Date: 2026-10-05

## Scope and observed defect

The library does not declare Frame domains on B/F. The assembler allocates one scalar torque branch. The equation uses scalar across subtraction and `damping || 0.05`, losing an explicit zero. Existing spherical-joint integration supplies a working pattern for Frame ports, force branches, typed measurements, saved-node migration, and runtime tests.

## Recommended physical convention

Use a true two-axis universal joint. axis1 is attached to B; axis2 is attached to F. Defaults are [1,0,0] and [0,1,0]. Parse exactly three finite numbers, reject zero and parallel vectors before solving, normalize axis1, and orthogonalize/normalize axis2 against axis1 at the reference pose. Describe this convention in the parameter help text. This preserves the requested orthogonal rotational freedoms while accepting nonparallel input directions.

At runtime transform each local axis with its own frame rotation. Impose coincident XYZ positions and one scalar orthogonality constraint between these transported axes. Its cross product defines the instantaneous constrained torque direction. This avoids a fixed world-axis or Euler-component constraint, which would incorrectly reject valid combined rotations.

## DAE and damping

Allocate independent fx/fy/fz reactions, one internal rotational multiplier, and tx/ty/tz wrench components. Force and torque act with opposite signs on B and F. Torque equations map the multiplier onto the instantaneous constrained axis and add viscous resistance only along the two permitted axes. Compute actual angular velocities from Euler orientation derivatives using the engine rotation convention; do not treat Euler-coordinate derivatives as world angular velocity. Read damping with nullish defaults and validate finite nonnegative values. An explicit zero remains zero.

Because angular-speed outputs and damping depend on orientation derivatives, classify the joint as derivative-dependent rather than purely algebraic. Preserve all existing algebraic fast paths for other blocks.

## Integration and error handling

Declare canonical Frame ports and Physical measurement ports in the library. Restore canonical ports and missing axis defaults when loading saved universal joints without overwriting damping=0. Update equation documentation and assembler routing. Reject invalid axes before expensive solver attempts with a clear diagnostic propagated through the existing worker/UI error path. Extend fully-prescribed constraint diagnostics to this joint.

## Measurements

angle1 and angle2 are signed joint angles in rad, relative to the reference pose and with documented principal-angle wrapping. w1/w2 are signed joint rates in rad/s. fx/fy/fz and f_reac are force on F in N. t_reac is the signed constrained-axis multiplier in N*m; it excludes permitted-axis damping torque.

## Validation

Write failing tests first for domains/units, invalid axis inputs, arbitrary normalized axes, simultaneous finite rotations, locked translation, excluded third rotation, damping=0, and velocity damping signs. Test opposite endpoint wrenches and known 3D force/constrained-torque balance. Exercise VLabPhysicsEngine.simulateStep and scope outputs across multiple steps, assert finite results and small assembled residuals, and cover saved-node migration and immediate FULLY_PRESCRIBED failure. Run the existing spherical/frame/constraint regression suites and relevant TypeScript checks.

## Alternatives considered

1. Recommended: transported-axis orthogonality constraint. Correct for finite rotations and directly supplies the reaction direction.
2. Constrain a component of relative Euler angles or a rotation vector. Simpler, but generally does not represent a universal joint under combined rotations.
3. Build two revolute joints plus an intermediate frame. Physically valid after completing revolute support, but expands this repair into another incomplete joint implementation.
