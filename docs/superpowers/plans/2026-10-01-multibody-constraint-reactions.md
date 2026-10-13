# Multibody Constraint Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Couple distance and angle constraint multipliers to complete 3D Frame equilibrium, return stable reaction measurements, and reject structurally redundant constraints before nonlinear solving.

**Architecture:** Each constraint owns an internal scalar lambda plus three port-associated force or torque branches. Pure kinematics helpers calculate distance direction and relative angle-axis; block residuals map lambda onto spatial reaction components, while existing per-coordinate Frame Kirchhoff equations determine lambda from load balance. A focused topology validator rejects fully prescribed or duplicate constraints before the solver.

**Tech Stack:** TypeScript, Vitest, React Flow Node/Edge, VLab DAEAssembler, ImplicitSolver.

## Global Constraints

- Preserve Frame/MultibodyFrame ports and public outputs d, f_reac, ang, and t_reac.
- Preserve metres, degrees, newtons, and newton-metres as output units.
- Keep the explicit undefined check for dist = 0.
- Read angle in degrees and convert to radians internally.
- Public reaction outputs equal abs(lambda).
- Fully prescribed or duplicate constraints fail before ImplicitSolver.
- Do not touch or stage unrelated SysML working-tree changes.

---

## File Map

- Modify src/engine/vlab/vlabFrameKinematics.ts: vector normalization and matrix angle-axis.
- Modify src/engine/vlab/vlabEquations.ts: multiplier-to-wrench residuals.
- Modify src/engine/vlab/DAEAssembler.ts: branch allocation, Frame balance, diagnostic call.
- Create src/engine/vlab/vlabConstraintDiagnostics.ts: topology validation and typed errors.
- Create src/engine/vlab/vlab_constraint_reactions.test.ts: focused unit/integration coverage.
- Modify src/engine/vlab/vlab_multibody_frames.test.ts: valid reaction cases and redundant B39 diagnostic.
- Modify src/engine/vlab/vlabComponentDefinitions.ts: displayed physical equations.

---

### Task 1: Stable Constraint Geometry

**Files:**
- Modify: src/engine/vlab/vlabFrameKinematics.ts
- Create: src/engine/vlab/vlab_constraint_reactions.test.ts

**Interfaces:**
- Produces: normalizeVector3(vector: Vector3, tolerance?: number): NormalizedVector3.
- Produces: computeRelativeAngleAxis(base: Vector3, follower: Vector3, tolerance?: number): RelativeAngleAxis.

- [ ] **Step 1: Write failing geometry tests**

Create tests importing normalizeVector3 and computeRelativeAngleAxis. Assert:

    normalizeVector3([0, 3, 4])
      => { unit: [0, 0.6, 0.8], magnitude: 5, defined: true }

    normalizeVector3([0, 0, 0])
      => { unit: [0, 0, 0], magnitude: 0, defined: false }

    computeRelativeAngleAxis([0,0,0], [0, PI/2, 0])
      => angle PI/2, axis [0,1,0], axisDefined true

    computeRelativeAngleAxis([0,0,0], [0,0,0])
      => angle 0, axis [0,0,0], axisDefined false

    computeRelativeAngleAxis([0,0,0], [0,0,PI])
      => finite angle PI and abs(axis.z) near 1

Use toBeCloseTo(..., 10) for floating-point assertions.

- [ ] **Step 2: Verify RED**

Run:

    npx vitest run src/engine/vlab/vlab_constraint_reactions.test.ts --reporter=verbose

Expected: FAIL because both helpers are not exported.

- [ ] **Step 3: Implement normalization**

Add these public types and function:

    export type Vector3 = [number, number, number];

    export interface NormalizedVector3 {
      unit: Vector3;
      magnitude: number;
      defined: boolean;
    }

    export function normalizeVector3(v: Vector3, tolerance = 1e-12): NormalizedVector3 {
      const magnitude = Math.hypot(v[0], v[1], v[2]);
      if (magnitude <= tolerance) {
        return { unit: [0, 0, 0], magnitude: 0, defined: false };
      }
      return {
        unit: [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude],
        magnitude,
        defined: true,
      };
    }

- [ ] **Step 4: Implement matrix-based angle-axis**

Add RelativeAngleAxis, transpose3, multiply3, and computeRelativeAngleAxis. Compute:

    Rrel = transpose(eulerToRotationMatrix(base)) * eulerToRotationMatrix(follower)
    cosine = clamp((trace(Rrel) - 1) / 2, -1, 1)
    angle = acos(cosine)

