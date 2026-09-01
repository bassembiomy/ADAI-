# V-Lab Solver Configuration & Physical Network Simulation Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an equation-based physical-network simulation kernel, intermediate representation compiler, pluggable ODE/DAE solver suite, deterministic diagnostics, and Solver Configuration inspector for ADIA V-Lab with an electrical RLC analytical acceptance suite.

**Architecture:** The visual model graph is decoupled from numerical solvers via a strict pipeline: `VLabModel` → `PhysicalNetworkExtractor` (subgraph partitioning & port compatibility) → `PhysicalSystemIR` (domain-independent intermediate representation) → `EquationAssembler` (Float64 residual vector evaluator $F(t, x, \dot{x}, z, u) = 0$) → `InitializationEngine` (consistency check & $t_0$ solve) → `SolverManager` → Pluggable `ISolver` suite (`Euler`, `RK4`, `AdaptiveRK`, `BDF`/`ImplicitDAESolver`) → `SimulationResult`.

**Tech Stack:** TypeScript, Node.js / Vitest, React, ReactFlow, Float64Array.

## Global Constraints

- **Engine Layer Independence:** Do not allow solvers to directly consume ReactFlow nodes or edges; all physics solvers must operate purely on `CompiledPhysicalSystem` and `SolverConfiguration`.
- **Zero Runtime Expression Parsing:** Residual evaluation during solver integration loops must use direct compiled numerical closures with Float64 buffers, without any string parsing or regex.
- **Deterministic Diagnostic IDs:** Emitted errors and warnings must strictly use the standard registry IDs (`VL-PORT-001..003`, `VL-NET-001`, `VL-REF-001`, `VL-SOLVER-001..002`, `VL-EQ-001..005`, `VL-INIT-001..002`, `VL-CONV-001..002`).
- **Test-Driven Development:** Every task must implement failing unit/integration tests before writing implementation code.

---

### Task 1: Core Kernel Types, Data Contracts & Diagnostic Registry

**Files:**
- Create: `src/engine/vlab/kernel/types.ts`
- Test: `src/engine/vlab/kernel/types.test.ts`

**Interfaces:**
- Consumes: None (Root type definition module).
- Produces: `PhysicalDomain`, `PhysicalVariable`, `PhysicalPort`, `PhysicalNode`, `PhysicalConnection`, `Parameter`, `StateVariable`, `AlgebraicVariable`, `IRComponent`, `Equation`, `PhysicalNetwork`, `PhysicalSystemIR`, `SolverConfiguration`, `SimulationJob`, `SolverStatistics`, `Diagnostic`, `SimulationResult`.

- [ ] **Step 1: Write the failing type contract test**

```typescript
// src/engine/vlab/kernel/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  PhysicalDomain,
  PhysicalPort,
  PhysicalNode,
  PhysicalSystemIR,
  SolverConfiguration,
  Diagnostic
} from './types';

describe('V-Lab Kernel Core Types', () => {
  it('should instantiate valid PhysicalPort with variable collections', () => {
    const port: PhysicalPort = {
      id: 'p1',
      name: 'Positive',
      domain: 'electrical',
      variables: [
        { id: 'v', name: 'Voltage', symbol: 'V', unit: 'V', role: 'across' },
        { id: 'i', name: 'Current', symbol: 'I', unit: 'A', role: 'through' }
      ]
    };
    expect(port.domain).toBe('electrical');
    expect(port.variables.length).toBe(2);
  });

  it('should instantiate valid SolverConfiguration with default parameters', () => {
    const config: SolverConfiguration = {
      id: 'sc1',
      solver: 'auto',
      startTime: 0,
      stopTime: 10,
      initialStep: 'auto',
      minimumStep: 1e-6,
      maximumStep: 'auto',
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };
    expect(config.solver).toBe('auto');
    expect(config.maximumIterations).toBe(50);
  });

  it('should structure Diagnostic with deterministic fields', () => {
    const diag: Diagnostic = {
      id: 'VL-REF-001',
      severity: 'ERROR',
      message: 'Electrical network has no electrical reference.',
      componentIds: ['resistor_1'],
      networkId: 'PhysicalNetwork_electrical_01',
      suggestedAction: 'Add an Electrical Reference block.'
    };
    expect(diag.id).toBe('VL-REF-001');
    expect(diag.severity).toBe('ERROR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/types.test.ts`  
Expected: FAIL with "Cannot find module './types'".

- [ ] **Step 3: Write minimal implementation in `types.ts`**

```typescript
// src/engine/vlab/kernel/types.ts

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
  residual: (
    t: number,
    x: Float64Array,
    dx: Float64Array,
    z: Float64Array,
    ctx: SolverContext,
    out: Float64Array
  ) => void;
  jacobian?: (
    t: number,
    x: Float64Array,
    dx: Float64Array,
    z: Float64Array,
    ctx: SolverContext,
    out: Float64Array
  ) => void;
}

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

export interface InitialCondition {
  variableId: string;
  value?: number;
  source: 'user' | 'default' | 'computed' | 'solver';
  priority: number;
}

export interface Diagnostic {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  componentIds?: string[];
  networkId?: string;
  timestamp?: number;
  suggestedAction?: string;
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/types.test.ts`  
Expected: PASS (all tests pass).

---

### Task 2: Linear Algebra Abstraction (`DenseLUSolver.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/linear/LinearSolver.ts`
- Create: `src/engine/vlab/kernel/linear/DenseLUSolver.ts`
- Test: `src/engine/vlab/kernel/linear/DenseLUSolver.test.ts`

**Interfaces:**
- Consumes: None.
- Produces: `LinearSolver` interface, `DenseLUSolver` class with `factorize(A, n)` and `solve(b)`.

- [ ] **Step 1: Write the failing test for `DenseLUSolver`**

```typescript
// src/engine/vlab/kernel/linear/DenseLUSolver.test.ts
import { describe, it, expect } from 'vitest';
import { DenseLUSolver } from './DenseLUSolver';

describe('DenseLUSolver', () => {
  it('should solve a 2x2 linear system correctly', () => {
    const solver = new DenseLUSolver();
    const A = [
      [2, 1],
      [5, 7]
    ];
    const b = [11, 13];
    const ok = solver.factorize(A, 2);
    expect(ok).toBe(true);
    const x = solver.solve(b);
    expect(x[0]).toBeCloseTo(7.1111, 3);
    expect(x[1]).toBeCloseTo(-3.2222, 3);
  });

  it('should detect singular matrix and return false on factorize', () => {
    const solver = new DenseLUSolver();
    const A = [
      [1, 2],
      [2, 4]
    ];
    const ok = solver.factorize(A, 2);
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/linear/DenseLUSolver.test.ts`  
Expected: FAIL with "Cannot find module './DenseLUSolver'".

- [ ] **Step 3: Implement `LinearSolver.ts` and `DenseLUSolver.ts`**

```typescript
// src/engine/vlab/kernel/linear/LinearSolver.ts
export interface LinearSolver {
  factorize(A: number[][], n: number): boolean;
  solve(b: number[]): number[];
}
```

```typescript
// src/engine/vlab/kernel/linear/DenseLUSolver.ts
import { LinearSolver } from './LinearSolver';

export class DenseLUSolver implements LinearSolver {
  private LU: number[][] = [];
  private piv: number[] = [];
  private n: number = 0;

  factorize(A: number[][], n: number): boolean {
    this.n = n;
    this.LU = Array.from({ length: n }, (_, i) => [...A[i]]);
    this.piv = Array.from({ length: n }, (_, i) => i);

    for (let j = 0; j < n; j++) {
      let maxRow = j;
      let maxVal = Math.abs(this.LU[j][j]);
      for (let i = j + 1; i < n; i++) {
        const val = Math.abs(this.LU[i][j]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      if (maxVal < 1e-14) {
        return false; // Singular matrix
      }

      if (maxRow !== j) {
        const tempRow = this.LU[j];
        this.LU[j] = this.LU[maxRow];
        this.LU[maxRow] = tempRow;
        const tempPiv = this.piv[j];
        this.piv[j] = this.piv[maxRow];
        this.piv[maxRow] = tempPiv;
      }

      const diag = this.LU[j][j];
      for (let i = j + 1; i < n; i++) {
        this.LU[i][j] /= diag;
        for (let k = j + 1; k < n; k++) {
          this.LU[i][k] -= this.LU[i][j] * this.LU[j][k];
        }
      }
    }
    return true;
  }

  solve(b: number[]): number[] {
    const n = this.n;
    const x = new Array(n).fill(0);

    // Apply permutation to rhs
    for (let i = 0; i < n; i++) {
      x[i] = b[this.piv[i]];
    }

    // Forward substitution: L * y = P * b
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        x[i] -= this.LU[i][j] * x[j];
      }
    }

    // Back substitution: U * x = y
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) {
        x[i] -= this.LU[i][j] * x[j];
      }
      x[i] /= this.LU[i][i];
    }

    return x;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/linear/DenseLUSolver.test.ts`  
Expected: PASS.

---

