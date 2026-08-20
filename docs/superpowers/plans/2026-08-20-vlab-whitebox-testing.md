# VLab White-Box Component Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modular, dual-agent/dual-module white-box testing framework for VLab simulation engine components and validate all 6 domain batches against standard analytical and numerical reference models.

**Architecture:** Split the testing system into **Boundary Generator** (creates DAE topological models, excitations, parameter setups) and **Oracle Judge** (analytical closed-form equations, tolerance metrics NRMSE/$\tau$/$E_{ss}$, physics conservation checks), executed via automated Vitest suites.

**Tech Stack:** TypeScript, ReactFlow Node/Edge DAE topology, Vitest 4.1.5, VLabPhysicsEngine & DAEAssembler.

## Global Constraints

- Directory root for white-box framework: `src/engine/vlab/whitebox_benchmarks/`
- Standard tolerances: $\le 1.0\%$ for linear components, $\le 5.0\%$ for non-linear/switched components, $10^{-5}$ for conservation residuals.
- Test runner command: `node ./node_modules/vitest/vitest.mjs run <test-file> --reporter verbose`
- Clean separation: Boundary Generator modules MUST NOT contain hardcoded test assertions; Oracle Judge modules MUST NOT mutate DAE state.

---

### Task 1: Test Infrastructure, Types & Metrics Comparator

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/types.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/oracle_judge/ToleranceProfiles.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/oracle_judge/MetricsComparator.ts`
- Test: `src/engine/vlab/whitebox_benchmarks/oracle_judge/metrics_comparator.test.ts`

**Interfaces:**
- Produces:
  - `VLabTestBoundary`, `VLabExcitation`, `VLabProbe` in `types.ts`
  - `ToleranceProfile`, `DEFAULT_TOLERANCE_PROFILES` in `ToleranceProfiles.ts`
  - `MetricsComparator.calculateNRMSE()`, `MetricsComparator.calculateTimeConstant()`, `MetricsComparator.judgeTrajectory()` in `MetricsComparator.ts`

- [ ] **Step 1: Write the failing test for MetricsComparator**

```typescript
// src/engine/vlab/whitebox_benchmarks/oracle_judge/metrics_comparator.test.ts
import { describe, expect, it } from 'vitest';
import { MetricsComparator } from './MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from './ToleranceProfiles';