For angle <= 1e-10, return zero axis and axisDefined false. For PI - angle <= 1e-10, recover component magnitudes from sqrt(max(0, (Rii + 1) / 2)), apply signs from the skew terms, then normalize. Otherwise divide the skew vector by 2*sin(angle) and normalize. Change computeRelativeAngle to return computeRelativeAngleAxis(...).angle.

- [ ] **Step 5: Verify GREEN and commit**

Run the Step 2 command. Expected: all geometry tests PASS.

    git add -- src/engine/vlab/vlabFrameKinematics.ts src/engine/vlab/vlab_constraint_reactions.test.ts
    git commit -m "fix(vlab): compute stable multibody constraint geometry"

---

### Task 2: Map Scalar Multipliers to Spatial Reactions

**Files:**
- Modify: src/engine/vlab/vlabEquations.ts
- Modify: src/engine/vlab/vlab_constraint_reactions.test.ts

**Interfaces:**
- Distance order: [lambda, fx, fy, fz, signal_d?, signal_f?].
- Angle order: [lambda, tx, ty, tz, signal_ang?, signal_t?].
- Consumes helpers from Task 1.

- [ ] **Step 1: Add failing equation tests**

Call real blockEquations with full BlockEquationArgs. Required assertions:

    dist frames: B=[0,0,0,...], F=[0,3,4,...]
    dist target: 5
    branch: [10, 0, 6, 8, 5, 10]
    expected residuals: [0,0,0,0,0,0]

    angle frames: B rotation=[0,0,0], F rotation=[0,PI/2,0]
    angle target: 90
    branch: [12, 0, 12, 0, 90, 12]
    expected every residual abs(value) < 1e-10

Add degenerate cases with coincident frames and lambda 7/9. Assert the multiplier residual equals 7/9 so the equation explicitly drives lambda to zero.

- [ ] **Step 2: Verify RED**

Run the focused Vitest file. Expected: FAIL due to old fixed-axis reaction and output indices.

- [ ] **Step 3: Implement dist_constraint residuals**

Use asFrame for B/F and normalizeVector3(F.position - B.position). Return equations in this exact order:

    distance - target
    fx - lambda*n.x
    fy - lambda*n.y
    fz - lambda*n.z
    signal_d - distance, if port d exists
    signal_f - abs(lambda), if port f_reac exists

When direction is undefined and target is zero, replace the first mapping residual with lambda and keep the remaining spatial branches pinned to zero. If target is nonzero, throw a MultibodyConstraintDiagnosticError with code UNDEFINED_DIRECTION after Task 4 introduces that type. Until Task 4, throw an Error whose message includes block ID and undefined distance direction.

- [ ] **Step 4: Implement angle_constraint residuals**

Use computeRelativeAngleAxis and params.angle * PI/180. Return:

    relative.angle - target
    tx - lambda*axis.x
    ty - lambda*axis.y
    tz - lambda*axis.z
    signal_ang - relative.angle*180/PI, if ang exists
    signal_t - abs(lambda), if t_reac exists

At undefined zero-angle axis with zero target, explicitly return lambda as one mapping residual and pin remaining torque components to zero. A nonzero target with undefined axis must produce the Task 4 diagnostic.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused test. Expected: all tests PASS.

    git add -- src/engine/vlab/vlabEquations.ts src/engine/vlab/vlab_constraint_reactions.test.ts
    git commit -m "fix(vlab): map constraint multipliers to spatial reactions"

---

### Task 3: Wire Reactions into 6-DOF Frame Equilibrium

**Files:**
- Modify: src/engine/vlab/DAEAssembler.ts
- Modify: src/engine/vlab/vlab_constraint_reactions.test.ts

**Interfaces:**
- Internal branch lambda has ports: [].
- Spatial branches retain existing b=-1, f=+1 signs.
- Uses Task 2 branch order exactly.

- [ ] **Step 1: Add failing branch-layout tests**

Assemble a standalone distance block and assert variable names:

    d1_branch_lambda
    d1_branch_fx
    d1_branch_fy
    d1_branch_fz
    d1_branch_signal_d
    d1_branch_signal_f

Do the equivalent for angle using lambda, tx, ty, tz, signal_ang, signal_t.

- [ ] **Step 2: Verify RED**