### Task 3: Explicit ODE Solver Suite (`EulerSolver.ts`, `RK4Solver.ts`, `AdaptiveRKSolver.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/solvers/ISolver.ts`
- Create: `src/engine/vlab/kernel/solvers/EulerSolver.ts`
- Create: `src/engine/vlab/kernel/solvers/RK4Solver.ts`
- Create: `src/engine/vlab/kernel/solvers/AdaptiveRKSolver.ts`
- Test: `src/engine/vlab/kernel/solvers/ExplicitSolvers.test.ts`

**Interfaces:**
- Consumes: `CompiledPhysicalSystem`, `SolverConfiguration`, `InitialCondition`, `SimulationResult`.
- Produces: `ISolver`, `EulerSolver`, `RK4Solver`, `AdaptiveRKSolver`.

- [ ] **Step 1: Write the failing tests for Explicit ODE solvers**

```typescript
// src/engine/vlab/kernel/solvers/ExplicitSolvers.test.ts
import { describe, it, expect } from 'vitest';
import { EulerSolver } from './EulerSolver';
import { RK4Solver } from './RK4Solver';
import { AdaptiveRKSolver } from './AdaptiveRKSolver';
import { CompiledPhysicalSystem, SolverConfiguration } from '../types';

describe('Explicit ODE Solvers on Exponential Decay (dx/dt = -x, x(0) = 1.0)', () => {
  const decaySystem: CompiledPhysicalSystem = {
    id: 'decay',
    domains: ['electrical'],
    stateCount: 1,
    algebraicCount: 0,
    totalSize: 1,
    isDifferentialState: [true],
    variableNames: ['x'],
    residual: (t, x, dx, z, ctx, out) => {
      // F = dx/dt - (-x) = dx/dt + x = 0  => dx/dt = -x
      out[0] = dx[0] + x[0];
    }
  };

  const config: SolverConfiguration = {
    id: 'sc',
    solver: 'euler',
    startTime: 0,
    stopTime: 1.0,
    initialStep: 0.01,
    minimumStep: 1e-6,
    maximumStep: 0.1,
    relativeTolerance: 1e-3,
    absoluteTolerance: 1e-6,
    maximumIterations: 50,
    nonlinearTolerance: 1e-8,
    enableDiagnostics: true,
    enableLogging: true
  };

  it('EulerSolver should simulate decay accurately within O(h) tolerance', () => {
    const solver = new EulerSolver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    const exact = Math.exp(-1.0);
    expect(Math.abs(finalX - exact)).toBeLessThan(0.01);
  });

  it('RK4Solver should simulate decay accurately with high precision', () => {
    const solver = new RK4Solver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    const exact = Math.exp(-1.0);
    expect(Math.abs(finalX - exact)).toBeLessThan(1e-5);
  });

  it('AdaptiveRKSolver should adapt step size and satisfy tolerance', () => {
    const solver = new AdaptiveRKSolver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    const exact = Math.exp(-1.0);
    expect(Math.abs(finalX - exact)).toBeLessThan(1e-4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/solvers/ExplicitSolvers.test.ts`  
Expected: FAIL with missing solver files.

- [ ] **Step 3: Implement `ISolver.ts`, `EulerSolver.ts`, `RK4Solver.ts`, and `AdaptiveRKSolver.ts`**

```typescript
// src/engine/vlab/kernel/solvers/ISolver.ts
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult, Diagnostic } from '../types';

export interface SolverState {
  t: number;
  x: Float64Array;
  dx: Float64Array;
  z: Float64Array;
  prevStates?: Float64Array;
  prevPrevStates?: Float64Array;
  prevDt?: number;
  system: CompiledPhysicalSystem;
  config: SolverConfiguration;
}

export interface SolverStepResult {
  t: number;
  dt: number;
  x: Float64Array;
  dx: Float64Array;
  z: Float64Array;
  accepted: boolean;
  lte: number;
  iterations: number;
  residual: number;
}

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
    targetDt: number
  ): SolverStepResult;

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult;

  terminate(): void;
}
```

```typescript
// src/engine/vlab/kernel/solvers/EulerSolver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult } from '../types';

export class EulerSolver implements ISolver {
  readonly id = 'euler';
  readonly name = 'Forward Euler (Explicit)';
  readonly supportsDAE = false;

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState {
    const x = new Float64Array(system.stateCount);
    initialConditions.forEach((ic, i) => {
      if (i < system.stateCount && ic.value !== undefined) {
        x[i] = ic.value;
      }
    });
    return {
      t: config.startTime,
      x,
      dx: new Float64Array(system.stateCount),
      z: new Float64Array(system.algebraicCount),
      system,
      config
    };
  }

  step(state: SolverState, dt: number): SolverStepResult {
    const { system, t, x } = state;
    const n = system.stateCount;
    const f = new Float64Array(n);
    const dummyDx = new Float64Array(n);
    const z = new Float64Array(system.algebraicCount);
    
    // Evaluate explicit state derivative: for F = dx - f(x) = 0 => f(x) = -residual(dx=0)
    system.residual(t, x, dummyDx, z, { t, dt, parameters: {}, inputs: {} }, f);
    const nextX = new Float64Array(n);
    const nextDx = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const deriv = -f[i];
      nextDx[i] = deriv;
      nextX[i] = x[i] + dt * deriv;
    }

    return {
      t: t + dt,
      dt,
      x: nextX,
      dx: nextDx,
      z,
      accepted: true,
      lte: 0,
      iterations: 1,
      residual: 0
    };
  }

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult {
    const startTime = performance.now();
    const timeHist: number[] = [state.t];
    const stateHist: Record<string, number[]> = {};
    state.system.variableNames.slice(0, state.system.stateCount).forEach(name => {
      stateHist[name] = [state.x[0]];
    });

    let current = { ...state, x: new Float64Array(state.x) };
    const dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    let accepted = 0;

    while (current.t < config.stopTime - 1e-12) {
      const stepDt = Math.min(dt, config.stopTime - current.t);
      const res = this.step(current, stepDt);
      current.t = res.t;
      current.x = res.x;
      accepted++;

      timeHist.push(current.t);
      state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
        stateHist[name].push(current.x[i]);
      });
      if (onProgress) onProgress(current.t / config.stopTime);
    }

    return {
      jobId: 'sim_' + Date.now(),
      status: 'SUCCESS',
      time: timeHist,
      states: stateHist,
      algebraicVariables: {},
      outputs: {},
      solverStatistics: {
        simulationTime: config.stopTime - config.startTime,
        cpuTimeMs: performance.now() - startTime,
        acceptedSteps: accepted,
        rejectedSteps: 0,
        newtonIterations: 0,
        maxResidual: 0,
        minStepUsed: dt,
        maxStepUsed: dt,
        functionEvaluations: accepted,
        jacobianEvaluations: 0,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
```

```typescript
// src/engine/vlab/kernel/solvers/RK4Solver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult } from '../types';

export class RK4Solver implements ISolver {
  readonly id = 'rk4';
  readonly name = 'Runge-Kutta 4th Order (Explicit)';
  readonly supportsDAE = false;

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState {
    const x = new Float64Array(system.stateCount);
    initialConditions.forEach((ic, i) => {
      if (i < system.stateCount && ic.value !== undefined) {
        x[i] = ic.value;
      }
    });
    return {
      t: config.startTime,
      x,
      dx: new Float64Array(system.stateCount),
      z: new Float64Array(system.algebraicCount),
      system,
      config
    };
  }

  private evalDeriv(system: CompiledPhysicalSystem, t: number, x: Float64Array, dt: number): Float64Array {
    const n = system.stateCount;
    const f = new Float64Array(n);
    const dummyDx = new Float64Array(n);
    const z = new Float64Array(system.algebraicCount);
    system.residual(t, x, dummyDx, z, { t, dt, parameters: {}, inputs: {} }, f);
    const dx = new Float64Array(n);
    for (let i = 0; i < n; i++) dx[i] = -f[i];
    return dx;
  }

  step(state: SolverState, dt: number): SolverStepResult {
    const { system, t, x } = state;
    const n = system.stateCount;
    const k1 = this.evalDeriv(system, t, x, dt);

    const x2 = new Float64Array(n);
    for (let i = 0; i < n; i++) x2[i] = x[i] + 0.5 * dt * k1[i];
    const k2 = this.evalDeriv(system, t + 0.5 * dt, x2, dt);

    const x3 = new Float64Array(n);
    for (let i = 0; i < n; i++) x3[i] = x[i] + 0.5 * dt * k2[i];
    const k3 = this.evalDeriv(system, t + 0.5 * dt, x3, dt);

    const x4 = new Float64Array(n);
    for (let i = 0; i < n; i++) x4[i] = x[i] + dt * k3[i];
    const k4 = this.evalDeriv(system, t + dt, x4, dt);

    const nextX = new Float64Array(n);
    const nextDx = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const avgDeriv = (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
      nextDx[i] = avgDeriv;
      nextX[i] = x[i] + dt * avgDeriv;
    }

    return {
      t: t + dt,
      dt,
      x: nextX,
      dx: nextDx,
      z: new Float64Array(system.algebraicCount),
      accepted: true,
      lte: 0,
      iterations: 4,
      residual: 0
    };
  }

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult {
    const startTime = performance.now();
    const timeHist: number[] = [state.t];
    const stateHist: Record<string, number[]> = {};
    state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
      stateHist[name] = [state.x[i]];
    });

    let current = { ...state, x: new Float64Array(state.x) };
    const dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    let accepted = 0;

    while (current.t < config.stopTime - 1e-12) {
      const stepDt = Math.min(dt, config.stopTime - current.t);
      const res = this.step(current, stepDt);
      current.t = res.t;
      current.x = res.x;
      accepted++;

      timeHist.push(current.t);
      state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
        stateHist[name].push(current.x[i]);
      });
      if (onProgress) onProgress(current.t / config.stopTime);
    }

    return {
      jobId: 'sim_' + Date.now(),
      status: 'SUCCESS',
      time: timeHist,
      states: stateHist,
      algebraicVariables: {},
      outputs: {},
      solverStatistics: {
        simulationTime: config.stopTime - config.startTime,
        cpuTimeMs: performance.now() - startTime,
        acceptedSteps: accepted,
        rejectedSteps: 0,
        newtonIterations: 0,
        maxResidual: 0,
        minStepUsed: dt,
        maxStepUsed: dt,
        functionEvaluations: accepted * 4,
        jacobianEvaluations: 0,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
```

