# Multibody Frame Kinematics and Constraints Design Specification

- **Date:** 2026-10-01
- **Status:** Approved Design
- **Topic:** VLab Multibody Frame Domain, 6-DOF Kinematic Transformation, Transform Sensor, and Distance/Angle Constraints

---

## 1. Problem Statement & Root Cause Analysis

### 1.1 `world_frame`, `rigid_transform`, `ref_frame`
- **Missing Domain:** Ports `W`, `R`, `B`, and `F` do not have a dedicated `Frame` or `MultibodyFrame` domain in `vlabLibrary.ts`.
- **World Frame Float:** `world_frame` was not registered in `referenceNodeIds` in `DAEAssembler.ts`, causing world coordinates to drift/mutate under constraint forces instead of remaining fixed at origin $[0,0,0,0,0,0]$.
- **Ignored Parameters & Scalar Collapse:** `rigid_transform` ignored `offset` ($[1, 2, 3]$ m) and `rotation` ($[0, 0, 90]^\circ$), reducing the physical 3D kinematic relationship to a scalar difference equation: `across[0] - across[1] = 0`.
- **No Measurable Pose for Scope:** The Probe/Scope yielded zero because there was no Frame/Pose Sensor block outputting physical position and Euler angles.

### 1.2 `dist_constraint` and `angle_constraint`
- **Missing Domain:** Ports `B` and `F` lacked the `Frame` domain.
- **Scalar Difference vs 3D Distance:** `dist_constraint` treated distance as scalar `across[0] - across[1]` rather than 3D Euclidean distance $\|\mathbf{P}_f - \mathbf{P}_b\|$.
- **Falsy Zero Bug:** `params.dist || 1` caused `dist = 0` to incorrectly default to $1$ m.
- **Mismatched Parameter Key:** `angle_constraint` looked for `params.limit` instead of `params.angle` from the UI.
- **Scalar Hard-Stop vs Relative Frame Angle:** Treated angle constraint as a scalar barrier instead of relative 3D angular orientation constraint.
- **Missing Measurement Outputs:** No output ports for distance, angle, reaction force, or reaction torque to feed into Scope.

---

## 2. Architecture & Domain Contracts

### 2.1 Domain Registry
- Add `'frame'` and `'multibodyframe'` (case-insensitive) to:
  - `PHYSICAL_DOMAINS` in `src/engine/vlab/types.ts`.
  - `isValidVLabPortDomain` in `src/engine/vlab/vlabPortDomains.ts`.
  - `areDomainsCompatible` in `src/components/vlab/VLabWorkspace.tsx` and connection validators in `src/components/vlab/vlabConnectionValidation.test.ts`.

### 2.2 Component Library Port Specifications
1. **`world_frame`**:
   - Port `w`: `pos: 'right'`, `label: 'W'`, `domain: 'Frame'`.
2. **`ref_frame`**:
   - Port `r`: `pos: 'right'`, `label: 'R'`, `domain: 'Frame'`.
3. **`rigid_transform`**:
   - Port `b`: `pos: 'left'`, `label: 'B'`, `domain: 'Frame'`.
   - Port `f`: `pos: 'right'`, `label: 'F'`, `domain: 'Frame'`.
   - Parameters:
     - `offset`: `{ value: '[0 0 0]', unit: 'm', label: 'Offset' }`
     - `rotation`: `{ value: '[0 0 0]', unit: 'deg', label: 'Rotation' }`
4. **`dist_constraint`**:
   - Port `b`: `pos: 'left'`, `label: 'B'`, `domain: 'Frame'`.
   - Port `f`: `pos: 'right'`, `label: 'F'`, `domain: 'Frame'`.
   - Port `d`: `pos: 'right'`, `label: 'd'`, `domain: 'Physical'` (distance signal).
   - Port `f_reac`: `pos: 'right'`, `label: 'F'`, `domain: 'Physical'` (reaction force signal).
   - Parameters:
     - `dist`: `{ value: 1, unit: 'm', label: 'Distance' }`
5. **`angle_constraint`**:
   - Port `b`: `pos: 'left'`, `label: 'B'`, `domain: 'Frame'`.
   - Port `f`: `pos: 'right'`, `label: 'F'`, `domain: 'Frame'`.
   - Port `ang`: `pos: 'right'`, `label: 'θ'`, `domain: 'Physical'` (angle signal in degrees).
   - Port `t_reac`: `pos: 'right'`, `label: 'T'`, `domain: 'Physical'` (reaction torque signal).
   - Parameters:
     - `angle`: `{ value: 0, unit: 'deg', label: 'Angle' }`