Run the focused test. Expected: FAIL because current assembler allocates only force or torque.

- [ ] **Step 3: Replace component specifications**

For distance allocate:

    { name: 'lambda', ports: [] }
    { name: 'fx', ports: [{id:'b',sign:-1},{id:'f',sign:1}] }
    { name: 'fy', ports: [{id:'b',sign:-1},{id:'f',sign:1}] }
    { name: 'fz', ports: [{id:'b',sign:-1},{id:'f',sign:1}] }

Append signal_d and signal_f only when their ports exist.

For angle allocate the same internal lambda followed by tx, ty, tz with the same port signs, then optional signal_ang and signal_t.

Do not change the Frame Kirchhoff mapper: it already maps fx/fy/fz to coordinates 0..2 and tx/ty/tz to 3..5.

- [ ] **Step 4: Verify GREEN and commit**

Run:

    npx vitest run src/engine/vlab/vlab_constraint_reactions.test.ts src/engine/vlab/vlab_multibody_frames.test.ts --reporter=verbose

Expected: branch-layout tests PASS. The old redundant B39 case may fail until Task 4.

    git add -- src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlab_constraint_reactions.test.ts
    git commit -m "fix(vlab): connect constraint reactions to frame equilibrium"

---

### Task 4: Deterministic Constraint Diagnostics

**Files:**
- Create: src/engine/vlab/vlabConstraintDiagnostics.ts
- Modify: src/engine/vlab/DAEAssembler.ts
- Modify: src/engine/vlab/vlabEquations.ts
- Modify: src/engine/vlab/vlab_multibody_frames.test.ts
- Modify: src/engine/vlab/vlab_constraint_reactions.test.ts

**Interfaces:**
- ConstraintDiagnosticCode = FULLY_PRESCRIBED | DUPLICATE_CONSTRAINT | UNDEFINED_DIRECTION.
- MultibodyConstraintDiagnosticError exposes code, blockId, frameNodeIds.
- validateMultibodyConstraintTopology(constraints, prescribedRoots): void.

- [ ] **Step 1: Add failing diagnostic tests**

Test that a constraint from frame-a to frame-b throws FULLY_PRESCRIBED when both roots are in prescribedRoots. Test that two distance constraints between a/b and b/a throw DUPLICATE_CONSTRAINT and name both block IDs. Test undefined nonzero-distance and nonzero-angle axes through the real equation factories and assert UNDEFINED_DIRECTION.

- [ ] **Step 2: Convert redundant B39 expectation**

Rename the existing B39 case to:

    rejects B39 topology when both constrained frames are already prescribed

Replace its simulation assertions with:

    expect(() => engine.simulateStep(nodes, edges, null, 0.001))
      .toThrow(/dist_c.*fully prescribed.*release.*degree of freedom/i)

Keep separate valid nonredundant tests for 2 m, 90 degrees, zero World drift, and reaction outputs.

- [ ] **Step 3: Verify RED**

Run both multibody test files. Expected: failures because assembly reaches ImplicitSolver.

- [ ] **Step 4: Create typed diagnostic module**

Define:

    export type ConstraintDiagnosticCode =
      | 'FULLY_PRESCRIBED'
      | 'DUPLICATE_CONSTRAINT'
      | 'UNDEFINED_DIRECTION';

    export interface ConstraintTopology {
      blockId: string;
      type: 'dist_constraint' | 'angle_constraint';
      baseRoot: string;
      followerRoot: string;
    }

    export class MultibodyConstraintDiagnosticError extends Error {
      constructor(
        public readonly code: ConstraintDiagnosticCode,
        public readonly blockId: string,
        public readonly frameNodeIds: [string, string],
        message: string,
      ) {
        super(message);
        this.name = 'MultibodyConstraintDiagnosticError';
      }
    }

validateMultibodyConstraintTopology must:

1. Reject when both roots are prescribed.
2. Canonicalize endpoint order and reject an identical type/root-pair key already seen.
3. Include current and original block IDs in duplicate messages.
4. Include corrective guidance to remove a constraint or release a DOF.

- [ ] **Step 5: Integrate topology validation**

After union-find and reference roots exist:

1. Collect b/f union roots for every distance/angle block.
2. Seed prescribedFrameRoots with Frame roots in referenceNodeIds.
3. Repeatedly propagate prescription through rigid_transform endpoints until no root is added.
4. Call validateMultibodyConstraintTopology before constructing/running solver residuals.
5. Never catch and replace MultibodyConstraintDiagnosticError with zero residuals.