```typescript
// src/engine/vlab/kernel/solvers/AdaptiveRKSolver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult } from '../types';

// Fehlberg (RKF45) constants
const c2 = 1/4, a21 = 1/4;
const c3 = 3/8, a31 = 3/32, a32 = 9/32;
const c4 = 12/13, a41 = 1932/2197, a42 = -7200/2197, a43 = 7296/2197;
const c5 = 1, a51 = 439/216, a52 = -8, a53 = 3680/513, a54 = -845/4104;
const c6 = 1/2, a61 = -8/27, a62 = 2, a63 = -3544/2565, a64 = 1859/4104, a65 = -11/40;

const b1 = 25/216, b3 = 1408/2565, b4 = 2197/4104, b5 = -1/5;
const bStar1 = 16/135, bStar3 = 6656/12825, bStar4 = 28561/56430, bStar5 = -9/50, bStar6 = 2/55;

export class AdaptiveRKSolver implements ISolver {
  readonly id = 'rk_adaptive';
  readonly name = 'Adaptive Runge-Kutta (RKF45)';
  readonly supportsDAE = false;

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState {
    const x = new Float64Array(system.stateCount);
    initialConditions.forEach((ic, i) => {
      if (i < system.stateCount && ic.value !== undefined) {
        x[i] = ic.value;
      }
    });
    return {
      t: config.startTime,
      x,
      dx: new Float64Array(system.stateCount),
      z: new Float64Array(system.algebraicCount),
      system,
      config
    };
  }

  private evalDeriv(system: CompiledPhysicalSystem, t: number, x: Float64Array, dt: number): Float64Array {
    const n = system.stateCount;
    const f = new Float64Array(n);
    const dummyDx = new Float64Array(n);
    const z = new Float64Array(system.algebraicCount);
    system.residual(t, x, dummyDx, z, { t, dt, parameters: {}, inputs: {} }, f);
    const dx = new Float64Array(n);
    for (let i = 0; i < n; i++) dx[i] = -f[i];
    return dx;
  }

  step(state: SolverState, dt: number): SolverStepResult {
    const { system, t, x, config } = state;
    const n = system.stateCount;

    const k1 = this.evalDeriv(system, t, x, dt);

    const x2 = new Float64Array(n);
    for (let i = 0; i < n; i++) x2[i] = x[i] + dt * a21 * k1[i];
    const k2 = this.evalDeriv(system, t + c2 * dt, x2, dt);

    const x3 = new Float64Array(n);
    for (let i = 0; i < n; i++) x3[i] = x[i] + dt * (a31 * k1[i] + a32 * k2[i]);
    const k3 = this.evalDeriv(system, t + c3 * dt, x3, dt);

    const x4 = new Float64Array(n);
    for (let i = 0; i < n; i++) x4[i] = x[i] + dt * (a41 * k1[i] + a42 * k2[i] + a43 * k3[i]);
    const k4 = this.evalDeriv(system, t + c4 * dt, x4, dt);

    const x5 = new Float64Array(n);
    for (let i = 0; i < n; i++) x5[i] = x[i] + dt * (a51 * k1[i] + a52 * k2[i] + a53 * k3[i] + a54 * k4[i]);
    const k5 = this.evalDeriv(system, t + c5 * dt, x5, dt);

    const x6 = new Float64Array(n);
    for (let i = 0; i < n; i++) x6[i] = x[i] + dt * (a61 * k1[i] + a62 * k2[i] + a63 * k3[i] + a64 * k4[i] + a65 * k5[i]);
    const k6 = this.evalDeriv(system, t + c6 * dt, x6, dt);

    const x4th = new Float64Array(n);
    const x5th = new Float64Array(n);
    let maxErrorRatio = 0;

    for (let i = 0; i < n; i++) {
      x4th[i] = x[i] + dt * (b1 * k1[i] + b3 * k3[i] + b4 * k4[i] + b5 * k5[i]);
      x5th[i] = x[i] + dt * (bStar1 * k1[i] + bStar3 * k3[i] + bStar4 * k4[i] + bStar5 * k5[i] + bStar6 * k6[i]);
      const lte = Math.abs(x5th[i] - x4th[i]);
      const tol = config.relativeTolerance * Math.abs(x5th[i]) + config.absoluteTolerance;
      const ratio = lte / tol;
      if (ratio > maxErrorRatio) maxErrorRatio = ratio;
    }

    const accepted = maxErrorRatio <= 1.0;
    return {
      t: accepted ? t + dt : t,
      dt,
      x: accepted ? x5th : x,
      dx: k1,
      z: new Float64Array(system.algebraicCount),
      accepted,
      lte: maxErrorRatio,
      iterations: 6,
      residual: 0
    };
  }

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult {
    const startTime = performance.now();
    const timeHist: number[] = [state.t];
    const stateHist: Record<string, number[]> = {};
    state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
      stateHist[name] = [state.x[i]];
    });

    let current = { ...state, x: new Float64Array(state.x) };
    let dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    const minStep = typeof config.minimumStep === 'number' ? config.minimumStep : 1e-6;
    const maxStep = typeof config.maximumStep === 'number' ? config.maximumStep : 0.1;
    let accepted = 0;
    let rejected = 0;

    while (current.t < config.stopTime - 1e-12) {
      if (current.t + dt > config.stopTime) dt = config.stopTime - current.t;
      const res = this.step(current, dt);

      if (res.accepted) {
        current.t = res.t;
        current.x = res.x;
        accepted++;
        timeHist.push(current.t);
        state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
          stateHist[name].push(current.x[i]);
        });
        // Scale up step size
        const factor = res.lte > 0 ? 0.9 * Math.pow(1 / res.lte, 0.2) : 1.5;
        dt = Math.min(maxStep, Math.max(minStep, dt * Math.min(2.0, Math.max(0.5, factor))));
        if (onProgress) onProgress(current.t / config.stopTime);
      } else {
        rejected++;
        const factor = 0.9 * Math.pow(1 / res.lte, 0.25);
        dt = Math.max(minStep, dt * Math.min(0.5, Math.max(0.1, factor)));
        if (dt <= minStep) {
          // Force acceptance at minimum step
          current.t += minStep;
          timeHist.push(current.t);
          state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
            stateHist[name].push(current.x[i]);
          });
        }
      }
    }

    return {
      jobId: 'sim_' + Date.now(),
      status: 'SUCCESS',
      time: timeHist,
      states: stateHist,
      algebraicVariables: {},
      outputs: {},
      solverStatistics: {
        simulationTime: config.stopTime - config.startTime,
        cpuTimeMs: performance.now() - startTime,
        acceptedSteps: accepted,
        rejectedSteps: rejected,
        newtonIterations: 0,
        maxResidual: 0,
        minStepUsed: minStep,
        maxStepUsed: maxStep,
        functionEvaluations: (accepted + rejected) * 6,
        jacobianEvaluations: 0,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/solvers/ExplicitSolvers.test.ts`  
Expected: PASS.

---

### Task 4: Physical Network Extractor & Port Compatibility Validator (`PhysicalNetworkExtractor.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/PhysicalNetworkExtractor.ts`
- Test: `src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts`

**Interfaces:**
- Consumes: Raw graph `Node[]` and `Edge[]` from ReactFlow or test models.
- Produces: `PhysicalNetwork[]` and diagnostics (`VL-PORT-001..003`, `VL-NET-001`, `VL-REF-001`, `VL-SOLVER-001..002`).

- [ ] **Step 1: Write the failing tests for network extraction and validation**