describe('MetricsComparator', () => {
  it('calculates exact 0% NRMSE for identical trajectories', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const yRef = [0, 0.632, 0.865, 0.950, 0.982, 0.993];
    const ySim = [...yRef];
    const nrmse = MetricsComparator.calculateNRMSE(ySim, yRef);
    expect(nrmse).toBeCloseTo(0, 5);
  });

  it('correctly extracts 63.2% time constant tau from first-order trajectory', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0];
    const tau = 0.2;
    const ySim = t.map((time) => 10 * (1 - Math.exp(-time / tau)));
    const calculatedTau = MetricsComparator.calculateTimeConstant(t, ySim, 10);
    expect(calculatedTau).toBeCloseTo(0.2, 2);
  });

  it('passes judgment against linear tolerance profile for valid response', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const yRef = t.map((time) => 5 * (1 - Math.exp(-time / 0.1)));
    const ySim = yRef.map((val) => val * 1.005); // 0.5% offset
    const verdict = MetricsComparator.judgeTrajectory(t, ySim, yRef, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/oracle_judge/metrics_comparator.test.ts`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Implement Types, ToleranceProfiles and MetricsComparator**

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/types.ts
import { Node, Edge } from 'reactflow';

export interface VLabProbe {
  id: string;
  sourceNodeId: string;
  sourceHandle: string;
  variableName: string;
  unit: string;
}

export interface VLabExcitation {
  type: 'step' | 'sine' | 'ramp' | 'pulse' | 'constant';
  sourceNodeId: string;
  amplitude: number;
  frequency?: number;
  offset?: number;
  startTime?: number;
}

export interface VLabTestBoundary {
  id: string;
  name: string;
  domain: 'electrical' | 'mechanical' | 'thermal' | 'fluid' | 'electromechanical' | 'signal';
  nodes: Node[];
  edges: Edge[];
  dt: number;
  totalTime: number;
  excitation: VLabExcitation;
  probes: VLabProbe[];
}

export interface SimulationTrajectory {
  time: number[];
  signals: Record<string, number[]>;
  finalState?: any;
}
```

```typescript
// src/engine/vlab/whitebox_benchmarks/oracle_judge/ToleranceProfiles.ts
export interface ToleranceProfile {
  maxNrmsePercent: number;
  maxSteadyStateErrorPercent: number;
  maxTauErrorPercent: number;
  maxResidualNorm: number;
}

export const DEFAULT_TOLERANCE_PROFILES: Record<string, ToleranceProfile> = {
  linear: {
    maxNrmsePercent: 1.0,
    maxSteadyStateErrorPercent: 1.0,
    maxTauErrorPercent: 2.0,
    maxResidualNorm: 1e-5,
  },
  nonlinear: {
    maxNrmsePercent: 5.0,
    maxSteadyStateErrorPercent: 3.0,
    maxTauErrorPercent: 5.0,
    maxResidualNorm: 1e-4,
  },
  conservation: {
    maxNrmsePercent: 1.0,
    maxSteadyStateErrorPercent: 0.5,
    maxTauErrorPercent: 1.0,
    maxResidualNorm: 1e-6,
  },
};
```

```typescript
// src/engine/vlab/whitebox_benchmarks/oracle_judge/MetricsComparator.ts
import { ToleranceProfile } from './ToleranceProfiles';

export interface JudgmentVerdict {
  passed: boolean;
  nrmsePercent: number;
  steadyStateErrorPercent: number;
  tauSim?: number;
  tauRef?: number;
  tauErrorPercent?: number;
  diagnostics: string[];
}

export class MetricsComparator {
  static calculateNRMSE(ySim: number[], yRef: number[]): number {
    if (ySim.length !== yRef.length || ySim.length === 0) return 100;
    let sumSq = 0;
    let minRef = Infinity;
    let maxRef = -Infinity;

    for (let i = 0; i < yRef.length; i++) {
      const err = ySim[i] - yRef[i];
      sumSq += err * err;
      if (yRef[i] < minRef) minRef = yRef[i];
      if (yRef[i] > maxRef) maxRef = yRef[i];
    }
    const rmse = Math.sqrt(sumSq / yRef.length);
    const range = maxRef - minRef;
    if (Math.abs(range) < 1e-9) {
      return rmse < 1e-7 ? 0 : 100;
    }
    return (rmse / range) * 100;
  }

  static calculateTimeConstant(time: number[], signal: number[], finalValue: number): number {
    const target = (1 - Math.exp(-1)) * finalValue; // 63.2%
    for (let i = 0; i < signal.length - 1; i++) {
      if ((signal[i] <= target && signal[i + 1] >= target) || (signal[i] >= target && signal[i + 1] <= target)) {
        const t0 = time[i];
        const t1 = time[i + 1];
        const v0 = signal[i];
        const v1 = signal[i + 1];
        if (Math.abs(v1 - v0) < 1e-12) return t0;
        return t0 + (target - v0) * ((t1 - t0) / (v1 - v0));
      }
    }
    return time[time.length - 1];
  }

  static judgeTrajectory(
    time: number[],
    ySim: number[],
    yRef: number[],
    profile: ToleranceProfile,
    refTau?: number
  ): JudgmentVerdict {
    const diagnostics: string[] = [];
    const nrmsePercent = this.calculateNRMSE(ySim, yRef);

    const simFinal = ySim[ySim.length - 1] ?? 0;
    const refFinal = yRef[yRef.length - 1] ?? 0;
    const ssDenom = Math.abs(refFinal) > 1e-9 ? Math.abs(refFinal) : 1.0;
    const steadyStateErrorPercent = (Math.abs(simFinal - refFinal) / ssDenom) * 100;

    let tauSim: number | undefined;
    let tauErrorPercent: number | undefined;

    if (refTau && refTau > 0) {
      tauSim = this.calculateTimeConstant(time, ySim, refFinal);
      tauErrorPercent = (Math.abs(tauSim - refTau) / refTau) * 100;
      if (tauErrorPercent > profile.maxTauErrorPercent) {
        diagnostics.push(`Tau error ${tauErrorPercent.toFixed(2)}% exceeds limit ${profile.maxTauErrorPercent}%`);
      }
    }

    if (nrmsePercent > profile.maxNrmsePercent) {
      diagnostics.push(`NRMSE ${nrmsePercent.toFixed(2)}% exceeds limit ${profile.maxNrmsePercent}%`);
    }
    if (steadyStateErrorPercent > profile.maxSteadyStateErrorPercent) {
      diagnostics.push(`Steady state error ${steadyStateErrorPercent.toFixed(2)}% exceeds limit ${profile.maxSteadyStateErrorPercent}%`);
    }

    return {
      passed: diagnostics.length === 0,
      nrmsePercent,
      steadyStateErrorPercent,
      tauSim,
      tauRef: refTau,
      tauErrorPercent,
      diagnostics,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/oracle_judge/metrics_comparator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): add boundary types, tolerance profiles, and metrics comparator"
```

---

### Task 2: Oracle Judge Analytical Baselines & Simulation Runner Harness

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/oracle_judge/AnalyticalBaselines.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/SimulationHarness.ts`
- Test: `src/engine/vlab/whitebox_benchmarks/oracle_judge/analytical_baselines.test.ts`

**Interfaces:**
- Produces:
  - `AnalyticalBaselines.rcCharging()`, `AnalyticalBaselines.rlStep()`, `AnalyticalBaselines.massSpringDamper()`, `AnalyticalBaselines.thermalConduction()`, `AnalyticalBaselines.orificeFlow()`, `AnalyticalBaselines.dcMotorSpeed()` in `AnalyticalBaselines.ts`
  - `SimulationHarness.runBoundarySimulation()` in `SimulationHarness.ts`

- [ ] **Step 1: Write failing test for AnalyticalBaselines & SimulationHarness**

```typescript
// src/engine/vlab/whitebox_benchmarks/oracle_judge/analytical_baselines.test.ts
import { describe, expect, it } from 'vitest';
import { AnalyticalBaselines } from './AnalyticalBaselines';

describe('AnalyticalBaselines', () => {
  it('computes exact RC step response values', () => {
    const t = [0, 0.1, 0.2];
    const traj = AnalyticalBaselines.rcCharging(t, 10, 1000, 100e-6); // tau = 0.1s
    expect(traj[0]).toBe(0);
    expect(traj[1]).toBeCloseTo(10 * (1 - Math.exp(-1)), 4);
  });

  it('computes exact second-order mass-spring-damper trajectory', () => {
    const t = [0, 0.05, 0.1];
    const traj = AnalyticalBaselines.massSpringDamper(t, 10, 1.0, 100, 4); // m=1, k=100, b=4
    expect(traj[0]).toBe(0);
    expect(Number.isFinite(traj[1])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/oracle_judge/analytical_baselines.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement AnalyticalBaselines and SimulationHarness**

```typescript
// src/engine/vlab/whitebox_benchmarks/oracle_judge/AnalyticalBaselines.ts
export class AnalyticalBaselines {
  static rcCharging(time: number[], Vs: number, R: number, C: number): number[] {
    const tau = R * C;
    return time.map((t) => Vs * (1 - Math.exp(-t / tau)));
  }

  static rlStep(time: number[], Vs: number, R: number, L: number): number[] {
    const tau = L / R;
    const Iss = Vs / R;
    return time.map((t) => Iss * (1 - Math.exp(-t / tau)));
  }

  static massSpringDamper(time: number[], F0: number, m: number, k: number, b: number): number[] {
    const wn = Math.sqrt(k / m);
    const zeta = b / (2 * Math.sqrt(k * m));
    const xss = F0 / k;

    if (zeta < 1.0) {
      // Underdamped
      const wd = wn * Math.sqrt(1 - zeta * zeta);
      return time.map((t) => {
        const decay = Math.exp(-zeta * wn * t);
        const osc = Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t);
        return xss * (1 - decay * osc);
      });
    } else {
      // Overdamped / Critically damped
      const s1 = -wn * (zeta - Math.sqrt(zeta * zeta - 1));
      const s2 = -wn * (zeta + Math.sqrt(zeta * zeta - 1));
      return time.map((t) => xss * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1)));
    }
  }

  static thermalConduction(time: number[], T_hot: number, T_init: number, Rth: number, Cth: number): number[] {
    const tau = Rth * Cth;
    return time.map((t) => T_hot - (T_hot - T_init) * Math.exp(-t / tau));
  }

  static orificeFlow(dP: number, Cd: number, A: number, rho: number): number {
    return Cd * A * Math.sqrt(2 * rho * Math.abs(dP)) * Math.sign(dP);
  }

  static dcMotorSpeed(time: number[], Va: number, Ra: number, La: number, Kt: number, Ke: number, J: number, b: number): number[] {
    const denom = Ra * b + Kt * Ke;
    const w_ss = (Kt * Va) / denom;
    const tau_m = (J * Ra) / denom;
    return time.map((t) => w_ss * (1 - Math.exp(-t / tau_m)));
  }
}
```

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/SimulationHarness.ts
import { VLabPhysicsEngine } from '../vlabPhysics';
import { VLabTestBoundary, SimulationTrajectory } from './types';

export class SimulationHarness {
  static runBoundarySimulation(boundary: VLabTestBoundary): SimulationTrajectory {
    const engine = new VLabPhysicsEngine();
    let state: any = null;
    const time: number[] = [];
    const signals: Record<string, number[]> = {};

    boundary.probes.forEach((p) => {
      signals[p.variableName] = [];
    });

    const totalSteps = Math.round(boundary.totalTime / boundary.dt);

    for (let step = 0; step <= totalSteps; step++) {
      const currentTime = step * boundary.dt;
      time.push(currentTime);

      state = engine.simulateStep(boundary.nodes, boundary.edges, state, boundary.dt);

      boundary.probes.forEach((probe) => {
        let val = 0;
        if (state?.scopeValues !== undefined) {
          if (typeof state.scopeValues === 'number') {
            val = state.scopeValues;
          } else if (state.scopeValues && typeof state.scopeValues === 'object') {
            val = (state.scopeValues as any)[probe.variableName] ?? (state.scopeValues as any).value ?? 0;
          }
        }
        signals[probe.variableName].push(Number.isFinite(val) ? val : 0);
      });
    }

    return { time, signals, finalState: state };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/oracle_judge/analytical_baselines.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): implement analytical baselines and simulation harness"
```

---

### Task 3: Electrical Domain White-Box Fixtures & Test Suite

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/ElectricalFixtures.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/suites/electrical_whitebox.test.ts`

**Interfaces:**
- Produces:
  - `ElectricalFixtures.createResistorDCCircuit()`, `ElectricalFixtures.createRCChargingCircuit()`, `ElectricalFixtures.createRLStepCircuit()`, `ElectricalFixtures.createDiodeForwardCircuit()`

- [ ] **Step 1: Write failing test suite for Electrical Domain**

```typescript
// src/engine/vlab/whitebox_benchmarks/suites/electrical_whitebox.test.ts
import { describe, expect, it } from 'vitest';
import { ElectricalFixtures } from '../boundary_generator/ElectricalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from '../oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Electrical Domain Batch', () => {
  it('E-01: Validates Ohm\'s law resistor DC current and voltage', () => {
    const boundary = ElectricalFixtures.createResistorDCCircuit(12, 100); // 12V, 100 Ohm -> 0.12A
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredV = result.signals['V_resistor'];
    const expectedV = result.time.map(() => 12.0);
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredV, expectedV, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
  });

  it('E-02: Validates RC circuit charging curve against analytical formula', () => {
    const R = 1000;
    const C = 100e-6; // tau = 0.1s
    const Vs = 10;
    const boundary = ElectricalFixtures.createRCChargingCircuit(Vs, R, C, 0.5);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredVc = result.signals['V_cap'];
    const expectedVc = AnalyticalBaselines.rcCharging(result.time, Vs, R, C);
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredVc, expectedVc, DEFAULT_TOLERANCE_PROFILES.linear, R * C);
    expect(verdict.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/electrical_whitebox.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ElectricalFixtures**

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/ElectricalFixtures.ts
import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class ElectricalFixtures {
  static createResistorDCCircuit(Vs: number, R: number): VLabTestBoundary {
    return {
      id: 'e_resistor_dc',
      name: 'Resistor DC Circuit',
      domain: 'electrical',
      dt: 0.001,
      totalTime: 0.05,
      excitation: { type: 'constant', sourceNodeId: 'src', amplitude: Vs },
      nodes: [
        node('src', 'dc_voltage', { V: Vs }),
        node('res', 'resistor', { R }),
        node('sensor', 'v_sensor'),
        node('scope', 'scope'),
        node('gnd', 'ground'),
      ],
      edges: [
        edge('e1', 'src', 'p_s', 'res', 'p_t'),
        edge('e2', 'res', 'n_s', 'gnd', 'a_t'),
        edge('e3', 'src', 'n_s', 'gnd', 'a_t'),
        edge('e4', 'res', 'p_s', 'sensor', 'p_t'),
        edge('e5', 'res', 'n_s', 'sensor', 'n_t'),
        edge('e6', 'sensor', 'v_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'v_s', variableName: 'V_resistor', unit: 'V' }],
    };
  }

  static createRCChargingCircuit(Vs: number, R: number, C: number, duration = 0.5): VLabTestBoundary {
    return {
      id: 'e_rc_charging',
      name: 'RC Charging Step Response',
      domain: 'electrical',
      dt: 0.001,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 'src', amplitude: Vs },
      nodes: [
        node('src', 'dc_voltage', { V: Vs }),
        node('res', 'resistor', { R }),
        node('cap', 'capacitor', { C }),
        node('sensor', 'v_sensor'),
        node('scope', 'scope'),
        node('gnd', 'ground'),
      ],
      edges: [
        edge('e1', 'src', 'p_s', 'res', 'p_t'),
        edge('e2', 'res', 'n_s', 'cap', 'p_t'),
        edge('e3', 'cap', 'n_s', 'gnd', 'a_t'),
        edge('e4', 'src', 'n_s', 'gnd', 'a_t'),
        edge('e5', 'cap', 'p_s', 'sensor', 'p_t'),
        edge('e6', 'cap', 'n_s', 'sensor', 'n_t'),
        edge('e7', 'sensor', 'v_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'v_s', variableName: 'V_cap', unit: 'V' }],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/electrical_whitebox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): implement electrical fixtures and white-box test suite"
```

---

### Task 4: Mechanical Domain White-Box Fixtures & Test Suite

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/MechanicalFixtures.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/suites/mechanical_whitebox.test.ts`

**Interfaces:**
- Produces:
  - `MechanicalFixtures.createMassSpringDamper()`, `MechanicalFixtures.createInertiaDamper()`, `MechanicalFixtures.createGearbox()`

- [ ] **Step 1: Write failing test suite for Mechanical Domain**

```typescript
// src/engine/vlab/whitebox_benchmarks/suites/mechanical_whitebox.test.ts
import { describe, expect, it } from 'vitest';
import { MechanicalFixtures } from '../boundary_generator/MechanicalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from '../oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Mechanical Domain Batch', () => {
  it('M-01: Validates mass-spring-damper step response against 2nd order analytical solution', () => {
    const F0 = 10;
    const m = 1.0;
    const k = 100;
    const b = 4.0;
    const boundary = MechanicalFixtures.createMassSpringDamper(F0, m, k, b, 1.0);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredX = result.signals['x_mass'];
    const expectedX = AnalyticalBaselines.massSpringDamper(result.time, F0, m, k, b);
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredX, expectedX, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/mechanical_whitebox.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement MechanicalFixtures**

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/MechanicalFixtures.ts
import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class MechanicalFixtures {
  static createMassSpringDamper(F0: number, m: number, k: number, b: number, duration = 1.0): VLabTestBoundary {
    return {
      id: 'm_mass_spring_damper',
      name: 'Mass Spring Damper Step Response',
      domain: 'mechanical',
      dt: 0.001,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 'force', amplitude: F0 },
      nodes: [
        node('force', 'force_source', { F: F0 }),
        node('mass', 'mass', { m }),
        node('spring', 'trans_spring', { k }),
        node('damper', 'trans_damper', { b }),
        node('sensor', 'trans_motion_sensor'),
        node('scope', 'scope'),
        node('ref', 'mechanical_reference'),
      ],
      edges: [
        edge('e1', 'force', 'r_s', 'mass', 'a_t'),
        edge('e2', 'mass', 'a_s', 'spring', 'a_t'),
        edge('e3', 'mass', 'a_s', 'damper', 'a_t'),
        edge('e4', 'spring', 'b_s', 'ref', 'a_t'),
        edge('e5', 'damper', 'b_s', 'ref', 'a_t'),
        edge('e6', 'force', 'c_s', 'ref', 'a_t'),
        edge('e7', 'mass', 'a_s', 'sensor', 'a_t'),
        edge('e8', 'sensor', 'b_s', 'ref', 'a_t'),
        edge('e9', 'sensor', 'x_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'x_s', variableName: 'x_mass', unit: 'm' }],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/mechanical_whitebox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): implement mechanical fixtures and white-box test suite"
```

---

### Task 5: Thermal & Fluid Domain White-Box Fixtures & Test Suites

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/ThermalFixtures.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/FluidFixtures.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/suites/thermal_whitebox.test.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/suites/fluid_whitebox.test.ts`

- [ ] **Step 1: Write failing test suites for Thermal and Fluid Domains**

```typescript
// src/engine/vlab/whitebox_benchmarks/suites/thermal_whitebox.test.ts
import { describe, expect, it } from 'vitest';
import { ThermalFixtures } from '../boundary_generator/ThermalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from '../oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Thermal Domain Batch', () => {
  it('T-01: Validates 1D thermal conduction and thermal mass transient temperature rise', () => {
    const Thot = 373.15; // 100 C
    const T0 = 293.15;   // 20 C
    const Rth = 2.0;
    const Cth = 50.0;
    const boundary = ThermalFixtures.createThermalConductionCircuit(Thot, T0, Rth, Cth, 200.0);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredT = result.signals['T_mass'];
    const expectedT = AnalyticalBaselines.thermalConduction(result.time, Thot, T0, Rth, Cth);
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredT, expectedT, DEFAULT_TOLERANCE_PROFILES.linear, Rth * Cth);
    expect(verdict.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/thermal_whitebox.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Thermal and Fluid Fixtures and Suites**

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/ThermalFixtures.ts
import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class ThermalFixtures {
  static createThermalConductionCircuit(Thot: number, Tinit: number, Rth: number, Cth: number, duration = 200.0): VLabTestBoundary {
    return {
      id: 't_conduction_mass',
      name: 'Thermal Conduction Mass Transient',
      domain: 'thermal',
      dt: 0.1,
      totalTime: duration,
      excitation: { type: 'constant', sourceNodeId: 'src', amplitude: Thot },
      nodes: [
        node('src', 'temperature_source', { T: Thot }),
        node('res', 'conductive_heat', { Rth }),
        node('mass', 'thermal_mass', { C: Cth, T_init: Tinit }),
        node('sensor', 'temp_sensor'),
        node('scope', 'scope'),
        node('ref', 'thermal_reference'),
      ],
      edges: [
        edge('e1', 'src', 'a_s', 'res', 'a_t'),
        edge('e2', 'res', 'b_s', 'mass', 'a_t'),
        edge('e3', 'mass', 'a_s', 'sensor', 'a_t'),
        edge('e4', 'sensor', 'b_s', 'ref', 'a_t'),
        edge('e5', 'sensor', 't_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 't_s', variableName: 'T_mass', unit: 'K' }],
    };
  }
}
```

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/FluidFixtures.ts
import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class FluidFixtures {
  static createPipeResistanceCircuit(Psource: number, Rf: number): VLabTestBoundary {
    return {
      id: 'f_pipe_resistance',
      name: 'Laminar Fluid Pipe Flow',
      domain: 'fluid',
      dt: 0.001,
      totalTime: 0.05,
      excitation: { type: 'constant', sourceNodeId: 'src', amplitude: Psource },
      nodes: [
        node('src', 'pressure_source', { P: Psource }),
        node('pipe', 'fluid_resistance', { Rf }),
        node('ref', 'fluid_reference'),
        node('sensor', 'flow_sensor'),
        node('scope', 'scope'),
      ],
      edges: [
        edge('e1', 'src', 'p_s', 'pipe', 'p1_t'),
        edge('e2', 'pipe', 'p2_s', 'sensor', 'p1_t'),
        edge('e3', 'sensor', 'p2_s', 'ref', 'a_t'),
        edge('e4', 'sensor', 'mdot_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'mdot_s', variableName: 'mdot', unit: 'kg/s' }],
    };
  }
}
```

```typescript
// src/engine/vlab/whitebox_benchmarks/suites/fluid_whitebox.test.ts
import { describe, expect, it } from 'vitest';
import { FluidFixtures } from '../boundary_generator/FluidFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Fluid Domain Batch', () => {
  it('F-01: Validates laminar fluid resistance pressure drop to mass flow relationship', () => {
    const P = 1000;
    const Rf = 500;
    const boundary = FluidFixtures.createPipeResistanceCircuit(P, Rf);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredMdot = result.signals['mdot'];
    const expectedMdot = result.time.map(() => P / Rf); // 2 kg/s
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredMdot, expectedMdot, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/thermal_whitebox.test.ts src/engine/vlab/whitebox_benchmarks/suites/fluid_whitebox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): implement thermal and fluid white-box test fixtures and suites"
```

---

### Task 6: Electromechanical & Signal Domain White-Box Fixtures & Test Suites

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/ElectromechanicalFixtures.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/boundary_generator/SignalFixtures.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/suites/electromechanical_whitebox.test.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/suites/signal_whitebox.test.ts`

- [ ] **Step 1: Write failing test suites for Electromechanical and Signal Domains**

```typescript
// src/engine/vlab/whitebox_benchmarks/suites/electromechanical_whitebox.test.ts
import { describe, expect, it } from 'vitest';
import { ElectromechanicalFixtures } from '../boundary_generator/ElectromechanicalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from '../oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Electromechanical Batch', () => {
  it('EM-01: Validates DC motor electromechanical speed step response', () => {
    const Va = 24;
    const Ra = 2.0;
    const La = 0.005;
    const Kt = 0.05;
    const Ke = 0.05;
    const J = 0.001;
    const b = 0.0001;
    const boundary = ElectromechanicalFixtures.createDCMotorCircuit(Va, Ra, La, Kt, Ke, J, b, 0.2);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredW = result.signals['omega'];
    const expectedW = AnalyticalBaselines.dcMotorSpeed(result.time, Va, Ra, La, Kt, Ke, J, b);
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredW, expectedW, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/electromechanical_whitebox.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Electromechanical and Signal Fixtures and Suites**

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/ElectromechanicalFixtures.ts
import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class ElectromechanicalFixtures {
  static createDCMotorCircuit(Va: number, Ra: number, La: number, Kt: number, Ke: number, J: number, b: number, duration = 0.2): VLabTestBoundary {
    return {
      id: 'em_dc_motor',
      name: 'DC Motor Electromechanical Transient',
      domain: 'electromechanical',
      dt: 0.0005,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 'src', amplitude: Va },
      nodes: [
        node('src', 'dc_voltage', { V: Va }),
        node('motor', 'rotational_electromechanical_converter', { K: Kt, R: Ra }),
        node('inertia', 'inertia', { J }),
        node('damper', 'rot_damper', { D: b }),
        node('sensor', 'rot_motion_sensor'),
        node('scope', 'scope'),
        node('gnd', 'ground'),
        node('mech_ref', 'rotational_reference'),
      ],
      edges: [
        edge('e1', 'src', 'p_s', 'motor', 'p_t'),
        edge('e2', 'motor', 'n_s', 'gnd', 'a_t'),
        edge('e3', 'src', 'n_s', 'gnd', 'a_t'),
        edge('e4', 'motor', 'r_s', 'inertia', 'a_t'),
        edge('e5', 'inertia', 'a_s', 'damper', 'a_t'),
        edge('e6', 'damper', 'b_s', 'mech_ref', 'a_t'),
        edge('e7', 'motor', 'c_s', 'mech_ref', 'a_t'),
        edge('e8', 'inertia', 'a_s', 'sensor', 'a_t'),
        edge('e9', 'sensor', 'w_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'w_s', variableName: 'omega', unit: 'rad/s' }],
    };
  }
}
```

```typescript
// src/engine/vlab/whitebox_benchmarks/boundary_generator/SignalFixtures.ts
import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class SignalFixtures {
  static createGainSaturationCircuit(gain: number, upperLimit: number, lowerLimit: number, inputVal: number): VLabTestBoundary {
    return {
      id: 'sig_gain_sat',
      name: 'Signal Gain & Saturation',
      domain: 'signal',
      dt: 0.001,
      totalTime: 0.01,
      excitation: { type: 'constant', sourceNodeId: 'const', amplitude: inputVal },
      nodes: [
        node('const', 'ps_constant', { value: inputVal }),
        node('gain', 'ps_gain', { gain }),
        node('sat', 'ps_saturation', { upper: upperLimit, lower: lowerLimit }),
        node('scope', 'scope'),
      ],
      edges: [
        edge('e1', 'const', 'out_s', 'gain', 'in_t'),
        edge('e2', 'gain', 'out_s', 'sat', 'in_t'),
        edge('e3', 'sat', 'out_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sat', sourceHandle: 'out_s', variableName: 'clamped_out', unit: '1' }],
    };
  }
}
```

```typescript
// src/engine/vlab/whitebox_benchmarks/suites/signal_whitebox.test.ts
import { describe, expect, it } from 'vitest';
import { SignalFixtures } from '../boundary_generator/SignalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Signal / Controls Batch', () => {
  it('S-01: Validates signal gain and saturation bounds', () => {
    const input = 10;
    const gain = 2.0; // 20
    const upper = 15;
    const lower = -15;
    const boundary = SignalFixtures.createGainSaturationCircuit(gain, upper, lower, input);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measured = result.signals['clamped_out'];
    const expected = result.time.map(() => 15.0); // Clamped at 15
    const verdict = MetricsComparator.judgeTrajectory(result.time, measured, expected, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/suites/electromechanical_whitebox.test.ts src/engine/vlab/whitebox_benchmarks/suites/signal_whitebox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): implement electromechanical and signal white-box test suites"
```

---

### Task 7: Full Multi-Domain White-Box Benchmark Suite Certification & Summary Reporter

**Files:**
- Create: `src/engine/vlab/whitebox_benchmarks/vlab_whitebox_master.test.ts`
- Create: `src/engine/vlab/whitebox_benchmarks/WhiteboxReporter.ts`

- [ ] **Step 1: Write master white-box certification runner test**

```typescript
// src/engine/vlab/whitebox_benchmarks/vlab_whitebox_master.test.ts
import { describe, expect, it } from 'vitest';
import { ElectricalFixtures } from './boundary_generator/ElectricalFixtures';
import { MechanicalFixtures } from './boundary_generator/MechanicalFixtures';
import { ThermalFixtures } from './boundary_generator/ThermalFixtures';
import { FluidFixtures } from './boundary_generator/FluidFixtures';
import { ElectromechanicalFixtures } from './boundary_generator/ElectromechanicalFixtures';
import { SignalFixtures } from './boundary_generator/SignalFixtures';
import { SimulationHarness } from './boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from './oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from './oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from './oracle_judge/ToleranceProfiles';

describe('VLab Multi-Domain White-Box Master Certification', () => {
  it('Certifies all 6 physics domain batches pass Oracle Judge thresholds', () => {
    // 1. Electrical
    const rRes = SimulationHarness.runBoundarySimulation(ElectricalFixtures.createResistorDCCircuit(12, 100));
    const rJudg = MetricsComparator.judgeTrajectory(rRes.time, rRes.signals['V_resistor'], rRes.time.map(() => 12), DEFAULT_TOLERANCE_PROFILES.linear);
    expect(rJudg.passed).toBe(true);

    // 2. Mechanical
    const mRes = SimulationHarness.runBoundarySimulation(MechanicalFixtures.createMassSpringDamper(10, 1, 100, 4, 0.5));
    const mExp = AnalyticalBaselines.massSpringDamper(mRes.time, 10, 1, 100, 4);
    const mJudg = MetricsComparator.judgeTrajectory(mRes.time, mRes.signals['x_mass'], mExp, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(mJudg.passed).toBe(true);

    // 3. Thermal
    const tRes = SimulationHarness.runBoundarySimulation(ThermalFixtures.createThermalConductionCircuit(373.15, 293.15, 2.0, 50.0, 50.0));
    const tExp = AnalyticalBaselines.thermalConduction(tRes.time, 373.15, 293.15, 2.0, 50.0);
    const tJudg = MetricsComparator.judgeTrajectory(tRes.time, tRes.signals['T_mass'], tExp, DEFAULT_TOLERANCE_PROFILES.linear, 100.0);
    expect(tJudg.passed).toBe(true);

    // 4. Fluid
    const fRes = SimulationHarness.runBoundarySimulation(FluidFixtures.createPipeResistanceCircuit(1000, 500));
    const fJudg = MetricsComparator.judgeTrajectory(fRes.time, fRes.signals['mdot'], fRes.time.map(() => 2.0), DEFAULT_TOLERANCE_PROFILES.linear);
    expect(fJudg.passed).toBe(true);

    // 5. Electromechanical
    const emRes = SimulationHarness.runBoundarySimulation(ElectromechanicalFixtures.createDCMotorCircuit(24, 2, 0.005, 0.05, 0.05, 0.001, 0.0001, 0.1));
    const emExp = AnalyticalBaselines.dcMotorSpeed(emRes.time, 24, 2, 0.005, 0.05, 0.05, 0.001, 0.0001);
    const emJudg = MetricsComparator.judgeTrajectory(emRes.time, emRes.signals['omega'], emExp, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(emJudg.passed).toBe(true);

    // 6. Signal
    const sRes = SimulationHarness.runBoundarySimulation(SignalFixtures.createGainSaturationCircuit(2, 15, -15, 10));
    const sJudg = MetricsComparator.judgeTrajectory(sRes.time, sRes.signals['clamped_out'], sRes.time.map(() => 15), DEFAULT_TOLERANCE_PROFILES.linear);
    expect(sJudg.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run all white-box benchmark test suites**

Run: `node ./node_modules/vitest/vitest.mjs run src/engine/vlab/whitebox_benchmarks/`
Expected: ALL PASS

- [ ] **Step 3: Commit and finalize**

```bash
git add src/engine/vlab/whitebox_benchmarks/
git commit -m "feat(vlab-test): complete full multi-domain white-box certification suite"
```
