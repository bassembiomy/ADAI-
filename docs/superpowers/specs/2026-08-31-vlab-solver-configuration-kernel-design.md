# ADIA V-Lab — Solver Configuration & Physical Network Simulation Kernel (Phase 1 Design Document)

**Date:** 2026-08-31  
**Status:** Approved Specification (Phase 1)  
**Author:** ADIA Architecture & Core Engineering  

---

## Architectural Principle

> **V-Lab shall be an equation-based physical modeling and simulation kernel, not a collection of UI blocks with numerical calculations attached. The physical model, compiled equations, initialization system, solver engine, and visualization layer shall remain independently testable and replaceable.**

---

## 1. Executive Summary & Objectives

This document specifies the architecture, data contracts, mathematical compilation pipeline, numerical solver abstractions, diagnostic system, and verification suite for **Phase 1** of **ADIA V-Lab**.

Inspired by physical-network simulation tools such as MATLAB Simscape, V-Lab allows engineers to construct multi-domain physical systems from components connected via physical/conserving ports.

### Phase 1 Scope:
1. **Physical Network Extraction:** Automatic partitioning of disjoint physical subgraphs and identification of node potentials.
2. **Intermediate Representation (PhysicalSystemIR):** A domain-independent, traceable intermediate representation decoupling the UI from numerical solvers.
3. **Equation Compilation:** Direct generation of constitutive, Kirchhoff Across/Through conservation, reference, and boundary equations in non-string residual vector form $F(t, x, \dot{x}, z, u) = 0$.
4. **Initialization & Consistency Engine:** Topological checking, domain/variable compatibility validation, reference grounding, and algebraic consistency solving at $t = t_0$.
5. **Pluggable Solver Suite:** Clear separation between Explicit ODE solvers (`Euler`, `RK4`, `AdaptiveRK`) and Implicit/DAE solvers (`BDF`, `ImplicitDAESolver`) with linear solver abstraction (`DenseLU`, `SparseLU`).
6. **Deterministic Diagnostics:** Error/warning codes (`VL-PORT-xxx`, `VL-NET-xxx`, `VL-REF-xxx`, `VL-SOLVER-xxx`, `VL-EQ-xxx`, `VL-INIT-xxx`, `VL-CONV-xxx`).
7. **Solver Configuration Component & UI:** Dedicated `solver_config` block and parameter inspector for network-scoped simulation control.
8. **End-to-End Electrical RLC Verification Suite:** Cross-solver accuracy matrix, timestep convergence testing ($h, h/2, h/4$), KCL residual checks, and failure/recovery unit tests against closed-form analytical benchmarks.

---

## 2. System Architecture & Layering

```
                     ADIA V-LAB Visual Workspace
                                 │
                 (ReactFlow Graph: Nodes & Edges)
                                 │
                                 ▼
                     PhysicalNetworkExtractor
                                 │
                 (Disjoint Physical Networks + Topology)
                                 │
                                 ▼
                     PhysicalSystemCompiler
                                 │
                     (Domain-Independent IR)
                                 │
                                 ▼
                       Equation Assembler
                                 │
             (Executable Residuals: F(t, x, dx, z, u) = 0)
                                 │
                                 ▼
                       Initialization Engine
                                 │
               (Consistency Check & Initial State Solving)
                                 │
                                 ▼
                          SimulationJob
                                 │
                 (PhysicalSystemIR + SolverConfiguration)
                                 │
                                 ▼
                           SolverManager
                                 │
                   (System Analysis & Dispatch)
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
         ExplicitODESolver                 ImplicitDAESolver
        ┌───────┼───────┐                         │
        ▼       ▼       ▼                         ▼
      Euler    RK4  AdaptiveRK              Newton-Raphson
                                                  │
                                                  ▼
                                             LinearSolver
                                            ┌─────┴─────┐
                                            ▼           ▼
                                         DenseLU     SparseLU
                                                  │
                                                  ▼
                                           Step Controller
                                            (LTE / Rejection)
                                 │
                                 ▼
                          SimulationResult
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
         Waveforms & UI     Diagnostics     V&V Evidence
```