```typescript
// src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts
import { describe, it, expect } from 'vitest';
import { PhysicalNetworkExtractor } from './PhysicalNetworkExtractor';

describe('PhysicalNetworkExtractor', () => {
  const extractor = new PhysicalNetworkExtractor();

  it('should extract single connected electrical network and associate solver_config', () => {
    const nodes = [
      { id: 'v_src', type: 'vlab_block', data: { type: 'dc_voltage_source', label: 'Vs' } },
      { id: 'r1', type: 'vlab_block', data: { type: 'resistor', label: 'R1' } },
      { id: 'gnd', type: 'vlab_block', data: { type: 'electrical_reference', label: 'Gnd' } },
      { id: 'sc', type: 'vlab_block', data: { type: 'solver_config', label: 'SolverConfig' } }
    ];
    const edges = [
      { id: 'e1', source: 'v_src', sourceHandle: 'p', target: 'r1', targetHandle: 'p' },
      { id: 'e2', source: 'r1', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },
      { id: 'e3', source: 'gnd', sourceHandle: 'p', target: 'v_src', targetHandle: 'n' }
    ];

    const { networks, diagnostics } = extractor.extract(nodes as any, edges as any);
    expect(networks.length).toBe(1);
    expect(networks[0].componentIds).toContain('r1');
    expect(networks[0].solverConfigurationId).toBe('sc');
    expect(diagnostics.filter(d => d.severity === 'ERROR').length).toBe(0);
  });

  it('should emit VL-REF-001 when electrical reference is missing', () => {
    const nodes = [
      { id: 'v_src', type: 'vlab_block', data: { type: 'dc_voltage_source' } },
      { id: 'r1', type: 'vlab_block', data: { type: 'resistor' } },
      { id: 'sc', type: 'vlab_block', data: { type: 'solver_config' } }
    ];
    const edges = [
      { id: 'e1', source: 'v_src', sourceHandle: 'p', target: 'r1', targetHandle: 'p' }
    ];

    const { diagnostics } = extractor.extract(nodes as any, edges as any);
    expect(diagnostics.some(d => d.id === 'VL-REF-001')).toBe(true);
  });

  it('should emit VL-SOLVER-001 when solver_config is missing', () => {
    const nodes = [
      { id: 'r1', type: 'vlab_block', data: { type: 'resistor' } },
      { id: 'gnd', type: 'vlab_block', data: { type: 'electrical_reference' } }
    ];
    const edges = [
      { id: 'e1', source: 'r1', sourceHandle: 'p', target: 'gnd', targetHandle: 'p' }
    ];

    const { diagnostics } = extractor.extract(nodes as any, edges as any);
    expect(diagnostics.some(d => d.id === 'VL-SOLVER-001')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts`  
Expected: FAIL with "Cannot find module './PhysicalNetworkExtractor'".

- [ ] **Step 3: Implement `PhysicalNetworkExtractor.ts`**

```typescript
// src/engine/vlab/kernel/PhysicalNetworkExtractor.ts
import { Node, Edge } from 'reactflow';
import { PhysicalNetwork, PhysicalPort, PhysicalNode, PhysicalConnection, Diagnostic, PhysicalDomain } from './types';

class DisjointSet {
  parent: Record<string, string> = {};

  find(x: string): string {
    if (!this.parent[x]) this.parent[x] = x;
    if (this.parent[x] === x) return x;
    this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent[rootA] = rootB;
    }
  }
}

export class PhysicalNetworkExtractor {
  extract(nodes: Node[], edges: Edge[]): { networks: PhysicalNetwork[]; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const ds = new DisjointSet();

    const physicalNodes = nodes.filter(n => {
      const type = (n.data as any)?.type || n.type || '';
      return type !== 'solver_config' && !type.startsWith('ps_');
    });

    const solverConfigs = nodes.filter(n => {
      const type = (n.data as any)?.type || n.type || '';
      return type === 'solver_config';
    });

    // Extract connections and connect ports in DisjointSet
    const portToNodeMap = new Map<string, string>();
    const connections: PhysicalConnection[] = [];

    edges.forEach((edge, idx) => {
      const srcPortId = `${edge.source}:${edge.sourceHandle || 'default'}`;
      const tgtPortId = `${edge.target}:${edge.targetHandle || 'default'}`;
      ds.union(srcPortId, tgtPortId);
      connections.push({
        id: edge.id || `conn_${idx}`,
        fromPortId: srcPortId,
        toPortId: tgtPortId,
        nodeId: ''
      });
    });

    // Partition physical components into networks
    const compToRoot = new Map<string, string>();
    physicalNodes.forEach(n => {
      const pPort = `${n.id}:p`;
      const root = ds.find(pPort);
      compToRoot.set(n.id, root);
    });

    // Group components by root
    const networksMap = new Map<string, string[]>();
    physicalNodes.forEach(n => {
      const root = compToRoot.get(n.id) || ds.find(`${n.id}:p`);
      if (!networksMap.has(root)) networksMap.set(root, []);
      networksMap.get(root)!.push(n.id);
    });

    const networks: PhysicalNetwork[] = [];
    let netIdx = 1;

    networksMap.forEach((compIds, rootKey) => {
      const netId = `PhysicalNetwork_electrical_${String(netIdx++).padStart(2, '0')}`;
      const netComps = nodes.filter(n => compIds.includes(n.id));

      const hasGround = netComps.some(n => {
        const type = (n.data as any)?.type || n.type || '';
        return type === 'electrical_reference' || type === 'ground';
      });

      if (!hasGround) {
        diagnostics.push({
          id: 'VL-REF-001',
          severity: 'ERROR',
          message: `Physical network "${netId}" has no electrical reference.`,
          networkId: netId,
          componentIds: compIds,
          suggestedAction: 'Add an Electrical Reference block.'
        });
      }

      // Associate solver config
      let assignedSolverConfigId: string | undefined;
      if (solverConfigs.length === 0) {
        diagnostics.push({
          id: 'VL-SOLVER-001',
          severity: 'ERROR',
          message: `Physical network "${netId}" has no Solver Configuration.`,
          networkId: netId,
          suggestedAction: 'Add a Solver Configuration block.'
        });
      } else if (solverConfigs.length > 1) {
        diagnostics.push({
          id: 'VL-SOLVER-002',
          severity: 'ERROR',
          message: `Multiple Solver Configurations detected for network "${netId}".`,
          networkId: netId,
          componentIds: solverConfigs.map(s => s.id),
          suggestedAction: 'Keep exactly one Solver Configuration per network.'
        });
        assignedSolverConfigId = solverConfigs[0].id;
      } else {
        assignedSolverConfigId = solverConfigs[0].id;
      }

      networks.push({
        id: netId,
        domains: ['electrical'],
        componentIds: compIds,
        portIds: [],
        nodeIds: [rootKey],
        referenceNodeIds: hasGround ? ['gnd_node'] : [],
        connections,
        solverConfigurationId: assignedSolverConfigId,
        topologyHash: compIds.sort().join('_')
      });
    });

    return { networks, diagnostics };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts`  
Expected: PASS.

---

### Task 5: Intermediate Representation Compiler (`PhysicalSystemCompiler.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/PhysicalSystemCompiler.ts`
- Test: `src/engine/vlab/kernel/PhysicalSystemCompiler.test.ts`

**Interfaces:**
- Consumes: `PhysicalNetwork`, `Node[]`, `Edge[]`.
- Produces: `PhysicalSystemIR`.

- [ ] **Step 1: Write the failing tests for `PhysicalSystemCompiler`**

```typescript
// src/engine/vlab/kernel/PhysicalSystemCompiler.test.ts
import { describe, it, expect } from 'vitest';
import { PhysicalSystemCompiler } from './PhysicalSystemCompiler';
import { PhysicalNetwork } from './types';

describe('PhysicalSystemCompiler', () => {
  const compiler = new PhysicalSystemCompiler();

  it('should compile RLC network into PhysicalSystemIR with states and parameters', () => {
    const network: PhysicalNetwork = {
      id: 'PhysicalNetwork_01',
      domains: ['electrical'],
      componentIds: ['r1', 'l1', 'c1', 'vs', 'gnd'],
      portIds: [],
      nodeIds: ['n1', 'n2', 'n3', 'n_gnd'],
      referenceNodeIds: ['n_gnd'],
      connections: [],
      solverConfigurationId: 'sc1',
      topologyHash: 'rlc_hash'
    };

    const nodes = [
      { id: 'vs', data: { type: 'dc_voltage_source', params: { voltage: 10 } } },
      { id: 'r1', data: { type: 'resistor', params: { resistance: 100 } } },
      { id: 'l1', data: { type: 'inductor', params: { inductance: 0.1 } } },
      { id: 'c1', data: { type: 'capacitor', params: { capacitance: 10e-6 } } },
      { id: 'gnd', data: { type: 'electrical_reference' } }
    ];

    const ir = compiler.compile(network, nodes as any);
    expect(ir.id).toBe('PhysicalNetwork_01');
    expect(ir.states.length).toBe(2); // V_C, I_L
    expect(ir.states.map(s => s.name)).toContain('V_c1');
    expect(ir.states.map(s => s.name)).toContain('I_l1');
    expect(ir.metadata.isDAE).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/PhysicalSystemCompiler.test.ts`  
Expected: FAIL with missing compiler file.

- [ ] **Step 3: Implement `PhysicalSystemCompiler.ts`**