Change Task 2 temporary errors to typed UNDEFINED_DIRECTION errors.

- [ ] **Step 6: Verify GREEN and commit**

Run the two multibody tests. Expected: diagnostics PASS and no ImplicitSolver convergence log appears for rejected models.

    git add -- src/engine/vlab/vlabConstraintDiagnostics.ts src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlabEquations.ts src/engine/vlab/vlab_multibody_frames.test.ts src/engine/vlab/vlab_constraint_reactions.test.ts
    git commit -m "fix(vlab): diagnose redundant multibody constraints"

---

### Task 5: End-to-End Reaction Certification

**Files:**
- Modify: src/engine/vlab/vlab_constraint_reactions.test.ts
- Modify: src/engine/vlab/vlab_multibody_frames.test.ts

**Interfaces:**
- Consumes stable public outputs and typed diagnostics from Tasks 2-4.
- Valid test models must leave at least one relevant Frame coordinate free.

- [ ] **Step 1: Add zero-reaction models**

Build separate valid distance and angle topologies. Route measurement and reaction ports to two-channel Scopes. Run three steps and assert:

    distance == targetDistance within 1e-8
    f_reac == 0 within 1e-8
    angle == targetAngleDegrees within 1e-8
    t_reac == 0 within 1e-8

Spy on console.error and assert no message contains ImplicitSolver Convergence Failure.

- [ ] **Step 2: Verify RED if any behavior is still absent**

Run focused tests. Any new test must fail for the missing behavior, not from malformed topology.

- [ ] **Step 3: Add known-load non-X cases**

Connect external_force parallel to a distance direction [0, 3, 4] and an applied torque parallel to a relative Y or Z axis. Assert reaction magnitudes equal the applied load within 1e-6. Inspect solution variables by name and assert component balance on fy/fz and ty/tz, including equal/opposite signs at B and F.

- [ ] **Step 4: Run focused certification**

Run:

    npx vitest run src/engine/vlab/vlab_constraint_reactions.test.ts src/engine/vlab/vlab_multibody_frames.test.ts src/engine/vlab/vlab_multibody_forces.test.ts --reporter=verbose

Expected: all PASS, finite reactions, no convergence warning, no solver fallback.

- [ ] **Step 5: Commit**

    git add -- src/engine/vlab/vlab_constraint_reactions.test.ts src/engine/vlab/vlab_multibody_frames.test.ts
    git commit -m "test(vlab): certify stable multibody constraint reactions"

---

### Task 6: Metadata and Final Verification

**Files:**
- Modify: src/engine/vlab/vlabComponentDefinitions.ts
- Modify design spec only if implementation required an approved correction.

**Interfaces:**
- UI equations must match implemented spatial physics.

- [ ] **Step 1: Update displayed equations**

Use these equations:

    dist_constraint:
      |Pf - Pb| = L_set
      Ff = lambda * (Pf - Pb) / |Pf - Pb|
      Fb = -Ff

    angle_constraint:
      angle(transpose(Rb) * Rf) = Theta_set
      Tf = lambda * axis(Rrel)
      Tb = -Tf

Retain existing units and descriptions.

- [ ] **Step 2: Run complete relevant verification**

    npx vitest run src/engine/vlab/vlab_constraint_reactions.test.ts src/engine/vlab/vlab_multibody_frames.test.ts src/engine/vlab/vlab_multibody_forces.test.ts --reporter=verbose
    npm run test:vlab
    npx tsc --noEmit
    git diff --check

Expected: all commands exit 0. Valid models emit no convergence failure or solver fallback.

- [ ] **Step 3: Inspect scope and working tree**

    git status --short
    git diff -- src/engine/vlab/vlabFrameKinematics.ts src/engine/vlab/vlabEquations.ts src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlabConstraintDiagnostics.ts src/engine/vlab/vlab_constraint_reactions.test.ts src/engine/vlab/vlab_multibody_frames.test.ts src/engine/vlab/vlabComponentDefinitions.ts

Expected: only task-related VLab changes in the targeted diff. Pre-existing SysML changes remain untouched.

- [ ] **Step 4: Commit metadata**

    git add -- src/engine/vlab/vlabComponentDefinitions.ts
    git commit -m "docs(vlab): describe spatial constraint reactions"