---

## 3. Data Contracts & Interfaces

### 3.1 Domain & Variable Definitions (`src/engine/vlab/kernel/types.ts`)

```typescript
export type PhysicalDomain =
  | 'electrical'
  | 'rotational'
  | 'translational'
  | 'thermal'
  | 'fluid'
  | 'gas';

export type VariableRole = 'across' | 'through' | 'state' | 'algebraic' | 'input' | 'output';

export interface PhysicalVariable {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  role: VariableRole;
  value?: number;
}

export interface PhysicalPort {
  id: string;
  name: string;
  domain: PhysicalDomain;
  variables: PhysicalVariable[];
  nodeId?: string;
  reference?: {
    required: boolean;
    value?: number;
  };
}

export interface PhysicalNode {
  id: string;
  domain: PhysicalDomain;
  portIds: string[];
  reference?: boolean;
  referenceValue?: number;
}

export interface PhysicalConnection {
  id: string;
  fromPortId: string;
  toPortId: string;
  nodeId: string;
}
```

### 3.2 Component, Parameter & State Metadata

```typescript
export interface Parameter {
  id: string;
  name: string;
  value: number;
  unit?: string;
  componentId: string;
  min?: number;
  max?: number;
  tunable?: boolean;
}

export interface StateVariable {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  initialValue?: number;
  derivativeVariableId?: string;
  sourceComponentId: string;
  preferred: boolean;
}

export interface AlgebraicVariable {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  sourceComponentId?: string;
  sourceNodeId?: string;
}

export interface IRComponent {
  id: string;
  type: string;
  name: string;
  ports: PhysicalPort[];
  parameters: Parameter[];
  sourceModelNodeId?: string;
}
```

### 3.3 Equation Metadata & Compiled System

```typescript
export type EquationType =
  | 'constitutive'
  | 'conservation'
  | 'connection'
  | 'reference'
  | 'initial_condition'
  | 'constraint';

export interface Equation {
  id: string;
  expression: string;
  type: EquationType;
  componentIds: string[];
  variableIds: string[];
  domain: PhysicalDomain;
  residualForm: string;
}

export interface SolverContext {
  t: number;
  dt: number;
  order?: number;
  prevStates?: Float64Array;
  prevPrevStates?: Float64Array;
  prevDt?: number;
  parameters: Record<string, number>;
  inputs: Record<string, number>;
}

export interface CompiledPhysicalSystem {
  id: string;
  domains: PhysicalDomain[];
  stateCount: number;
  algebraicCount: number;
  totalSize: number;
  isDifferentialState: boolean[];
  variableNames: string[];

  // Evaluates F(t, x, dx, z, ctx) -> out
  residual(
    t: number,
    x: Float64Array,
    dx: Float64Array,
    z: Float64Array,
    ctx: SolverContext,
    out: Float64Array
  ): void;

  // Evaluates Jacobian J = dF/dW where W = [x, z]
  jacobian?(
    t: number,
    x: Float64Array,
    dx: Float64Array,
    z: Float64Array,
    ctx: SolverContext,
    out: Float64Array
  ): void;
}
```

### 3.4 PhysicalSystemIR & PhysicalNetwork

```typescript
export interface PhysicalNetwork {
  id: string;
  domains: PhysicalDomain[];
  componentIds: string[];
  portIds: string[];
  nodeIds: string[];
  referenceNodeIds: string[];
  connections: PhysicalConnection[];
  solverConfigurationId?: string;
  topologyHash: string;
}

export interface PhysicalSystemIR {
  id: string;
  domains: PhysicalDomain[];
  components: IRComponent[];
  nodes: PhysicalNode[];
  states: StateVariable[];
  algebraicVariables: AlgebraicVariable[];
  parameters: Parameter[];
  equations: Equation[];
  connections: PhysicalConnection[];
  references: PhysicalNode[];
  metadata: {
    nodeCount: number;
    stateCount: number;
    algebraicCount: number;
    hasNonlinearities: boolean;
    isStiff: boolean;
    isDAE: boolean;
  };
}
```