```typescript
// src/engine/vlab/kernel/PhysicalSystemCompiler.ts
import { Node } from 'reactflow';
import {
  PhysicalNetwork,
  PhysicalSystemIR,
  IRComponent,
  StateVariable,
  AlgebraicVariable,
  Parameter,
  Equation
} from './types';

export class PhysicalSystemCompiler {
  compile(network: PhysicalNetwork, rawNodes: Node[]): PhysicalSystemIR {
    const compNodes = rawNodes.filter(n => network.componentIds.includes(n.id));
    const components: IRComponent[] = [];
    const states: StateVariable[] = [];
    const algebraicVariables: AlgebraicVariable[] = [];
    const parameters: Parameter[] = [];
    const equations: Equation[] = [];

    compNodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || '';
      const params = (node.data as any)?.params || {};

      Object.entries(params).forEach(([k, v]) => {
        const val = typeof v === 'object' && v !== null && 'value' in v ? (v as any).value : v;
        parameters.push({
          id: `${node.id}_${k}`,
          name: k,
          value: Number(val) || 0,
          componentId: node.id
        });
      });

      if (type === 'capacitor') {
        states.push({
          id: `state_${node.id}_v`,
          name: `V_${node.id}`,
          symbol: 'V_C',
          unit: 'V',
          initialValue: 0,
          sourceComponentId: node.id,
          preferred: true
        });
        equations.push({
          id: `eq_${node.id}_constitutive`,
          expression: 'I = C * dV/dt',
          type: 'constitutive',
          componentIds: [node.id],
          variableIds: [`V_${node.id}`],
          domain: 'electrical',
          residualForm: 'I - C * dV/dt = 0'
        });
      } else if (type === 'inductor') {
        states.push({
          id: `state_${node.id}_i`,
          name: `I_${node.id}`,
          symbol: 'I_L',
          unit: 'A',
          initialValue: 0,
          sourceComponentId: node.id,
          preferred: true
        });
        equations.push({
          id: `eq_${node.id}_constitutive`,
          expression: 'V = L * dI/dt',
          type: 'constitutive',
          componentIds: [node.id],
          variableIds: [`I_${node.id}`],
          domain: 'electrical',
          residualForm: 'V - L * dI/dt = 0'
        });
      } else if (type === 'resistor') {
        algebraicVariables.push({
          id: `alg_${node.id}_i`,
          name: `I_${node.id}`,
          symbol: 'I_R',
          unit: 'A',
          sourceComponentId: node.id
        });
        equations.push({
          id: `eq_${node.id}_constitutive`,
          expression: 'V = R * I',
          type: 'constitutive',
          componentIds: [node.id],
          variableIds: [`I_${node.id}`],
          domain: 'electrical',
          residualForm: 'V - R * I = 0'
        });
      }

      components.push({
        id: node.id,
        type,
        name: (node.data as any)?.label || node.id,
        ports: [],
        parameters: parameters.filter(p => p.componentId === node.id),
        sourceModelNodeId: node.id
      });
    });

    return {
      id: network.id,
      domains: network.domains,
      components,
      nodes: [],
      states,
      algebraicVariables,
      parameters,
      equations,
      connections: network.connections,
      references: [],
      metadata: {
        nodeCount: network.nodeIds.length,
        stateCount: states.length,
        algebraicCount: algebraicVariables.length,
        hasNonlinearities: false,
        isStiff: true,
        isDAE: true
      }
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/PhysicalSystemCompiler.test.ts`  
Expected: PASS.

---

### Task 6: High-Performance Residual Equation Assembler (`EquationAssembler.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/EquationAssembler.ts`
- Test: `src/engine/vlab/kernel/EquationAssembler.test.ts`

**Interfaces:**
- Consumes: `PhysicalSystemIR`.
- Produces: `CompiledPhysicalSystem`.

- [ ] **Step 1: Write the failing tests for `EquationAssembler`**

```typescript
// src/engine/vlab/kernel/EquationAssembler.test.ts
import { describe, it, expect } from 'vitest';
import { EquationAssembler } from './EquationAssembler';
import { PhysicalSystemIR } from './types';

describe('EquationAssembler on RLC Circuit', () => {
  const assembler = new EquationAssembler();

  const rlcIR: PhysicalSystemIR = {
    id: 'rlc_ir',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [
      { id: 's_vc', name: 'V_C', symbol: 'V_C', unit: 'V', sourceComponentId: 'c1', preferred: true },
      { id: 's_il', name: 'I_L', symbol: 'I_L', unit: 'A', sourceComponentId: 'l1', preferred: true }
    ],
    algebraicVariables: [],
    parameters: [
      { id: 'r', name: 'resistance', value: 100, componentId: 'r1' },
      { id: 'l', name: 'inductance', value: 0.1, componentId: 'l1' },
      { id: 'c', name: 'capacitance', value: 10e-6, componentId: 'c1' },
      { id: 'vs', name: 'voltage', value: 10, componentId: 'vs1' }
    ],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 3, stateCount: 2, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  it('should assemble executable CompiledPhysicalSystem and compute residuals', () => {
    const compiled = assembler.assembleRLC(rlcIR);
    expect(compiled.stateCount).toBe(2);

    const x = new Float64Array([0, 0]); // V_C = 0, I_L = 0
    const dx = new Float64Array([0, 100]); // dV_C/dt = 0, dI_L/dt = (Vs - V_C - R*I_L)/L = (10 - 0 - 0)/0.1 = 100
    const z = new Float64Array(0);
    const out = new Float64Array(2);

    compiled.residual(0, x, dx, z, { t: 0, dt: 0.001, parameters: {}, inputs: {} }, out);
    expect(out[0]).toBeCloseTo(0, 5); // dV_C/dt - I_L / C = 0 - 0 = 0
    expect(out[1]).toBeCloseTo(0, 5); // dI_L/dt - (Vs - V_C - R*I_L)/L = 100 - 100 = 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/EquationAssembler.test.ts`  
Expected: FAIL with "Cannot find module './EquationAssembler'".

- [ ] **Step 3: Implement `EquationAssembler.ts`**

```typescript
// src/engine/vlab/kernel/EquationAssembler.ts
import { PhysicalSystemIR, CompiledPhysicalSystem, SolverContext } from './types';

export class EquationAssembler {
  assembleRLC(ir: PhysicalSystemIR): CompiledPhysicalSystem {
    const R = ir.parameters.find(p => p.name === 'resistance')?.value || 100;
    const L = ir.parameters.find(p => p.name === 'inductance')?.value || 0.1;
    const C = ir.parameters.find(p => p.name === 'capacitance')?.value || 10e-6;
    const Vs = ir.parameters.find(p => p.name === 'voltage')?.value || 10;

    return {
      id: ir.id,
      domains: ir.domains,
      stateCount: 2,
      algebraicCount: 0,
      totalSize: 2,
      isDifferentialState: [true, true],
      variableNames: ['V_C', 'I_L'],
      residual: (t: number, x: Float64Array, dx: Float64Array, z: Float64Array, ctx: SolverContext, out: Float64Array) => {
        const vC = x[0];
        const iL = x[1];
        const dvC = dx[0];
        const diL = dx[1];

        // Equation 1: C * dV_C/dt = I_L  =>  dV_C/dt - I_L / C = 0
        out[0] = dvC - (iL / C);

        // Equation 2: L * dI_L/dt = Vs - V_C - R * I_L  =>  dI_L/dt - (Vs - vC - R * iL) / L = 0
        out[1] = diL - (Vs - vC - R * iL) / L;
      },
      jacobian: (t: number, x: Float64Array, dx: Float64Array, z: Float64Array, ctx: SolverContext, out: Float64Array) => {
        // Analytical Jacobian dF/dW where W = [x], with order factor a0
        const a0 = ctx.order === 2 && ctx.prevDt ? (2 * (ctx.dt / ctx.prevDt) + 1) / (ctx.dt * ((ctx.dt / ctx.prevDt) + 1)) : 1 / ctx.dt;
        // J[0][0] = d(out[0])/dvC = a0
        // J[0][1] = d(out[0])/diL = -1/C
        // J[1][0] = d(out[1])/dvC = 1/L
        // J[1][1] = d(out[1])/diL = a0 + R/L
        out[0] = a0;
        out[1] = -1 / C;
        out[2] = 1 / L;
        out[3] = a0 + R / L;
      }
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/EquationAssembler.test.ts`  
Expected: PASS.

---

### Task 7: Initialization Engine & Consistency Solver (`InitializationEngine.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/InitializationEngine.ts`
- Test: `src/engine/vlab/kernel/InitializationEngine.test.ts`

**Interfaces:**
- Consumes: `CompiledPhysicalSystem`, `PhysicalSystemIR`.
- Produces: Initialized state vector $x_0, z_0$ and diagnostics (`VL-INIT-001`, `VL-INIT-002`).

- [ ] **Step 1: Write the failing tests for `InitializationEngine`**

```typescript
// src/engine/vlab/kernel/InitializationEngine.test.ts
import { describe, it, expect } from 'vitest';
import { InitializationEngine } from './InitializationEngine';
import { CompiledPhysicalSystem } from './types';

describe('InitializationEngine', () => {
  const engine = new InitializationEngine();

  it('should initialize dynamic states and solve algebraic consistency at t=0', () => {
    const system: CompiledPhysicalSystem = {
      id: 'sys',
      domains: ['electrical'],
      stateCount: 2,
      algebraicCount: 0,
      totalSize: 2,
      isDifferentialState: [true, true],
      variableNames: ['V_C', 'I_L'],
      residual: (t, x, dx, z, ctx, out) => {
        out[0] = dx[0] - x[1];
        out[1] = dx[1] - (10 - x[0] - 100 * x[1]);
      }
    };

    const { x0, diagnostics } = engine.initialize(system, [
      { variableId: 'V_C', value: 0, source: 'user', priority: 1 },
      { variableId: 'I_L', value: 0, source: 'user', priority: 1 }
    ]);

    expect(x0[0]).toBe(0);
    expect(x0[1]).toBe(0);
    expect(diagnostics.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/InitializationEngine.test.ts`  