6. **`transform_sensor` (Transform Sensor)**:
   - Port `b`: `pos: 'left'`, `label: 'B'`, `domain: 'Frame'`.
   - Port `f`: `pos: 'left'`, `label: 'F'`, `domain: 'Frame'`.
   - Port `x`: `pos: 'right'`, `label: 'X'`, `domain: 'Physical'` (X position in m).
   - Port `y`: `pos: 'right'`, `label: 'Y'`, `domain: 'Physical'` (Y position in m).
   - Port `z`: `pos: 'right'`, `label: 'Z'`, `domain: 'Physical'` (Z position in m).
   - Port `rx`: `pos: 'right'`, `label: 'Rx'`, `domain: 'Physical'` (Rx angle in deg).
   - Port `ry`: `pos: 'right'`, `label: 'Ry'`, `domain: 'Physical'` (Ry angle in deg).
   - Port `rz`: `pos: 'right'`, `label: 'Rz'`, `domain: 'Physical'` (Rz angle in deg).

---

## 3. DAE Formulation & Variable Allocation

### 3.1 6-DOF Across-Variables
In `DAEAssembler.ts`, when a physical node root has `domain === 'frame'` or `domain === 'multibodyframe'`:
- Allocate 6 consecutive unknown variables in $x$:
  - $x[\text{acrossVarIndex} + 0]$: $P_x$
  - $x[\text{acrossVarIndex} + 1]$: $P_y$
  - $x[\text{acrossVarIndex} + 2]$: $P_z$
  - $x[\text{acrossVarIndex} + 3]$: $\theta_x$ (rad)
  - $x[\text{acrossVarIndex} + 4]$: $\theta_y$ (rad)
  - $x[\text{acrossVarIndex} + 5]$: $\theta_z$ (rad)

### 3.2 World Frame Pinning
- In `DAEAssembler.ts`, add `'world_frame'` to the reference scan:
  - If a node is `world_frame`, its root is added to `referenceNodeIds`.
  - In `residuals()`:
    $$res[\text{acrossVarIndex} + k] = x[\text{acrossVarIndex} + k] - 0, \quad k \in \{0, 1, 2, 3, 4, 5\}$$
  - This strictly maintains the global inertial frame at $[0, 0, 0, 0, 0, 0]$ with zero drift.

### 3.3 Scope & Signal Mapping
- Signal output ports of `transform_sensor` (`x`, `y`, `z`, `rx`, `ry`, `rz`) and constraints (`d`, `f_reac`, `ang`, `t_reac`) map directly to their corresponding branch variables in `scopeOutputs`.

---

## 4. Governing Equations & Physics

### 4.1 Vector & Angle Parsing
- `parseVector3(strOrArr, defaultArr)` converts strings like `"[1 2 3]"`, `"[1, 2, 3]"`, `"1 2 3"` or arrays into `[number, number, number]`.
- Convert degrees to radians for internal equations: $\theta_{\text{rad}} = \theta_{\text{deg}} \times \frac{\pi}{180}$.
- Convert radians to degrees for sensor physical signal outputs: $\theta_{\text{deg}} = \theta_{\text{rad}} \times \frac{180}{\pi}$.

### 4.2 `rigid_transform` Equations
- Base frame: $\mathbf{P}_b, \mathbf{\theta}_b$. Follower frame: $\mathbf{P}_f, \mathbf{\theta}_f$.
- Parameters: $\mathbf{P}_{\text{off}} = \text{parseVector3}(params.offset)$, $\mathbf{\theta}_{\text{off}} = \text{parseVector3}(params.rotation) \times \frac{\pi}{180}$.
- Rotation Matrix $\mathbf{R}(\mathbf{\theta}_b)$ (Euler angles $R_x, R_y, R_z$):
  $$\mathbf{P}_{\text{expected}} = \mathbf{P}_b + \mathbf{R}(\mathbf{\theta}_b) \cdot \mathbf{P}_{\text{off}}$$
  $$\mathbf{\theta}_{\text{expected}} = \mathbf{\theta}_b + \mathbf{\theta}_{\text{off}}$$