### 3.5 Solver Configuration & Simulation Job

```typescript
export type SolverType = 'auto' | 'euler' | 'rk4' | 'rk_adaptive' | 'bdf' | 'dae_implicit';

export interface SolverConfiguration {
  id: string;
  solver: SolverType;
  startTime: number;
  stopTime: number;
  initialStep: number | 'auto';
  minimumStep: number | 'auto';
  maximumStep: number | 'auto';
  relativeTolerance: number;
  absoluteTolerance: number;
  maximumIterations: number;
  nonlinearTolerance: number;
  enableDiagnostics: boolean;
  enableLogging: boolean;
}

export interface SimulationJob {
  id: string;
  networkId: string;
  system: PhysicalSystemIR;
  compiledSystem: CompiledPhysicalSystem;
  solverConfiguration: SolverConfiguration;
}
```

---

## 4. Pipeline & Engines

### 4.1 Physical Network Extraction
1. **Component & Port Scan:** Extract all physical components, port definitions, and variable contracts. Filter out purely algorithmic signal blocks.
2. **Union-Find Graph Partitioning:** Identify connected subgraphs across physical ports. Each disjoint subgraph is isolated as a distinct `PhysicalNetwork` with a deterministic ID.
3. **Port Connectivity Validation:** Flag dangling ports (`VL-PORT-001`), domain mismatches (`VL-PORT-002`), and incompatible across/through variables (`VL-PORT-003`).
4. **Node Allocation & Reference Resolution:** Merge co-located ports into a single `PhysicalNode`. Verify required domain reference existence (`VL-REF-001`).
5. **Solver Configuration Association:** Logically associate each network with its configuration block. Verify that exactly one configuration exists per network (`VL-SOLVER-001`, `VL-SOLVER-002`).

### 4.2 Equation Compilation
1. **Constitutive Equations:**
   - Resistor: $V_p - V_n - R \cdot I = 0$
   - Capacitor: $I - C \cdot \dot{V}_C = 0$ and $V_p - V_n - V_C = 0$
   - Inductor: $V_p - V_n - L \cdot \dot{I}_L = 0$ and $I_{branch} - I_L = 0$
   - DC Voltage Source: $V_p - V_n - V_{src} = 0$
   - AC Voltage Source: $V_p - V_n - V_0 \sin(\omega t + \phi) = 0$
   - Reference: $V_{ref} = 0$
2. **Conservation (KCL) Equations:**
   - For each non-reference node $j$:
     $$\sum_{k \in \text{connected ports}} \sigma_k I_k = 0$$
3. **Structural Rank & Equation Analysis:**
   - Detect structurally under-constrained systems (`VL-EQ-001`).
   - Detect over-constrained systems, e.g., parallel ideal voltage sources (`VL-EQ-002`).
   - Warn on ill-conditioned Jacobians (`VL-EQ-003`).
4. **Direct Numerical Compilation:**
   - Compile into high-performance Float64 residual closures. **Zero string parsing or regex inside the simulation loop.**

### 4.3 Initialization Engine
1. **Initial Condition Provenance:** Track user-specified, default, and computed initial values.
2. **Algebraic Consistency Solve:**
   - Solve $F(t_0, x_0, \dot{x}_0, z_0, u_0) = 0$ at $t = t_0$ using damped Newton-Raphson.
   - If inconsistent or singular, fail with deterministic diagnostic `VL-INIT-001`.

---

## 5. Solver Engine & Solvers

### 5.1 Architecture & Hierarchy

```typescript
export interface LinearSolver {
  factorize(A: number[][], n: number): boolean;
  solve(b: number[]): number[];
}
```