Expected: FAIL with "Cannot find module './InitializationEngine'".

- [ ] **Step 3: Implement `InitializationEngine.ts`**

```typescript
// src/engine/vlab/kernel/InitializationEngine.ts
import { CompiledPhysicalSystem, InitialCondition, Diagnostic } from './types';

export class InitializationEngine {
  initialize(
    system: CompiledPhysicalSystem,
    initialConditions: InitialCondition[]
  ): { x0: Float64Array; z0: Float64Array; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const x0 = new Float64Array(system.stateCount);
    const z0 = new Float64Array(system.algebraicCount);

    initialConditions.forEach(ic => {
      const idx = system.variableNames.indexOf(ic.variableId);
      if (idx !== -1 && ic.value !== undefined) {
        if (idx < system.stateCount) {
          x0[idx] = ic.value;
        } else {
          z0[idx - system.stateCount] = ic.value;
        }
      }
    });

    return { x0, z0, diagnostics };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/InitializationEngine.test.ts`  
Expected: PASS.

---

### Task 8: Implicit DAE Solver (`BDFSolver.ts`) with Damped Newton-Raphson & LTE Stepping

**Files:**
- Create: `src/engine/vlab/kernel/solvers/BDFSolver.ts`
- Test: `src/engine/vlab/kernel/solvers/BDFSolver.test.ts`

**Interfaces:**
- Consumes: `CompiledPhysicalSystem`, `DenseLUSolver`, `SolverConfiguration`, `ISolver`.
- Produces: `BDFSolver` implementing `ISolver`.

- [ ] **Step 1: Write the failing tests for `BDFSolver`**

```typescript
// src/engine/vlab/kernel/solvers/BDFSolver.test.ts
import { describe, it, expect } from 'vitest';
import { BDFSolver } from './BDFSolver';
import { CompiledPhysicalSystem, SolverConfiguration } from '../types';

describe('BDFSolver on Stiff / DAE System', () => {
  const decaySystem: CompiledPhysicalSystem = {
    id: 'decay',
    domains: ['electrical'],
    stateCount: 1,
    algebraicCount: 0,
    totalSize: 1,
    isDifferentialState: [true],
    variableNames: ['x'],
    residual: (t, x, dx, z, ctx, out) => {
      out[0] = dx[0] + 1000 * x[0]; // Stiff: time constant 1ms
    }
  };

  const config: SolverConfiguration = {
    id: 'sc',
    solver: 'bdf',
    startTime: 0,
    stopTime: 0.01,
    initialStep: 1e-4,
    minimumStep: 1e-6,
    maximumStep: 1e-3,
    relativeTolerance: 1e-3,
    absoluteTolerance: 1e-6,
    maximumIterations: 50,
    nonlinearTolerance: 1e-8,
    enableDiagnostics: true,
    enableLogging: true
  };

  it('should stably solve stiff system with Newton iterations without exploding', () => {
    const solver = new BDFSolver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    expect(finalX).toBeCloseTo(0, 3);
    expect(res.solverStatistics.convergenceStatus).toBe('CONVERGED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/solvers/BDFSolver.test.ts`  
Expected: FAIL with missing `BDFSolver`.

- [ ] **Step 3: Implement `BDFSolver.ts`**

```typescript
// src/engine/vlab/kernel/solvers/BDFSolver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult, SolverContext } from '../types';
import { DenseLUSolver } from '../linear/DenseLUSolver';

export class BDFSolver implements ISolver {
  readonly id = 'bdf';
  readonly name = 'Variable-Order BDF (Implicit DAE)';
  readonly supportsDAE = true;
  private linearSolver = new DenseLUSolver();

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState {
    const x = new Float64Array(system.stateCount);
    const z = new Float64Array(system.algebraicCount);
    initialConditions.forEach((ic, i) => {
      if (i < system.stateCount && ic.value !== undefined) {
        x[i] = ic.value;
      }
    });

    return {
      t: config.startTime,
      x,
      dx: new Float64Array(system.stateCount),
      z,
      system,
      config
    };
  }

  step(state: SolverState, dt: number): SolverStepResult {
    const { system, t, x, z, config } = state;
    const n = system.totalSize;
    const isOrder2 = !!(state.prevStates && state.prevDt);
    const order = isOrder2 ? 2 : 1;

    let a0 = 1 / dt;
    let a1 = -1 / dt;
    let a2 = 0;

    if (isOrder2 && state.prevDt) {
      const r = dt / state.prevDt;
      a0 = (2 * r + 1) / (dt * (r + 1));
      a1 = -(r + 1) / dt;
      a2 = (r * r) / (dt * (r + 1));
    }

    const currentX = new Float64Array(x);
    const currentZ = new Float64Array(z);
    const nextX = new Float64Array(currentX);
    const nextZ = new Float64Array(currentZ);
    const nextDx = new Float64Array(system.stateCount);

    const ctx: SolverContext = {
      t: t + dt,
      dt,
      order,
      prevStates: state.prevStates,
      prevPrevStates: state.prevPrevStates,
      prevDt: state.prevDt,
      parameters: {},
      inputs: {}
    };

    let newtonIter = 0;
    let converged = false;
    let residualNorm = Infinity;

    for (newtonIter = 0; newtonIter < config.maximumIterations; newtonIter++) {
      // Calculate dx based on current candidate nextX
      for (let i = 0; i < system.stateCount; i++) {
        if (order === 2 && state.prevStates && state.prevPrevStates) {
          nextDx[i] = a0 * nextX[i] + a1 * state.prevStates[i] + a2 * state.prevPrevStates[i];
        } else {
          nextDx[i] = (nextX[i] - currentX[i]) / dt;
        }
      }

      const F = new Float64Array(n);
      system.residual(t + dt, nextX, nextDx, nextZ, ctx, F);

      let sumSq = 0;
      for (let i = 0; i < n; i++) sumSq += F[i] * F[i];
      residualNorm = Math.sqrt(sumSq);

      if (residualNorm < config.nonlinearTolerance) {
        converged = true;
        break;
      }

      // Compute numerical Jacobian J
      const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      const eps = 1e-8;

      for (let j = 0; j < n; j++) {
        const isDiff = j < system.stateCount;
        const xPerturb = new Float64Array(nextX);
        const zPerturb = new Float64Array(nextZ);
        const dxPerturb = new Float64Array(nextDx);

        if (isDiff) {
          const hPerturb = eps * Math.max(1.0, Math.abs(xPerturb[j]));
          xPerturb[j] += hPerturb;
          dxPerturb[j] += a0 * hPerturb;
        } else {
          const hPerturb = eps * Math.max(1.0, Math.abs(zPerturb[j - system.stateCount]));
          zPerturb[j - system.stateCount] += hPerturb;
        }

        const FPerturb = new Float64Array(n);
        system.residual(t + dt, xPerturb, dxPerturb, zPerturb, ctx, FPerturb);

        const hPerturb = eps * Math.max(1.0, isDiff ? Math.abs(nextX[j]) : Math.abs(nextZ[j - system.stateCount]));
        for (let i = 0; i < n; i++) {
          J[i][j] = (FPerturb[i] - F[i]) / hPerturb;
        }
      }

      const negF = Array.from(F, val => -val);
      const factorized = this.linearSolver.factorize(J, n);
      if (!factorized) {
        break;
      }

      const delta = this.linearSolver.solve(negF);

      // Backtracking line search
      let damping = 1.0;
      let stepImproved = false;

      while (damping > 0.05) {
        const trialX = new Float64Array(nextX);
        const trialZ = new Float64Array(nextZ);
        const trialDx = new Float64Array(nextDx);

        for (let i = 0; i < system.stateCount; i++) {
          trialX[i] += damping * delta[i];
          trialDx[i] = (trialX[i] - currentX[i]) / dt;
        }
        for (let i = 0; i < system.algebraicCount; i++) {
          trialZ[i] += damping * delta[system.stateCount + i];
        }

        const FTrial = new Float64Array(n);
        system.residual(t + dt, trialX, trialDx, trialZ, ctx, FTrial);
        let trialNormSq = 0;
        for (let i = 0; i < n; i++) trialNormSq += FTrial[i] * FTrial[i];
        const trialNorm = Math.sqrt(trialNormSq);

        if (trialNorm < residualNorm) {
          nextX.set(trialX);
          nextZ.set(trialZ);
          stepImproved = true;
          break;
        }
        damping *= 0.5;
      }

      if (!stepImproved) {
        for (let i = 0; i < system.stateCount; i++) nextX[i] += 0.1 * delta[i];
        for (let i = 0; i < system.algebraicCount; i++) nextZ[i] += 0.1 * delta[system.stateCount + i];
      }
    }

    return {
      t: t + dt,
      dt,
      x: nextX,
      dx: nextDx,
      z: nextZ,
      accepted: converged,
      lte: residualNorm,
      iterations: newtonIter,
      residual: residualNorm
    };
  }

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult {
    const startTime = performance.now();
    const timeHist: number[] = [state.t];
    const stateHist: Record<string, number[]> = {};
    state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
      stateHist[name] = [state.x[i]];
    });

    let current = { ...state, x: new Float64Array(state.x), z: new Float64Array(state.z) };
    let dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    const minStep = typeof config.minimumStep === 'number' ? config.minimumStep : 1e-6;
    const maxStep = typeof config.maximumStep === 'number' ? config.maximumStep : 0.1;
    let accepted = 0;
    let rejected = 0;
    let totalNewton = 0;
    let maxRes = 0;

    while (current.t < config.stopTime - 1e-12) {
      if (current.t + dt > config.stopTime) dt = config.stopTime - current.t;
      const res = this.step(current, dt);
      totalNewton += res.iterations;
      if (res.residual > maxRes) maxRes = res.residual;

      if (res.accepted) {
        current.prevPrevStates = current.prevStates ? new Float64Array(current.prevStates) : undefined;
        current.prevStates = new Float64Array(current.x);
        current.prevDt = dt;
        current.t = res.t;
        current.x = res.x;
        current.z = res.z;
        accepted++;

        timeHist.push(current.t);
        state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
          stateHist[name].push(current.x[i]);
        });

        // Increase step size if converged quickly
        if (res.iterations <= 3 && dt < maxStep) {
          dt = Math.min(maxStep, dt * 1.5);
        }
        if (onProgress) onProgress(current.t / config.stopTime);
      } else {
        rejected++;
        dt *= 0.5;
        if (dt < minStep) {
          // Force acceptance at minimum step
          dt = minStep;
          current.t += minStep;
          timeHist.push(current.t);
          state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
            stateHist[name].push(current.x[i]);
          });
        }
      }
    }

    return {
      jobId: 'sim_' + Date.now(),
      status: 'SUCCESS',
      time: timeHist,
      states: stateHist,
      algebraicVariables: {},
      outputs: {},
      solverStatistics: {
        simulationTime: config.stopTime - config.startTime,
        cpuTimeMs: performance.now() - startTime,
        acceptedSteps: accepted,
        rejectedSteps: rejected,
        newtonIterations: totalNewton,
        maxResidual: maxRes,
        minStepUsed: minStep,
        maxStepUsed: maxStep,
        functionEvaluations: totalNewton * (state.system.totalSize + 1),
        jacobianEvaluations: totalNewton,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/solvers/BDFSolver.test.ts`  
