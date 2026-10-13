# Multibody Joint Family: one shared core (WP-19a)

Supersedes the per-joint equations of the universal-joint design (2026-10-05-universal-joint-design.md); that document's
universal kinematics now live in the shared core.

## 1. State and conventions

- A Frame node carries a 6-vector pose `[Px Py Pz Rx Ry Rz]`: world position and Z-Y-X Euler angles, `R = Rz Ry Rx`.
- Through variable = the wrench the joint exerts on F (world components); the wrench on B is `-f` and
  `t_B = -t_F - d x f` with `d = P_F - P_B` (equal and opposite at coincident origins, with the lever arm otherwise).
- Across = pose_F - pose_B. SI units, angles in rad.

## 2. Core (`src/engine/vlab/vlabJointCore.ts`)

One module implements all five joints. A joint is a DOF mask over the relative pose `d = P_F - P_B`, `R_rel = R_B^T R_F`:

| Joint | DOF | Translation rows | Rotation rows | Free-DOF damping |
|---|---|---|---|---|
| revolute | 1 | `d = 0` (force branches are the multipliers) | `(R_B t_j).(R_F a) = 0`, j = 1, 2 | `-c w (R_B a)` on F |
| prismatic | 1 | `(R_B c_j).d = 0`, j = 1, 2 | `rho = vee(skew(R_F R_B^T)) = 0` (torque branches are the multipliers) | `-c v (R_B a)` on F |
| spherical | 3 | `d = 0` | none | none (no torque is transmitted) |
| universal | 2 | `d = 0` | `(R_B a1).(R_F a2) = 0` | `-c (w1 a + w2 b)` on F |
| weld | 0 | `d - R_B p0 = 0` | `rho = vee(skew(R_F R0^T R_B^T)) = 0` | none |

Reactions are Lagrange multipliers mapped along the constraint gradient: `f_F = sum lambda_j (R_B c_j)`,
`t_F = sum lambda_j n_j` with `n_j = (R_F a) x (R_B t_j)` (revolute) or `a x b` (universal). Fully constrained groups use the
branch variables themselves as multipliers because the gradient is the identity at the solution. Axes are normalized at load;
a zero, non-finite, malformed (and, for the universal joint, parallel) axis is `INVALID_JOINT_PARAMETER`.

Joint rates are the discrete derivative of the joint coordinate over the solver step (`pose_prev = pose - dt * dpose`):
exact for the backward difference, so `q(n dt) = n dt w` holds to solver tolerance. Without a step size the instantaneous
spatial rate is used.

## 3. DAE routing

`jointBranchSpecs(kind, ports)` is the single source of the branch layout (force on F, multipliers, torque on F, torque on B
only with a lever arm, then one signal branch per wired measurement port). Every wrench branch names the Frame coordinate it
loads (`coord`), so the Kirchhoff mapping no longer guesses by branch name (F-047). The structural-rank check exempts only
free joint DOFs, the orientation of distance constraints, the position of angle constraints and free bodies (no World frame),
not every frame pose.

## 4. Outputs (all `Physical`, direction `out`, SI)

revolute `q w fx fy fz f_reac tx ty tz t_reac`; prismatic `x v fx fy fz f_reac tx ty tz tbx tby tbz t_reac`;
spherical `fx fy fz f_reac rx ry rz`; universal `angle1 angle2 w1 w2 fx fy fz f_reac t_reac` (signed constrained torque);
weld `fx fy fz f_reac tx ty tz tbx tby tbz t_reac pos_err rot_err`. `f_reac` / `t_reac` are the constraint-only magnitudes
(damping excluded); `fx..tz` is the total wrench on F. Port ids are never renamed; saved models are upgraded by
`vlabModelMigration.ts`.

## 5. Decisions

- F-032: `mech_config` is a physical, non-simulating block with a Frame port `C` (Simscape Mechanism Configuration). It is no
  longer a domain-transparent utility, so the validator accepts only Frame links. Its gravity vector is validated; applying it
  belongs to the body/force work (WP-19b).
- F-053: `transform_sensor.rx/ry/rz` and `angle_constraint.ang` are published in rad. Only the `angle_constraint.angle` and
  `rigid_transform` / `weld_joint` rotation parameters stay in degrees (one convention across the Frames library).
- `weld_joint.stiffness` is removed (no equation read it; the ideal weld is exact). The weld reference pose is given by
  `offset` and `rotation`; saved stiffness values are dropped on load.
- No inertia exists in the Frame domain yet (WP-19b): dynamic references enter as analytic quasi-static equivalents.