```typescript
export interface ISolver {
  readonly id: string;
  readonly name: string;
  readonly supportsDAE: boolean;

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState;

  step(
    state: SolverState,
    targetTime: number
  ): SolverStepResult;

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult;

  terminate(): void;
}
```

### 5.2 Solvers Implemented in Phase 1

1. **`EulerSolver` (Explicit ODE):**
   - Forward Euler: $x_{n+1} = x_n + h f(t_n, x_n, u_n)$
   - Fast baseline for non-stiff verification.
2. **`RK4Solver` (Explicit ODE):**
   - Classical 4th-order Runge-Kutta.
3. **`AdaptiveRKSolver` (Explicit ODE):**
   - Dormand-Prince (RK45) / Fehlberg embedded pair with automatic step adjustment and local truncation error (LTE) monitoring.
4. **`BDFSolver` / `ImplicitDAESolver` (Implicit DAE):**
   - Variable-order BDF-1 (Backward Euler) and BDF-2.
   - Damped Newton-Raphson with backtracking line search.
   - Modular `LinearSolver` (`DenseLU` default in Phase 1, `SparseLU` ready).
   - Numerical / Analytical Jacobian evaluation with step rejection on convergence failure.

### 5.3 Auto Solver Recommendation Engine

The `SystemAnalyzer` analyzes the compiled IR:
1. **DAE with Algebraic Constraints:** Recommends `bdf` (Implicit DAE).
2. **Stiff ODE (High time constant ratios or stiff parameters):** Recommends `bdf`.
3. **Smooth Non-Stiff ODE:** Recommends `rk_adaptive`.

### 5.4 Step Controller, Event Handling & Error Recovery
- **Step Size Bounds:** $h_{\min} \le h \le h_{\max}$.
- **LTE Calculation:**
  $$\text{LTE}_i = \frac{|x_{n+1, i}^{(\text{high})} - x_{n+1, i}^{(\text{low})}|}{\text{RelTol} \cdot |x_{n+1, i}| + \text{AbsTol}}$$
- **Step Rejection:** If non-convergent or $\text{LTE} > 1.0$, cut step $h \gets 0.5 h$. If $h < h_{\min}$, terminate simulation with `VL-CONV-002`.

---

## 6. Deterministic Diagnostics Registry

| ID | Severity | Name | Description |
|---|---|---|---|
| **`VL-PORT-001`** | `WARNING` | Unconnected Port | Physical port is unconnected. |
| **`VL-PORT-002`** | `ERROR` | Domain Mismatch | Incompatible domains connected directly. |
| **`VL-PORT-003`** | `ERROR` | Incompatible Variables | Across/Through variable contract mismatch. |
| **`VL-NET-001`** | `ERROR` | Floating Network | Network lacks consistent topology. |
| **`VL-REF-001`** | `ERROR` | Missing Reference | Required domain reference (e.g. Ground) is missing. |
| **`VL-SOLVER-001`** | `ERROR` | Missing Solver Config | Physical network has no `Solver Configuration` block. |
| **`VL-SOLVER-002`** | `ERROR` | Multiple Solver Configs | Multiple `Solver Configuration` blocks in one network. |
| **`VL-EQ-001`** | `ERROR` | Under-Constrained System | More unknowns than independent equations. |
| **`VL-EQ-002`** | `ERROR` | Over-Constrained System | Conflicting constitutive constraints detected. |
| **`VL-EQ-003`** | `WARNING` | Ill-Conditioned System | Jacobian conditioning number exceeds numerical thresholds. |
| **`VL-EQ-004`** | `ERROR` | Equation Generation Error | Compilation failed for component equations. |
| **`VL-INIT-001`** | `ERROR` | Initialization Failure | Newton consistency solve failed at $t=t_0$. |
| **`VL-INIT-002`** | `ERROR` | Conflicting Init Conditions | Incompatible user-assigned initial states. |
| **`VL-CONV-001`** | `WARNING` | Convergence Step Cut | Step size reduced to maintain convergence. |
| **`VL-CONV-002`** | `ERROR` | Convergence Failure | Solver failed to converge at $h_{\min}$. |