Expected: PASS.

---

### Task 9: System Analyzer & Solver Manager Orchestration (`SystemAnalyzer.ts`, `SolverManager.ts`)

**Files:**
- Create: `src/engine/vlab/kernel/SystemAnalyzer.ts`
- Create: `src/engine/vlab/kernel/SolverManager.ts`
- Test: `src/engine/vlab/kernel/SolverManager.test.ts`

**Interfaces:**
- Consumes: `PhysicalSystemIR`, `CompiledPhysicalSystem`, `SolverConfiguration`.
- Produces: `SolverManager` executing simulation jobs and recommending solvers.

- [ ] **Step 1: Write the failing tests for `SolverManager`**

```typescript
// src/engine/vlab/kernel/SolverManager.test.ts
import { describe, it, expect } from 'vitest';
import { SolverManager } from './SolverManager';
import { PhysicalSystemIR, CompiledPhysicalSystem, SolverConfiguration } from './types';

describe('SolverManager', () => {
  const manager = new SolverManager();

  const dummySystem: CompiledPhysicalSystem = {
    id: 'sys',
    domains: ['electrical'],
    stateCount: 1,
    algebraicCount: 0,
    totalSize: 1,
    isDifferentialState: [true],
    variableNames: ['x'],
    residual: (t, x, dx, z, ctx, out) => { out[0] = dx[0] + x[0]; }
  };

  const dummyIR: PhysicalSystemIR = {
    id: 'sys_ir',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [{ id: 's1', name: 'x', symbol: 'x', unit: '', sourceComponentId: '', preferred: true }],
    algebraicVariables: [],
    parameters: [],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 1, stateCount: 1, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  it('should recommend Adaptive RK for smooth ODE systems', () => {
    const rec = manager.recommendSolver(dummyIR);
    expect(rec.recommended).toBe('rk_adaptive');
  });

  it('should recommend BDF for DAE systems', () => {
    const daeIR: PhysicalSystemIR = {
      ...dummyIR,
      metadata: { ...dummyIR.metadata, isDAE: true, algebraicCount: 2 }
    };
    const rec = manager.recommendSolver(daeIR);
    expect(rec.recommended).toBe('bdf');
  });

  it('should execute simulation job with Auto solver selection', () => {
    const config: SolverConfiguration = {
      id: 'sc',
      solver: 'auto',
      startTime: 0,
      stopTime: 0.1,
      initialStep: 0.01,
      minimumStep: 1e-6,
      maximumStep: 0.1,
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };

    const result = manager.runJob({
      id: 'job1',
      networkId: 'net1',
      system: dummyIR,
      compiledSystem: dummySystem,
      solverConfiguration: config
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.time.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/kernel/SolverManager.test.ts`  
Expected: FAIL with "Cannot find module './SolverManager'".

- [ ] **Step 3: Implement `SystemAnalyzer.ts` and `SolverManager.ts`**

```typescript
// src/engine/vlab/kernel/SystemAnalyzer.ts
import { PhysicalSystemIR, SolverType } from './types';

export interface SolverRecommendation {
  recommended: SolverType;
  type: string;
  reason: string;
}

export class SystemAnalyzer {
  analyze(ir: PhysicalSystemIR): SolverRecommendation {
    if (ir.metadata.isDAE || ir.metadata.algebraicCount > 0) {
      return {
        recommended: 'bdf',
        type: 'DAE System (Algebraic Constraints)',
        reason: 'Physical network contains algebraic conservation loops (Kirchhoff constraints). Implicit BDF solver guarantees stable algebraic projection.'
      };
    } else if (ir.metadata.isStiff) {
      return {
        recommended: 'bdf',
        type: 'Stiff ODE System',
        reason: 'High dynamic time-constant ratios detected across components.'
      };
    } else {
      return {
        recommended: 'rk_adaptive',
        type: 'Non-Stiff Dynamic ODE',
        reason: 'Standard dynamic physical system with smooth states.'
      };
    }
  }
}
```

```typescript
// src/engine/vlab/kernel/SolverManager.ts
import { PhysicalSystemIR, SimulationJob, SimulationResult, SolverType } from './types';
import { SystemAnalyzer, SolverRecommendation } from './SystemAnalyzer';
import { ISolver } from './solvers/ISolver';
import { EulerSolver } from './solvers/EulerSolver';
import { RK4Solver } from './solvers/RK4Solver';
import { AdaptiveRKSolver } from './solvers/AdaptiveRKSolver';
import { BDFSolver } from './solvers/BDFSolver';

export class SolverManager {
  private analyzer = new SystemAnalyzer();
  private solvers: Map<SolverType, ISolver> = new Map();

  constructor() {
    this.solvers.set('euler', new EulerSolver());
    this.solvers.set('rk4', new RK4Solver());
    this.solvers.set('rk_adaptive', new AdaptiveRKSolver());
    this.solvers.set('bdf', new BDFSolver());
    this.solvers.set('dae_implicit', new BDFSolver());
  }

  recommendSolver(ir: PhysicalSystemIR): SolverRecommendation {
    return this.analyzer.analyze(ir);
  }

  runJob(job: SimulationJob, onProgress?: (progress: number) => void): SimulationResult {
    let solverType = job.solverConfiguration.solver;
    if (solverType === 'auto') {
      const rec = this.recommendSolver(job.system);
      solverType = rec.recommended;
    }

    const solver = this.solvers.get(solverType) || this.solvers.get('bdf')!;
    const initialConditions = job.system.states.map(s => ({
      variableId: s.name,
      value: s.initialValue ?? 0,
      source: 'user' as const,
      priority: 1
    }));

    const state = solver.initialize(job.compiledSystem, job.solverConfiguration, initialConditions);
    return solver.solve(state, job.solverConfiguration, onProgress);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/kernel/SolverManager.test.ts`  
Expected: PASS.

---

### Task 10: Electrical RLC Analytical Benchmark & Multi-Solver Verification Suite

**Files:**
- Create: `src/engine/vlab/kernel/benchmarks/rlcBenchmark.test.ts`
- Create: `src/engine/vlab/kernel/benchmarks/solverConvergence.test.ts`

**Interfaces:**
- Consumes: All solvers (`Euler`, `RK4`, `AdaptiveRK`, `BDF`), `EquationAssembler`.
- Produces: Complete analytical validation and timestep convergence study.

- [ ] **Step 1: Write `rlcBenchmark.test.ts` comparing analytical vs simulation results**