- Residuals:
  $$res[0..2] = \mathbf{P}_f - \mathbf{P}_{\text{expected}}$$
  $$res[3..5] = \mathbf{\theta}_f - \mathbf{\theta}_{\text{expected}}$$

### 4.3 `dist_constraint` Equations
- Base frame: $\mathbf{P}_b$. Follower frame: $\mathbf{P}_f$.
- Actual 3D Euclidean distance:
  $$d_{\text{actual}} = \sqrt{(P_{f,x} - P_{b,x})^2 + (P_{f,y} - P_{b,y})^2 + (P_{f,z} - P_{b,z})^2 + \varepsilon}$$
- Target distance:
  $$d_{\text{target}} = params.dist !== undefined ? Number(params.dist) : 1.0$$
- Kinematic residual:
  $$res_{\text{kinematic}} = d_{\text{actual}} - d_{\text{target}}$$
- Signal outputs for Scope:
  $$res_{\text{signal\_d}} = \text{branch}[signal\_d] - d_{\text{actual}}$$
  $$res_{\text{signal\_f}} = \text{branch}[signal\_f] - |F_{\text{reac}}|$$

### 4.4 `angle_constraint` Equations
- Actual relative orientation angle:
  $$\theta_{\text{actual}} = \|\mathbf{\theta}_f - \mathbf{\theta}_b\|$$
- Target angle:
  $$\theta_{\text{deg}} = params.angle !== undefined ? Number(params.angle) : 0.0$$
  $$\theta_{\text{target}} = \theta_{\text{deg}} \times \frac{\pi}{180}$$
- Kinematic residual:
  $$res_{\text{kinematic}} = \theta_{\text{actual}} - \theta_{\text{target}}$$
- Signal outputs for Scope:
  $$res_{\text{signal\_ang}} = \text{branch}[signal\_ang] - (\theta_{\text{actual}} \times \frac{180}{\pi})$$
  $$res_{\text{signal\_t}} = \text{branch}[signal\_t] - |T_{\text{reac}}|$$

### 4.5 `transform_sensor` Equations
- Reads $\mathbf{T}_b$ (defaults to zero frame if unconnected) and $\mathbf{T}_f$.
- Computes:
  $$\Delta \mathbf{P} = \mathbf{P}_f - \mathbf{P}_b$$
  $$\Delta \mathbf{\theta} = (\mathbf{\theta}_f - \mathbf{\theta}_b) \times \frac{180}{\pi}$$
- Equates branches:
  $$branch[\text{signal\_x}] = \Delta P_x, \quad branch[\text{signal\_y}] = \Delta P_y, \quad branch[\text{signal\_z}] = \Delta P_z$$
  $$branch[\text{signal\_rx}] = \Delta \theta_x, \quad branch[\text{signal\_ry}] = \Delta \theta_y, \quad branch[\text{signal\_rz}] = \Delta \theta_z$$

---

## 5. Testing & Certification Strategy

### 5.1 Unit & Integration Tests (`src/engine/vlab/vlab_multibody_frames.test.ts`)
1. **Domain Validation:**
   - Verify `isValidVLabPortDomain('Frame')` and `isValidVLabPortDomain('MultibodyFrame')`.
   - Verify connection rules prevent connecting Frame to incompatible domains while allowing Scope and Sensors.
2. **Kinematic Rigid Transform & Transform Sensor:**
   - Topology: `world_frame` $\to$ `rigid_transform(offset=[1, 2, 3], rotation=[0, 0, 90])` $\to$ `transform_sensor` $\to$ `scope`.
   - Verify World variables remain at $[0, 0, 0, 0, 0, 0]$.
   - Verify Scope outputs: $X=1, Y=2, Z=3, Rx=0, Ry=0, Rz=90$.
   - Mutate parameters to `offset=[5, 10, 15]`, `rotation=[45, 0, 0]` and verify Scope tracks the change.
3. **Distance Constraint Precision:**
   - Verify `dist = 2` yields `d = 2` on Scope.
   - Verify `dist = 0` yields `d = 0` (zero handling).
4. **Angle Constraint Precision:**
   - Verify `angle = 90` yields `90°` on Scope channel.
5. **Benchmark B39 Reproduction & Certification:**
   - Full end-to-end model reproducing the exact user case, ensuring zero drift on world and accurate Scope channel outputs.