---

## 7. Results & Statistics Contract

```typescript
export interface SolverStatistics {
  simulationTime: number;
  cpuTimeMs: number;
  acceptedSteps: number;
  rejectedSteps: number;
  newtonIterations: number;
  maxResidual: number;
  minStepUsed: number;
  maxStepUsed: number;
  functionEvaluations: number;
  jacobianEvaluations: number;
  convergenceStatus: 'CONVERGED' | 'WARNING' | 'FAILED';
}

export interface SimulationResult {
  jobId: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED' | 'CANCELLED';
  time: number[];
  states: Record<string, number[]>;
  algebraicVariables: Record<string, number[]>;
  outputs: Record<string, number[]>;
  solverStatistics: SolverStatistics;
  diagnostics: Diagnostic[];
}
```

---

## 8. Electrical RLC Reference Benchmark & Acceptance Suite

### 8.1 Benchmark Model: Series RLC Circuit

```
              R (100 Ω)        L (0.1 H)
       ┌──────/\/\/\/───────────UUUU──────────┐
       │                                      │
     ( + )                                  ──┴── C (10 μF)
     [Vs = 10V Step]                        ──┬──
       │                                      │
       └──────────────────────────────────────┴── Ground (0V)
```

- **Circuit Parameters:** $R = 100\,\Omega$, $L = 0.1\,\text{H}$, $C = 10\,\mu\text{F}$, $V_s = 10\,\text{V}$.
- **Analytical Properties:**
  - Undamped natural frequency: $\omega_0 = \frac{1}{\sqrt{LC}} = 1000\,\text{rad/s}$
  - Damping ratio: $\zeta = \frac{R}{2}\sqrt{\frac{C}{L}} = 0.5$ (Underdamped)
  - Damped natural frequency: $\omega_d = \omega_0\sqrt{1-\zeta^2} = 866.0254\,\text{rad/s}$
  - Exact analytical capacitor voltage:
    $$V_C(t) = V_s \left[1 - e^{-\zeta \omega_0 t} \left(\cos(\omega_d t) + \frac{\zeta}{\sqrt{1 - \zeta^2}}\sin(\omega_d t)\right)\right]$$
  - Exact analytical inductor current:
    $$I_L(t) = \frac{V_s}{\omega_d L} e^{-\zeta \omega_0 t} \sin(\omega_d t)$$

### 8.2 Quantitative Acceptance Criteria

| Metric | Target / Threshold | Purpose |
|---|---|---|
| **Root-Mean-Square Error (RMSE)** | $\text{RMSE} < 10^{-3}\,\text{V}$ ($0.01\%$) | Overall trajectory fidelity |
| **Peak Overshoot Error** | $|\max(V_{C, sim}) - \max(V_{C, exact})| < 5 \times 10^{-3}\,\text{V}$ | Transient peak timing & magnitude |
| **KCL Conservation Residual** | $\|\sum I_k\|_\infty < 10^{-8}\,\text{A}$ | Strict Kirchhoff current conservation |
| **Branch Current Consistency** | $\max_k |I_R(t_k) - I_L(t_k)| < 10^{-8}\,\text{A}$ | Through-variable identity |
| **Steady-State Error** | $|V_C(t_{\text{end}}) - 10.0\,\text{V}| < 10^{-4}\,\text{V}$ | Asymptotic energy conservation |

### 8.3 Solver Verification & Timestep Convergence Matrix

The automated benchmark will execute and verify the following matrix:

| Test Case | Euler | RK4 | Adaptive RK | BDF (Implicit) |
|---|:---:|:---:|:---:|:---:|
| **Series RLC Step Response** | Pass ($\Delta t = 10\,\mu\text{s}$) | Pass ($\Delta t = 100\,\mu\text{s}$) | Pass (Auto $\text{Tol}=10^{-4}$) | Pass (Auto $\text{Tol}=10^{-4}$) |
| **Timestep Convergence ($h, h/2, h/4$)** | Order 1 Convergence | Order 4 Convergence | LTE Monotonicity | Order 2 Convergence |
| **KCL Residual Conservation** | $< 10^{-8}\,\text{A}$ | $< 10^{-8}\,\text{A}$ | $< 10^{-8}\,\text{A}$ | $< 10^{-8}\,\text{A}$ |
| **Branch Current Consistency** | $< 10^{-8}\,\text{A}$ | $< 10^{-8}\,\text{A}$ | $< 10^{-8}\,\text{A}$ | $< 10^{-8}\,\text{A}$ |
| **Step Rejection & Convergence Recovery**| N/A | N/A | Pass | Pass |
| **Singular Matrix / Failure Handling** | N/A | N/A | N/A | `VL-EQ-005` Emitted |

---

## 9. V-Lab UI & Solver Configuration Block

1. **`solver_config` Visual Block:**
   - Special badge styling to distinguish from physical components.
   - Connects logically or through network scoping to the physical circuit.
2. **Property Inspector:**
   - Solver dropdown (`Auto`, `Euler`, `RK4`, `Adaptive RK`, `BDF/DAE`).
   - Start / Stop time inputs.
   - Relative & Absolute tolerance controls.
   - Max iterations & nonlinear tolerance settings.
   - Diagnostics & Logging toggle checkboxes.
3. **Diagnostics & Statistics Display:**
   - Real-time solver status ribbon (Accepted steps, rejected steps, CPU time, maximum residual).
   - Structured diagnostic callouts linking directly to the affected components on canvas.

---

## 10. Implementation Plan & File Layout

```text
src/engine/vlab/
├── kernel/
│   ├── types.ts                     # Domain, Port, Variable, Equation & Solver contracts
│   ├── PhysicalNetworkExtractor.ts   # Subgraph partitioning & topology validation
│   ├── PhysicalSystemCompiler.ts    # Model -> PhysicalSystemIR compilation
│   ├── EquationAssembler.ts         # High-speed Float64 residual assembler
│   ├── InitializationEngine.ts      # Consistency solver & initial condition validation
│   ├── SystemAnalyzer.ts            # Stiffness & DAE classification for Auto solver
│   ├── SolverManager.ts             # Orchestrator & simulation job execution
│   ├── linear/
│   │   ├── LinearSolver.ts          # Linear solver interface
│   │   └── DenseLUSolver.ts         # Dense LU factorization with partial pivoting
│   ├── solvers/
│   │   ├── ISolver.ts               # Base solver interface & solver state
│   │   ├── EulerSolver.ts           # Forward Euler explicit solver
│   │   ├── RK4Solver.ts             # 4th-order Runge-Kutta explicit solver
│   │   ├── AdaptiveRKSolver.ts      # Dormand-Prince variable-step explicit solver
│   │   └── BDFSolver.ts             # Variable-order BDF implicit DAE solver
│   └── benchmarks/
│       ├── rlcBenchmark.test.ts     # High-precision analytical RLC verification suite
│       └── solverConvergence.test.ts # Multi-step order convergence tests
├── vlabPhysics.ts                   # Integrated physics bridge adapter
└── ... (existing components)
```

---

## 11. Verification & Done Criteria

Phase 1 is complete when:
1. `npm test` runs all unit, integration, and convergence tests with 100% pass rate.
2. The RLC benchmark verifies RMS error $< 10^{-3}\,\text{V}$ across all solvers.
3. Timestep convergence ($h, h/2, h/4$) demonstrates theoretical convergence rates.
4. Diagnostics `VL-SOLVER-001`, `VL-SOLVER-002`, `VL-REF-001`, and `VL-INIT-001` fire deterministically on invalid topologies.
5. Canvas `solver_config` block interacts with the `SolverManager` and drives simulation execution.