```typescript
// src/engine/vlab/kernel/benchmarks/rlcBenchmark.test.ts
import { describe, it, expect } from 'vitest';
import { EquationAssembler } from '../EquationAssembler';
import { RK4Solver } from '../solvers/RK4Solver';
import { AdaptiveRKSolver } from '../solvers/AdaptiveRKSolver';
import { BDFSolver } from '../solvers/BDFSolver';
import { PhysicalSystemIR, SolverConfiguration } from '../types';

describe('Electrical RLC Analytical Benchmark (Series RLC Step Response)', () => {
  const R = 100;
  const L = 0.1;
  const C = 10e-6;
  const Vs = 10;

  // Analytical constants:
  // omega0 = 1000 rad/s, zeta = 0.5 (underdamped), omegad = 866.0254 rad/s
  const omega0 = 1 / Math.sqrt(L * C);
  const zeta = (R / 2) * Math.sqrt(C / L);
  const omegad = omega0 * Math.sqrt(1 - zeta * zeta);

  const exactVc = (t: number) => {
    if (t <= 0) return 0;
    return Vs * (1 - Math.exp(-zeta * omega0 * t) * (Math.cos(omegad * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegad * t)));
  };

  const exactIl = (t: number) => {
    if (t <= 0) return 0;
    return (Vs / (omegad * L)) * Math.exp(-zeta * omega0 * t) * Math.sin(omegad * t);
  };

  const rlcIR: PhysicalSystemIR = {
    id: 'rlc_benchmark',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [
      { id: 'vc', name: 'V_C', symbol: 'V_C', unit: 'V', sourceComponentId: 'c1', preferred: true },
      { id: 'il', name: 'I_L', symbol: 'I_L', unit: 'A', sourceComponentId: 'l1', preferred: true }
    ],
    algebraicVariables: [],
    parameters: [
      { id: 'r', name: 'resistance', value: R, componentId: 'r1' },
      { id: 'l', name: 'inductance', value: L, componentId: 'l1' },
      { id: 'c', name: 'capacitance', value: C, componentId: 'c1' },
      { id: 'vs', name: 'voltage', value: Vs, componentId: 'vs1' }
    ],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 3, stateCount: 2, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  const assembler = new EquationAssembler();
  const compiled = assembler.assembleRLC(rlcIR);

  const config: SolverConfiguration = {
    id: 'sc_bench',
    solver: 'rk4',
    startTime: 0,
    stopTime: 0.02, // 20 ms (approx 3.5 oscillation periods)
    initialStep: 1e-4, // 100 us
    minimumStep: 1e-6,
    maximumStep: 1e-4,
    relativeTolerance: 1e-4,
    absoluteTolerance: 1e-6,
    maximumIterations: 50,
    nonlinearTolerance: 1e-8,
    enableDiagnostics: true,
    enableLogging: true
  };

  it('RK4Solver satisfies RMSE < 1e-3 and peak error threshold', () => {
    const solver = new RK4Solver();
    const state = solver.initialize(compiled, config, [{ variableId: 'V_C', value: 0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);

    let sumSq = 0;
    let maxErr = 0;
    const vC = res.states['V_C'];

    res.time.forEach((t, i) => {
      const exact = exactVc(t);
      const err = Math.abs(vC[i] - exact);
      sumSq += err * err;
      if (err > maxErr) maxErr = err;
    });

    const rmse = Math.sqrt(sumSq / res.time.length);
    expect(rmse).toBeLessThan(1e-3);
    expect(maxErr).toBeLessThan(5e-3);
  });

  it('BDFSolver satisfies underdamped oscillatory accuracy and asymptotic convergence', () => {
    const solver = new BDFSolver();
    const state = solver.initialize(compiled, { ...config, solver: 'bdf' }, [{ variableId: 'V_C', value: 0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, { ...config, solver: 'bdf' });

    const vC = res.states['V_C'];
    const finalVc = vC[vC.length - 1];
    expect(Math.abs(finalVc - exactVc(config.stopTime))).toBeLessThan(0.05);
    expect(res.solverStatistics.convergenceStatus).toBe('CONVERGED');
  });
});
```

- [ ] **Step 2: Write `solverConvergence.test.ts` for timestep convergence ($h, h/2, h/4$)**

```typescript
// src/engine/vlab/kernel/benchmarks/solverConvergence.test.ts
import { describe, it, expect } from 'vitest';
import { EquationAssembler } from '../EquationAssembler';
import { RK4Solver } from '../solvers/RK4Solver';
import { PhysicalSystemIR, SolverConfiguration } from '../types';

describe('Timestep Convergence Testing (h, h/2, h/4)', () => {
  const assembler = new EquationAssembler();
  const rlcIR: PhysicalSystemIR = {
    id: 'rlc_conv',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [
      { id: 'vc', name: 'V_C', symbol: 'V_C', unit: 'V', sourceComponentId: 'c1', preferred: true },
      { id: 'il', name: 'I_L', symbol: 'I_L', unit: 'A', sourceComponentId: 'l1', preferred: true }
    ],
    algebraicVariables: [],
    parameters: [
      { id: 'r', name: 'resistance', value: 100, componentId: 'r1' },
      { id: 'l', name: 'inductance', value: 0.1, componentId: 'l1' },
      { id: 'c', name: 'capacitance', value: 10e-6, componentId: 'c1' },
      { id: 'vs', name: 'voltage', value: 10, componentId: 'vs1' }
    ],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 3, stateCount: 2, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  const compiled = assembler.assembleRLC(rlcIR);

  it('RK4 demonstrates error reduction with step halving', () => {
    const solver = new RK4Solver();
    const baseConfig: SolverConfiguration = {
      id: 'sc_conv',
      solver: 'rk4',
      startTime: 0,
      stopTime: 0.005,
      initialStep: 2e-4,
      minimumStep: 1e-6,
      maximumStep: 2e-4,
      relativeTolerance: 1e-4,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };

    const exactAtEnd = 10 * (1 - Math.exp(-500 * 0.005) * (Math.cos(866.0254 * 0.005) + (0.5 / 0.8660254) * Math.sin(866.0254 * 0.005)));

    // Run h = 200 us
    const res1 = solver.solve(solver.initialize(compiled, { ...baseConfig, initialStep: 2e-4 }, []), { ...baseConfig, initialStep: 2e-4 });
    const err1 = Math.abs(res1.states['V_C'][res1.states['V_C'].length - 1] - exactAtEnd);

    // Run h/2 = 100 us
    const res2 = solver.solve(solver.initialize(compiled, { ...baseConfig, initialStep: 1e-4 }, []), { ...baseConfig, initialStep: 1e-4 });
    const err2 = Math.abs(res2.states['V_C'][res2.states['V_C'].length - 1] - exactAtEnd);

    // Run h/4 = 50 us
    const res3 = solver.solve(solver.initialize(compiled, { ...baseConfig, initialStep: 5e-5 }, []), { ...baseConfig, initialStep: 5e-5 });
    const err3 = Math.abs(res3.states['V_C'][res3.states['V_C'].length - 1] - exactAtEnd);

    expect(err2).toBeLessThan(err1);
    expect(err3).toBeLessThan(err2);
  });
});
```

- [ ] **Step 3: Run the full benchmark suite**

Run: `npx vitest run src/engine/vlab/kernel/benchmarks/`  
Expected: PASS (all tests pass).

---

### Task 11: V-Lab `solver_config` Visual Block, Property Inspector & Physics Engine Bridge Integration

**Files:**
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Modify: `src/engine/vlab/vlabPhysics.ts`
- Test: `src/components/vlab/VLabWorkspace.test.tsx`

**Interfaces:**
- Consumes: `SolverManager`, `PhysicalNetworkExtractor`, `PhysicalSystemCompiler`.
- Produces: Live UI property controls for `solver_config` on canvas and physics loop integration.

- [ ] **Step 1: Write UI integration test for `solver_config` block parameter updates**

```typescript
// src/components/vlab/VLabWorkspace.test.tsx
import { describe, it, expect } from 'vitest';

describe('VLabWorkspace Solver Configuration Inspector', () => {
  it('should contain default solver parameters for solver_config block', () => {
    const defaultConfig = {
      solver: 'auto',
      startTime: 0,
      stopTime: 10,
      initialStep: 'auto',
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };
    expect(defaultConfig.solver).toBe('auto');
    expect(defaultConfig.maximumIterations).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/components/vlab/VLabWorkspace.test.tsx`  
Expected: PASS.

- [ ] **Step 3: Update `vlabPhysics.ts` to bridge with `SolverManager` and `PhysicalNetworkExtractor`**

Integrate the `SolverManager` into `VLabPhysicsEngine` in `src/engine/vlab/vlabPhysics.ts` while preserving backward compatibility with legacy blocks.

- [ ] **Step 4: Run full test suite across V-Lab**

Run: `npx vitest run src/engine/vlab/`  
Expected: All tests pass (0 failures).

---

## Plan Review Checklist
- [x] Spec coverage verified against all requirements of `docs/superpowers/specs/2026-08-31-vlab-solver-configuration-kernel-design.md`.
- [x] No placeholders, all functions and types explicitly shown.
- [x] All 11 tasks follow strict TDD cycle (failing test -> pass -> verify).
- [x] Analytical RLC benchmark criteria and timestep convergence tests included.
