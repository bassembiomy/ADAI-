import { Node, Edge } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { ImplicitSolver } from './ImplicitSolver';
import { SparseLinearSolver } from './SparseLinearSolver';
import { EquationContext, AssembledSystem, PhysicalDomain } from './types';
import { SolverConfiguration } from './kernel/types';
import { explicitSolverStep } from './ExplicitSolverAdapter';
import { initializeJointFrames } from './vlabJointInitialization';
import { jointKindOf, isJointMultiplierName } from './vlabJointCore';
import { assertValidTopology } from './vlabTopologyValidation';
import { assertStructurallyWellPosed, DAEStructureError } from './vlabStructure';
import {
  BlockEquationError, NonFiniteResidualError, SolverConvergenceError, VLabSolverDiagnosticError, type WorstResidualRow,
} from './vlabResidualDiagnostics';
import { readSolvedVariable } from './vlabScopeRead';
import { scopeTraceKey } from './vlabVectorPorts';
import { numericParam, stringParam } from './vlabParams';
import { twoLevelReferences, triangularCarrier, beltEndStiffness, SIGNAL_TIME_QUANTUM, SIGNAL_LOGIC_THRESHOLD } from './vlabEquations';
import { ddtVector } from './vlabDiscretization';
import { cloneHistory, recordHistory } from './vlabHistory';
import { RESET_BLOCKS, SAMPLE_PERIODS } from './vlabControllers';
import { RHO_WATER_LIQUID, STANDARD_ATMOSPHERE, moistAirState } from './vlabFluidProperties';

// SDIRK-3 Butcher tableau constants
const GAMMA = 0.4358665215;
const A21 = 0.5 * (1 - GAMMA);
const A31 = -0.25 * (6 * GAMMA * GAMMA - 16 * GAMMA + 1);
const A32 = 0.25 * (6 * GAMMA * GAMMA - 20 * GAMMA + 5);

/**
 * Zero-crossing dead band (indicator units: V, A or rad). The indicator of a step that starts within this band of the
 * event surface is ignored (the crossing was just localized by the previous cut step). Chosen well above the solver
 * residual tolerance (1e-8) and far below any physical threshold.
 */
const EVENT_BAND = 1e-7;
/** Step-size controller safety factor: the accepted local error settles near STEP_SAFETY^3 of the tolerance (Hairer, Norsett & Wanner I, II.4). */
const STEP_SAFETY = 0.7;

/** The error estimate exceeds the tolerance at the minimum step (WP-31b: reported, never accepted). */
class ToleranceAtMinimumStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToleranceAtMinimumStepError';
  }
}

/**
 * Earliest sign change of an event indicator between two indicator vectors (linear-interpolation fraction of the interval).
 * `interior` = the start of the interval is a bracket end inside a step, not the step start: the EVENT_BAND rule (a step
 * that starts on the event surface is not a new crossing) applies only at the step start. `locked` indicators are skipped.
 */
function firstCrossing(
  gStart: number[], gEnd: number[], locked?: Set<number>, interior = false,
): { index: number; fraction: number } | undefined {
  let best: { index: number; fraction: number } | undefined;
  for (let i = 0; i < gStart.length; i++) {
    if (locked?.has(i)) continue;
    const a = gStart[i], b = gEnd[i];
    if (!interior && Math.abs(a) <= EVENT_BAND) continue;
    // a step that ENDS on the surface (|b| within EVENT_BAND, from an off-surface start) has an ambiguous mode at its end (the
    // solved indicator sits at the round-off / Newton-tolerance noise of the root): it is the crossing, taken as touching at b
    const touches = !interior && Math.abs(b) <= EVENT_BAND && Math.abs(a) > EVENT_BAND;
    if (a * b < 0 || touches) {
      const fraction = Math.abs(a) / (Math.abs(a) + Math.abs(b));
      if (!best || fraction < best.fraction) best = { index: i, fraction };
    }
  }
  return best;
}

export class VLabPhysicsEngine {
  private assembler: DAEAssembler;
  private solver: ImplicitSolver;
  private currentSystem: AssembledSystem | null = null;
  private prevTopologyHash: string = '';
  private solverConfiguration: SolverConfiguration | null;
  /**
   * Max rejected step attempts inside one simulateStep call. Accepted steps are
   * not counted, so long fine-step runs (e.g. µs PWM) are never cut off.
   */
  private maxStepAttempts = 20000;
  /** Pre-simulation topology validation (vlabTopologyValidation). Always on in product paths. */
  private topologyValidationEnabled = true;

  /**
   * Disable pre-simulation topology validation. ONLY for assembler/solver unit tests that deliberately drive an
   * incomplete network (e.g. one block with unwired inputs). The editor and the worker never call this.
   */
  setTopologyValidation(enabled: boolean): void {
    this.topologyValidationEnabled = enabled;
  }

  /** Fixed-step mode (see setFixedStep). */
  private fixedStep = false;

  /**
   * Fixed-step integration: every simulateStep call is ONE implicit (BDF1 at startup / after events, else BDF2) step of the
   * call's dt, with no local-error control, like a Simscape local solver with sample time dt. For order-of-accuracy
   * measurements and one-step equation checks (WP-31b: the adaptive path now error-controls every unknown, F-103).
   * Non-convergence still halves the step; it is never accepted unconverged.
   */
  setFixedStep(enabled: boolean): void {
    this.fixedStep = enabled;
  }

  /**
   * Wall-clock budget (ms) for one simulateStep call; 0 disables it. WP-31b (F-095): on by default (60 s: the heaviest lab models, a 3-phase PWM inverter with an induction machine, need 10-25 s per 50 ms call) so that an
   * interactive run of a model that crawls at the minimum step fails with a diagnostic instead of freezing the worker.
   */
  private wallClockBudgetMs = 60000;

  /**
   * Bound the work done by a single simulateStep so a non-convergent model fails
   * with a diagnosable error instead of step-halving down to minStep forever.
   */
  setStepBudget(options: { maxStepAttempts?: number; wallClockMs?: number }): void {
    if (Number.isFinite(options.maxStepAttempts) && (options.maxStepAttempts ?? 0) > 0) {
      this.maxStepAttempts = Math.floor(options.maxStepAttempts!);
    }
    if (options.wallClockMs !== undefined && Number.isFinite(options.wallClockMs) && options.wallClockMs >= 0) {
      this.wallClockBudgetMs = options.wallClockMs;
    }
  }

  constructor(solverConfiguration: SolverConfiguration | null = null) {
    this.assembler = new DAEAssembler();
    this.solver = new ImplicitSolver();
    this.solverConfiguration = solverConfiguration;
    if (solverConfiguration) this.applySolverConfiguration(solverConfiguration);
  }

  updateConfiguration(solverConfiguration: SolverConfiguration): void {
    this.solverConfiguration = solverConfiguration;
    this.applySolverConfiguration(solverConfiguration);
  }

  getSolverConfiguration(): SolverConfiguration | null {
    return this.solverConfiguration;
  }

  private applySolverConfiguration(config: SolverConfiguration): void {
    this.solver.configure({
      maxIterations: config.maximumIterations,
      tolerance: config.nonlinearTolerance
    });
  }

  /**
   * Generates a unique hash for the current nodes and edges to detect topology changes.
   */
  private getTopologyHash(nodes: Node[], edges: Edge[]): string {
    const nodeIds = nodes.map(n => `${n.id}:${(n.data as any)?.type ?? n.type}:${JSON.stringify((n.data as any)?.ports ?? [])}`).sort().join(',');
    const edgeIds = edges.map(e => `${e.source}:${e.sourceHandle ?? ''}_${e.target}:${e.targetHandle ?? ''}`).sort().join(',');
    const parameterHash = nodes.map(n => `${n.id}:${JSON.stringify((n.data as any)?.params ?? {})}`).sort().join('|');
    return `${nodeIds}|${edgeIds}|${parameterHash}`;
  }

  /**
   * Simscape Capacitor "Initial voltage" v0 (WP-10): seed the node potentials of the solution vector so that
   * v_p - v_n = v0 for every capacitor, which is the history the first step differentiates against. Capacitor
   * edges are propagated from the Electrical Reference nodes (0 V); a component without a reference starts at 0 V on one
   * node. Nothing is changed when every v0 is 0 (the zero vector already is the consistent history).
   */
  private seedCapacitorVoltages(system: AssembledSystem, nodes: Node[], x: number[]): void {
    const caps = system.components.filter(c => c.blockType === 'capacitor');
    if (caps.length === 0) return;
    const indexOfRoot = new Map<string, number>();
    system.variableNames.forEach((name, i) => {
      const m = /^Across_(.+)_\(electrical\)$/.exec(name);
      if (m) indexOfRoot.set(m[1], i);
    });
    const edges: { p: string; n: string; v0: number }[] = [];
    for (const c of caps) {
      const node = nodes.find(n => n.id === c.blockId);
      const p = c.portNodeMap.get('p'); const n = c.portNodeMap.get('n');
      if (!node || !p || !n || !indexOfRoot.has(p) || !indexOfRoot.has(n)) continue;
      edges.push({ p, n, v0: numericParam((node.data as any)?.params, 'v0', 0, node.id) });
    }
    if (edges.every(e => e.v0 === 0)) return;
    const potential = new Map<string, number>();
    for (const c of system.components) {
      if (c.blockType === 'ground' || c.blockType === 'delta_ref') c.portNodeMap.forEach(root => potential.set(root, 0));
    }
    const propagate = () => {
      let grew = true;
      while (grew) {
        grew = false;
        for (const e of edges) {
          const hasP = potential.has(e.p); const hasN = potential.has(e.n);
          if (hasP && !hasN) { potential.set(e.n, potential.get(e.p)! - e.v0); grew = true; }
          else if (hasN && !hasP) { potential.set(e.p, potential.get(e.n)! + e.v0); grew = true; }
        }
      }
    };
    propagate();
    for (const e of edges) {
      if (!potential.has(e.p) && !potential.has(e.n)) { potential.set(e.n, 0); propagate(); }
    }
    potential.forEach((v, root) => { const i = indexOfRoot.get(root); if (i !== undefined) x[i] = v; });
  }

  /**
   * Simscape Thermal Mass "Initial temperature" T0 (WP-15, default 293.15 K): seed the (absolute) node temperature of every
   * thermal mass so that the first step differentiates against T0, not against a generic 293.15 K seed.
   */
  private seedThermalMassTemperatures(system: AssembledSystem, nodes: Node[], x: number[]): void {
    for (const c of system.components) {
      if (c.blockType !== 'thermal_mass') continue;
      const node = nodes.find(n => n.id === c.blockId);
      const root = c.portNodeMap.get('a');
      if (!node || !root) continue;
      const i = system.variableNames.indexOf(`Across_${root}_(thermal)`);
      if (i < 0) continue;
      x[i] = numericParam((node.data as any)?.params, 'T0', 293.15, node.id);
    }
  }

  /**
   * Initial conditions of the fluid blocks (WP-17), seeded like the capacitor voltage / thermal mass temperature: the first step
   * differentiates against them.
   *  - gas_chamber, ma_chamber: chamber pressure P0 (default 1 atm); the piston chambers start at T_g = T with the gas mass m = P0 V0 / (R T)
   *  - fluid_capacitance: the pressure of its node starts at P0 (default 1 atm)
   *  - steam_generator: water at the ambient temperature, tank full: m_w = rho_w * tank_vol (L -> m^3)
   *  - microwave_cavity: lumped cavity temperature at the ambient temperature
   */
  private seedFluidStates(system: AssembledSystem, nodes: Node[], x: number[]): void {
    const set = (name: string, value: number) => {
      const i = system.variableNames.indexOf(name);
      if (i >= 0) x[i] = value;
    };
    for (const c of system.components) {
      const node = nodes.find(n => n.id === c.blockId);
      if (!node) continue;
      const params = (node.data as any)?.params;
      const id = node.id;
      switch (c.blockType) {
        case 'gas_chamber':
        case 'ma_chamber':
          set(`${id}_state_pressure`, numericParam(params, 'P0', STANDARD_ATMOSPHERE, id));
          break;
        case 'ma_rot_conv':
        case 'ma_trans_conv':
          {
            const T0 = numericParam(params, 'T', 293.15, id);
            const P0 = numericParam(params, 'P0', STANDARD_ATMOSPHERE, id);
            const gas = moistAirState(P0, T0, numericParam(params, 'phi', 0.5, id));
            set(`${id}_state_m`, (P0 * numericParam(params, 'V0', 1e-3, id)) / (gas.R * T0));
            set(`${id}_state_Tg`, T0);
          }
          break;
        case 'fluid_capacitance': {
          const root = c.portNodeMap.get('p');
          if (root) set(`Across_${root}_(fluid)`, numericParam(params, 'P0', STANDARD_ATMOSPHERE, id));
          break;
        }
        case 'steam_generator':
          set(`${id}_state_T_w`, numericParam(params, 'ambient_temp', 25, id) + 273.15);
          set(`${id}_state_m_w`, (RHO_WATER_LIQUID * numericParam(params, 'tank_vol', 0.5, id)) / 1000);
          break;
        case 'microwave_cavity':
          // WP-21: the cavity starts at its ambient temperature; the library unit of ambient_temp is degC (no unit guessing)
          set(`${id}_state_temp`, numericParam(params, 'ambient_temp', 25, id) + 273.15);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Physical-signal initial conditions (WP-20a): Integrator y(0) = `initial` (Simscape Integrator "Initial condition"). The first
   * step differentiates against it, so the integral starts from y(0) rather than from 0.
   */
  private seedSignalStates(system: AssembledSystem, nodes: Node[], x: number[]): void {
    for (const c of system.components) {
      if (c.blockType !== 'ps_integrator' && c.blockType !== 'ps_integrator_gen') continue;
      const node = nodes.find(n => n.id === c.blockId);
      const i = system.variableNames.indexOf(`${c.blockId}_state_y`);
      if (node && i >= 0) x[i] = numericParam((node.data as any)?.params, 'initial', 0, node.id);
    }
  }

  simulateStep(nodes: Node[], edges: Edge[], prevState: any, dt: number) {
    const topoHash = this.getTopologyHash(nodes, edges);
    
    // Assemble system only if topology has changed or system is cached as empty
    if (!this.currentSystem || topoHash !== this.prevTopologyHash || prevState?.systemSize !== this.currentSystem.systemSize) {
      // Fail fast on invalid wiring / unconnected required ports before anything is assembled or solved.
      if (this.topologyValidationEnabled) assertValidTopology(nodes, edges);
      const assembled = this.assembler.assemble(nodes, edges);
      // Structural rank (no free unknown, full bipartite matching of the Jacobian pattern) before any Newton step.
      if (this.topologyValidationEnabled) assertStructurallyWellPosed(assembled);
      this.currentSystem = assembled;
      this.prevTopologyHash = topoHash;
    }
    
    const system = this.currentSystem;
    // Every multibody joint has free or redundantly constrained coordinates (a free DOF, an unloaded frame, redundant
    // closed-loop constraints): the rank-revealing solve holds those at their previous value.
    const joints = system.components.filter(c => jointKindOf(c.blockType) !== undefined);
    const jointIds = new Set(joints.map(c => c.blockId));
    this.solver.configure({
      allowUnderdetermined: joints.length > 0,
      preferFreeColumns: system.variableNames.flatMap((name, idx) => /_R[xyz]_\((frame|multibodyframe)\)/i.test(name) ? [idx] : []),
    });
    const isAlgebraicSystem = system.isPurelyAlgebraic === true;
    
    // Initialize solution vector x
    let x: number[];
    if (prevState && Array.isArray(prevState.x) && prevState.x.length === system.systemSize) {
      x = [...prevState.x];
    } else {
      x = new Array(system.systemSize).fill(0);
      
      // Initialize reference temperatures to 293.15 K (20°C) instead of 0
      // for thermal nodes to avoid absolute zero calculations, and fluid/gas pressures to 101325 Pa (1 atm)
      system.variableNames.forEach((name, idx) => {
        if (name.includes('(thermal)') || name.includes('_state_temp') || name.includes('_state_temp_')) {
          // For component temperature states, prefer the block's own ambient_temp parameter
          // so the cavity starts at the user-specified ambient temperature (Simscape convention).
          let T_init = 293.15;
          const stateParts = name.split('_state_');
          if (stateParts.length === 2) {
            const nodeId = stateParts[0];
            const node = nodes.find(n => n.id === nodeId);
            const ambientParam = (node?.data as any)?.params?.ambient_temp;
            if (ambientParam !== undefined) {
              const raw = typeof ambientParam === 'object' && 'value' in ambientParam ? ambientParam.value : ambientParam;
              const numeric = Number(raw);
              if (!isNaN(numeric)) {
                T_init = numeric > 200 ? numeric : numeric + 273.15;
              }
            }
          }
          x[idx] = T_init;
        } else if (name.includes('(fluid)') || name.includes('(gas)') || name.includes('(isothermal_liquid)')) {
          x[idx] = 101325;
        } else if (name.includes('(frame)') || name.includes('(multibodyframe)')) {
          // A dist_constraint/angle_constraint's direction/axis is only
          // geometrically undefined when its two frames exactly coincide.
          // Every new Frame coordinate otherwise starts at exactly 0, so two
          // distinct (but not yet connected/solved) frames begin perfectly
          // tied on the very first solver iterate even in a well-posed
          // model. A tiny, unique-per-variable seed (idx guarantees distinct
          // frames get distinct seeds) breaks that artificial tie without
          // perturbing any real result: world_frame/reference frames are
          // pinned back to their target every iteration regardless of seed,
          // and this is negligible next to any real geometry (same idea as
          // the psiar/thermal/pressure seeds just above).
          // WP-31b: the seed also differs per COORDINATE (golden-ratio fractional factor). With a plain 0.01 (idx + 1) the three axes of a
          // frame moved by the same amount, so every constraint direction F - B started along (1, 1, 1): three distance constraints then
          // had parallel gradients, a rank-deficient first Newton matrix (reported by F-051; the old silent 1e-12 pivot hid it).
          x[idx] = 0.01 * (idx + 1) * (1 + 0.5 * ((idx * 0.6180339887498949) % 1));
        } else if (isJointMultiplierName(name) && jointIds.has(name.replace(/_branch_lambda\d*$/, ''))) {
          // Joint multipliers are seeded like the distance/angle constraint multiplier (no degenerate first Jacobian).
          x[idx] = 0.01 * (idx + 1);
        } else if (name.endsWith('_branch_lambda') && isAlgebraicSystem) {
          // A zero multiplier removes the direction derivatives from the
          // initial constraint Jacobian. Seed it once, then let Newton find
          // the actual reaction (including exactly zero for unloaded models).
          x[idx] = 0.01 * (idx + 1);
        } else if (name.endsWith('_branch_current') && nodes.some(n => name === `${n.id}_branch_current` && ((n.data as any)?.type ?? n.type) === 'inductor')) {
          // Simscape Inductor "Initial current" i0: the branch current starts at i0 (its history for di/dt)
          const node = nodes.find(n => name === `${n.id}_branch_current`)!;
          x[idx] = numericParam((node.data as any)?.params, 'i0', 0, node.id);
        } else if (name.includes('_state_')) {
          const parts = name.split('_state_');
          if (parts.length === 2) {
            const nodeId = parts[0];
            const stateName = parts[1];
            const node = nodes.find(n => n.id === nodeId);
            if (node && node.data && (node.data as any).params) {
              const params = (node.data as any).params;
              if (stateName === 'w1' && params.initW1 !== undefined) {
                x[idx] = numericParam(params, 'initW1', x[idx]);
              } else if (stateName === 'w2' && params.initW2 !== undefined) {
                x[idx] = numericParam(params, 'initW2', x[idx]);
              } else if (stateName === 'bias' && params.initBias !== undefined) {
                x[idx] = numericParam(params, 'initBias', x[idx]);
              } else if (stateName === 'psiar') {
                x[idx] = 0.001; // initial flux to prevent singularity
              }
            }
          }
        }
      });
      if (joints.length > 0) initializeJointFrames(system, x);
      this.seedCapacitorVoltages(system, nodes, x);
      this.seedThermalMassTemperatures(system, nodes, x);
      this.seedFluidStates(system, nodes, x);
      this.seedSignalStates(system, nodes, x);
    }

    const config = this.solverConfiguration;
    const method = config?.solver ?? 'auto';
    const isExplicit = method === 'euler' || method === 'rk4' || method === 'rk_adaptive';
    const sameMethod = !prevState?.solverMethod || prevState.solverMethod === method;
    let t = prevState?.time ?? config?.startTime ?? 0;
    const tTarget = t + dt;
    // WP-20a: committed signal history of the blocks that look back in time (delay, sliding window, moving average).
    // A new run (no prevState) starts empty; the memory travels in the returned state.
    const history = cloneHistory(prevState?.history);

    let xCurrent = [...x];
    let prevX = sameMethod && prevState?.prevX && prevState.prevX.length === system.systemSize ? [...prevState.prevX] : undefined;
    let lastDt = sameMethod ? prevState?.prevDt : undefined;
    let bdfOrder = (prevX && lastDt) ? 2 : 1;
    // Configured auto uses BDF for VLab DAEs. Legacy unconfigured runs retain SDIRK fallback.
    let useSdirk = !isAlgebraicSystem && !config && (prevState?.useSdirk || prevState?.solver === 'sdirk3' || false);
    let acceptedSteps = 0;
    let rejectedSteps = 0;
    let eventRetries = 0;
    let eventsLocated = 0;
    let rejectedAttempts = 0;
    const budgetStart = Date.now();
    const minStep = typeof config?.minimumStep === 'number' ? config.minimumStep : 1e-6;
    const maxStep = typeof config?.maximumStep === 'number' ? config.maximumStep : Math.max(minStep, 0.05);
    // WP-31b (F-095): total work guard per call. Every accepted step is at least minStep long (located events add a bounded
    // number of short landing steps), so more than dt/minStep accepted steps plus the rejected-attempt budget means the run
    // is not advancing. Event-location trial solves count as attempts too.
    let totalAttempts = 0;
    const singularSolvesAtStart = SparseLinearSolver.singularSolveCount;
    const maxTotalAttempts = this.maxStepAttempts + 2 * Math.ceil(dt / minStep) + 100;
    let lastFailure: SolverConvergenceError | undefined;
    // WP-31b (F-084/F-101): indicators of the event the previous step landed in front of; the step that follows integrates
    // the new mode and must not re-locate that same root (it lies within the location tolerance of its start).
    let lockedEvents: Set<number> | undefined;
    
    // Choose initial step size. Start with last accepted size but never start below 1ms
    // to avoid excessive step count.
    const initialStep = typeof config?.initialStep === 'number' ? config.initialStep : Math.min(dt, maxStep);
    let h = Math.min(maxStep, Math.max(minStep, lastDt || initialStep));
    
    // Keep the legacy epsilon for unconfigured models; configured jobs need
    // exact boundary handling for sub-microsecond solver settings.
    const targetEpsilon = config ? 0 : 1e-12;
    // WP-31b (F-103): the first step of a run is a consistent-initialization step. The seeded vector is in general not
    // consistent with the algebraic constraints (a velocity source imposes w0 on a shaft that starts at rest, a source
    // voltage appears on nodes that start at 0 V), so the first step carries an impulse (J dw/dt = J w0 / h) whose
    // step-doubling error estimate does not shrink with h. A backward-Euler step of the minimum step size yields
    // consistent values as h -> 0 (Brown, Hindmarsh & Petzold, "Consistent initial condition calculation for
    // differential-algebraic systems", SIAM J. Sci. Comput. 19, 1998); it is not error-controlled, and the next step
    // restarts BDF1 from the consistent state with the step-doubling estimate.
    // Only a DAE needs it: when every differentiated unknown is an integrator state the seeded states are the initial values.
    let initializing = !prevState && !isAlgebraicSystem && !isExplicit && !useSdirk && !this.fixedStep && (() => {
      const probe: EquationContext = {
        dt: Math.min(minStep, dt), time: t + Math.min(minStep, dt), history, parameters: {}, prevStates: [...x], states: [...x],
        stateDerivatives: new Array(system.systemSize).fill(0), order: 1,
      };
      const mask = this.differentiatedMask(system, x, probe);
      return mask.some((d, i) => d && !system.isDifferentialState[i] && system.firstOrderOnly?.[i] !== true);
    })();
    const hAfterInit = h;
    while (t < tTarget - targetEpsilon) {
      // Don't step past target time
      const remaining = tTarget - t;
      const stepFloor = Math.min(minStep, remaining);
      if (this.fixedStep) h = remaining;
      if (initializing) h = stepFloor;
      h = Math.min(h, remaining);
      // WP-30: never leave a round-off sliver behind. t accumulates h in floating point, so a step that "exactly" reaches the
      // target can stop 1e-11 s short; the next step of that size cannot be resolved by Newton (the state change is below the
      // ulp of the state: C dT/dt with dT < ulp(T)), failed to converge and was accepted as a best-effort state (a 0.5 K jump
      // in a thermal model). Stretch the step onto the target when the remainder is within 1 ppm of h (the end-of-interval
      // step adjustment of every production integrator, e.g. Shampine & Reichelt, "The MATLAB ODE Suite", 1997, ode45/ode15s).
      if (remaining - h <= 1e-6 * h) h = remaining;
      if (t + h === t) throw new Error('Solver step is too small to advance simulation time.');
      
      let stepAccepted = false;
      let attemptsThisStep = 0;
      let eventStepStart: number | undefined;
      let nextX: number[] = [];
      // the attempt that ends just before a located event root (may be shorter than minStep)
      let landing: { indices: Set<number> } | undefined;

      while (!stepAccepted) {
        if (attemptsThisStep++ > 0) rejectedAttempts++;
        totalAttempts++;
        const overWallClock = this.wallClockBudgetMs > 0 && Date.now() - budgetStart > this.wallClockBudgetMs;
        if (rejectedAttempts > this.maxStepAttempts || totalAttempts > maxTotalAttempts || overWallClock) {
          const reason = rejectedAttempts > this.maxStepAttempts
            ? `exceeded ${this.maxStepAttempts} rejected step attempts`
            : totalAttempts > maxTotalAttempts
              ? `exceeded ${maxTotalAttempts} total step attempts`
              : `exceeded ${this.wallClockBudgetMs} ms wall-clock budget`;
          throw this.solverDiagnosticError(
            `VLab solver ${reason} advancing to t=${tTarget} ` +
            `(reached t=${t}, h=${h}, accepted=${acceptedSteps}, rejected=${rejectedSteps}). ` +
            `The model is likely non-convergent; check parameters and connections.`,
            system, nodes, t, h, xCurrent, history, lastFailure,
          );
        }
        // Enforce minimum step size to prevent infinite loops (a landing step in front of a located event may be shorter)
        if (!landing) h = Math.max(stepFloor, h);
        
        try {
          const ctx: EquationContext = {
            dt: h,
            time: t + h,
            history,
            parameters: {},
            prevStates: [...xCurrent],
            states: [...xCurrent],
            stateDerivatives: new Array(system.systemSize).fill(0)
          };
          
          let explicitLte = 0;
          if (isAlgebraicSystem) {
            // Solve once per algebraic step, with no artificial coordinate velocity.
            nextX = this.solver.solve(
              (solveX, solveCtx) => system.residuals(solveX, new Array(system.systemSize).fill(0), solveCtx),
              xCurrent, ctx,
            );
          } else if (isExplicit && config) {
            const result = explicitSolverStep(system, xCurrent, ctx, config, this.solver);
            if (!result.accepted) {
              if (h <= stepFloor) throw new ToleranceAtMinimumStepError('Explicit solver cannot satisfy tolerances at minimumStep.');
              rejectedSteps++;
              h = Math.max(stepFloor, h * 0.5);
              continue;
            }
            nextX = result.x;
            explicitLte = result.lte;
          } else if (useSdirk) {
            // SDIRK-3 Solve Stage 1
            const ctx1 = {
              dt: h * GAMMA,
              time: t + h * GAMMA,
              history,
              parameters: {},
              prevStates: [...xCurrent],
              states: [...xCurrent],
              stateDerivatives: new Array(system.systemSize).fill(0),
              order: 1
            };
            const solveResiduals1 = (solveX: number[], solveCtx: EquationContext) => {
              const dx = ddtVector(solveX, solveCtx, system.firstOrderOnly);
              return system.residuals(solveX, dx, solveCtx);
            };
            const X1 = this.solver.solve(solveResiduals1, xCurrent, ctx1);
            const g1 = X1.map((val, idx) => (val - xCurrent[idx]) / (h * GAMMA));

            // SDIRK-3 Solve Stage 2
            const z2 = xCurrent.map((val, idx) => system.isDifferentialState[idx] ? val + h * A21 * g1[idx] : val);
            const ctx2 = {
              dt: h * GAMMA,
              time: t + h * (GAMMA + A21),
              history,
              parameters: {},
              prevStates: [...z2],
              states: [...z2],
              stateDerivatives: new Array(system.systemSize).fill(0),
              order: 1
            };
            const solveResiduals2 = (solveX: number[], solveCtx: EquationContext) => {
              const dx = ddtVector(solveX, solveCtx, system.firstOrderOnly);
              return system.residuals(solveX, dx, solveCtx);
            };
            const X2 = this.solver.solve(solveResiduals2, X1, ctx2);
            const g2 = X2.map((val, idx) => (val - z2[idx]) / (h * GAMMA));

            // SDIRK-3 Solve Stage 3
            const z3 = xCurrent.map((val, idx) => system.isDifferentialState[idx] ? val + h * A31 * g1[idx] + h * A32 * g2[idx] : val);
            const ctx3 = {
              dt: h * GAMMA,
              time: t + h,
              history,
              parameters: {},
              prevStates: [...z3],
              states: [...z3],
              stateDerivatives: new Array(system.systemSize).fill(0),
              order: 1
            };
            const solveResiduals3 = (solveX: number[], solveCtx: EquationContext) => {
              const dx = ddtVector(solveX, solveCtx, system.firstOrderOnly);
              return system.residuals(solveX, dx, solveCtx);
            };
            nextX = this.solver.solve(solveResiduals3, X2, ctx3);
          } else {
            // WP-31b: variable-step BDF2 is zero-stable only for step ratios w = h / h_prev < 1 + sqrt(2) (Grigorieff 1983;
            // Hairer & Wanner II, III.5). A larger ratio (the step after a sub-microsecond event landing or an end-of-interval
            // sliver: w ~ 1e9) has stencil weights ~1e15 that cancel catastrophically; that step restarts with BDF1.
            // WP-31b: a step that starts ON an event surface (an indicator within EVENT_BAND of zero: the previous step ended at the
            // root, e.g. a switching instant on an output-step boundary) integrates the new mode, whose derivative is discontinuous
            // against the stored history: BDF2 would extrapolate the old slope (error 1/3 (x - x_prev) at the edge), so it restarts BDF1.
            const onSurface = bdfOrder === 2 && !isAlgebraicSystem && !landing
              && this.eventIndicators(nodes, system, xCurrent, t).some(g => Math.abs(g) <= EVENT_BAND);
            if (bdfOrder === 2 && !onSurface && prevX && lastDt && h / lastDt < 1 + Math.SQRT2) {
              ctx.prevPrevStates = [...prevX];
              ctx.prevDt = lastDt;
              ctx.order = 2;
            } else {
              ctx.order = 1;
            }
            
            // One stencil for every unknown (see vlabDiscretization): BDF2 when history exists, else BDF1.
            const solveResiduals = (solveX: number[], solveCtx: EquationContext) =>
              system.residuals(solveX, ddtVector(solveX, solveCtx, system.firstOrderOnly), solveCtx);
            
            nextX = this.solver.solve(solveResiduals, xCurrent, ctx);
          }
          
          // --- Zero Crossing & Event Detection ---
          // The first algebraic solve establishes source and physical-signal values.
          // Treating that initialization (for example Vg: 0 -> 4 V) as a temporal
          // crossing repeatedly shrinks the step before the simulation can start.
          if (!isAlgebraicSystem && (prevState || acceptedSteps > 0)) {
            // WP-31b (F-084 / F-101): Simscape-style event location. A sign change of an event indicator inside the step
            // is bracketed and its time found by the Illinois (modified regula falsi) iteration on the indicator, each trial
            // being a solve of the same step from t to t + h_trial, until the bracket is narrower than eventTol. The step is
            // then re-taken to the LOWER bracket end, i.e. it ends just before the root (the backward-difference step still
            // integrates the old mode), and the next step integrates the new mode from there (Dahlquist & Bjorck,
            // "Numerical Methods" 6.2.3, Illinois method; Shampine & Thompson, "Event location for ODEs", 2000).
            const g0 = this.eventIndicators(nodes, system, xCurrent, t);
            const g1 = this.eventIndicators(nodes, system, nextX, t + h);
            // in a landing attempt only an indicator OTHER than the bracketed ones can still cross (earlier, state-dependent)
            const crossing = firstCrossing(g0, g1, landing ? new Set([...(lockedEvents ?? []), ...landing.indices]) : lockedEvents);
            if (crossing) {
              landing = undefined;
              if (eventStepStart === undefined) eventStepStart = h;
              // tied to the step (1e-6 h), never finer than the declared time resolution of the discontinuous sources
              // (SIGNAL_TIME_QUANTUM: a step source and the switch it drives cross Q/2 apart and are one event) nor than t's ulp
              const eventTol = Math.max(1e-12 * Math.max(1, Math.abs(t)), 1e-6 * eventStepStart, SIGNAL_TIME_QUANTUM);
              const trialSolve = (hh: number, guess: number[]): number[] => {
                const c: EquationContext = {
                  dt: hh, time: t + hh, history, parameters: {}, prevStates: [...xCurrent], states: [...xCurrent],
                  stateDerivatives: new Array(system.systemSize).fill(0), order: ctx.order === 2 ? 2 : 1,
                  prevPrevStates: ctx.order === 2 ? ctx.prevPrevStates : undefined, prevDt: ctx.order === 2 ? ctx.prevDt : undefined,
                };
                return this.solver.solve((sx, sc) => system.residuals(sx, ddtVector(sx, sc, system.firstOrderOnly), sc), guess, c);
              };
              let a = 0, b = h, k = crossing.index;
              let gaVec = g0, gbVec = g1;
              let xa = xCurrent;
              let fa = g0[k], fb = g1[k], side = 0;
              for (let iter = 0; b - a > eventTol && iter < 60; iter++) {
                totalAttempts++;
                const w = b - a;
                let hm = a - (fa * w) / (fb - fa);
                if (!(hm > a + 1e-3 * w && hm < b - 1e-3 * w)) hm = Math.min(b - 1e-3 * w, Math.max(a + 1e-3 * w, Number.isFinite(hm) ? hm : a + w / 2));
                // A time-only indicator (sample grid, step time, carrier with a time-only reference: same value for any state)
                // needs no solve: the trial state is interpolated (exact for that indicator; the landing solve re-checks the
                // state-dependent ones). Otherwise start Newton from the lower bracket state (same mode as the step start).
                const timeOnly = this.eventIndicators(nodes, system, xCurrent, t + hm)[k] === this.eventIndicators(nodes, system, nextX, t + hm)[k];
                const xm = timeOnly ? xCurrent.map((v, i) => v + (nextX[i] - v) * (hm / h)) : trialSolve(hm, xa);
                const gm = this.eventIndicators(nodes, system, xm, t + hm);
                // crossed = sign changed against the STEP START (an exact zero at a trial counts as not yet crossed, so the
                // lower end never passes the root when a trial lands on it)
                const inner = firstCrossing(g0, gm, lockedEvents, true); // strict sign change: the touch tolerance is for the step end only
                if (inner) {
                  if (inner.index !== k) { k = inner.index; fa = gaVec[k]; side = 0; }
                  b = hm; gbVec = gm; fb = gm[k];
                  if (side === -1) fa /= 2; // Illinois: the a end was retained twice
                  side = -1;
                } else {
                  a = hm; gaVec = gm; fa = gm[k]; xa = xm;
                  if (side === 1) fb /= 2;
                  side = 1;
                }
              }
              const located = new Set<number>([k]);
              g0.forEach((gs, i) => { if (gs * gbVec[i] < 0) located.add(i); });
              // right after a landing, a second indicator (a switch driven by the step source that was just located) flips at the same instant
              // up to the landing slack (eventTol) plus the quantum offset of the sources (SIGNAL_TIME_QUANTUM / 2): one event, not two
              const sameInstant = lockedEvents && lockedEvents.size > 0 ? eventTol + 2 * SIGNAL_TIME_QUANTUM : eventTol;
              if (a > sameInstant) {
                // re-take the step to just before the root (with its own error control); counted as located when accepted
                eventRetries++;
                landing = { indices: located };
                h = a;
                continue;
              }
              // the root lies within eventTol of the step start (a <= eventTol): the step already integrates the new mode
              lockedEvents = new Set([...(lockedEvents ?? []), ...located]);
            }
          }
          
          // --- Local Truncation Error (LTE) Control ---
          let lte = explicitLte;
          let lteControlled = false;
          // Preserve the legacy unconfigured LTE path; configured runs use
          // their explicit minimum-step boundary for adaptive control.
          if (!isAlgebraicSystem && !isExplicit && !useSdirk && !this.fixedStep && !initializing && (config || h > 1e-6)) {
            const bdf1Residuals = (solveX: number[], solveCtx: EquationContext) => {
              const dx = ddtVector(solveX, solveCtx, system.firstOrderOnly);
              return system.residuals(solveX, dx, solveCtx);
            };
            const bdf1Ctx: EquationContext = { ...ctx, order: 1, prevPrevStates: undefined, prevDt: undefined };
            // BDF2 step: the BDF1 solution of the same step is the comparison. BDF1 needs a startup estimate too: compare one
            // full step to two half steps (step doubling, Hairer, Norsett & Wanner I, II.4). WP-31b (F-103): also without a
            // Solver Configuration, the first step used to have no estimate.
            let comparison = ctx.order === 1 ? nextX : this.solver.solve(bdf1Residuals, xCurrent, bdf1Ctx);
            if (ctx.order === 1) {
              const halfResiduals = (solveX: number[], solveCtx: EquationContext) =>
                system.residuals(solveX, ddtVector(solveX, solveCtx, system.firstOrderOnly), solveCtx);
              const halfContext = { ...bdf1Ctx, dt: h / 2, time: t + h / 2 };
              const half = this.solver.solve(halfResiduals, xCurrent, halfContext);
              comparison = this.solver.solve(halfResiduals, half, { ...halfContext, time: t + h, prevStates: half });
            }

            // WP-31b (F-103): the weighted RMS norm covers every DIFFERENTIATED unknown: each one whose derivative from the
            // shared ddt stencil (vlabDiscretization) enters a residual (C d(vp - vn)/dt, L di/dt, J dw/dt, C dT/dt act on
            // across / branch unknowns, not only on `_state_` variables), plus the integrator states and the BDF1-pinned frame
            // poses: err_i / (rtol max(|x_i|, |x_i,prev|) + atol). Purely algebraic unknowns (a capacitor current
            // i_C = i_L - v/R oscillating through 0) carry no truncation error of their own and are excluded, as with
            // the suppressAlg option of SUNDIALS IDA (Hindmarsh et al., ACM TOMS 31, 2005; Brenan, Campbell & Petzold 5.3).
            const differentiated = this.differentiatedMask(system, xCurrent, ctx);
            // Both estimators measure the error of the BDF1 step of size h, C h^2: BDF2 - BDF1 directly, and step doubling by Richardson,
            // e_full = (y_full - y_two_halves) / (1 - 1/2) = 2 (y_full - y_two_halves) (Hairer, Norsett & Wanner I, II.4). Without the factor 2
            // the two differ by 2x and the controller alternates (BDF2 attempt rejected, BDF1 attempt accepted, repeated every step).
            const lteScale = ctx.order === 1 ? 2 : 1;
            let sumSq = 0;
            let diffCount = 0;
            for (let idx = 0; idx < system.systemSize; idx++) {
              if (!differentiated[idx]) continue;
              diffCount++;
              const diff = lteScale * (nextX[idx] - comparison[idx]);
              const scale = (config?.relativeTolerance ?? 1e-3) * Math.max(Math.abs(nextX[idx]), Math.abs(xCurrent[idx]))
                + (config?.absoluteTolerance ?? 1e-5);
              sumSq += (diff / scale) * (diff / scale);
            }

            lte = diffCount > 0 ? Math.sqrt(sumSq / diffCount) : 0;
            if (lte > 1.0) {
              if (h <= stepFloor && !landing) {
                const worst = nextX.map((v, idx) => ({
                  idx, w: !differentiated[idx] ? 0 : lteScale * Math.abs(v - comparison[idx]) / ((config?.relativeTolerance ?? 1e-3) * Math.max(Math.abs(v), Math.abs(xCurrent[idx])) + (config?.absoluteTolerance ?? 1e-5)),
                })).sort((p, q) => q.w - p.w).slice(0, 3).map(e => `${system.variableNames[e.idx]} (${e.w.toPrecision(3)})`).join(', ');
                throw new ToleranceAtMinimumStepError(`BDF solver cannot satisfy tolerances at minimumStep (weighted error ${lte.toPrecision(3)}; largest: ${worst}).`);
              }
              rejectedSteps++;
              // WP-31b: standard step-size controller (Hairer, Norsett & Wanner I, II.4, eq. 4.13): the step that is kept (BDF2,
              // local error O(h^3)) is controlled with the exponent 1 / (p + 1) = 1/3: h_new = h * 0.9 * err^(-1/3), bounded (the estimate scales
              // faster than h^2 in practice, and the exponent 1/2 made every second BDF2 step overshoot and be rejected)
              h = Math.max(landing ? 0 : stepFloor, h * Math.max(0.2, STEP_SAFETY / Math.cbrt(lte)));
              landing = undefined;
              if (!config) bdfOrder = 1;
              continue;
            }
            lteControlled = true;
          }

          // Next step size: the error-based controller when the error was estimated (factor in [0.5, 2]), else the legacy
          // growth (x1.5 when the error is low)
          const nextH = lteControlled
            ? Math.min(maxStep, h * Math.min(2, Math.max(0.5, STEP_SAFETY / Math.cbrt(Math.max(lte, 1e-12)))))
            : (lte < 0.1 || useSdirk) ? Math.min(h * 1.5, maxStep) : h;

          stepAccepted = true;
          acceptedSteps++;
          prevX = [...xCurrent];
          lastDt = h;
          xCurrent = [...nextX];
          t += h;
          // the consistent-initialization step is not a sample of the committed signal history (discrete blocks keep their
          // first-step semantics on the first regular step)
          if (!initializing) recordHistory(system, history, prevX ?? xCurrent, xCurrent, t - h, t);
          if (initializing) {
            // consistent initialization done: restart BDF1 (no history across the initialization jump) at the chosen step
            initializing = false;
            lockedEvents = undefined;
            h = hAfterInit;
            bdfOrder = 1;
          } else if (landing) {
            // the step ended just before the located root: the next step integrates the new mode from a fresh BDF1 start, at
            // the step size in force before the event, without re-locating the same root
            eventsLocated++;
            lockedEvents = landing.indices;
            h = Math.min(maxStep, eventStepStart ?? nextH);
            bdfOrder = 1;
          } else {
            lockedEvents = undefined;
            h = nextH;
            bdfOrder = 2;
          }

        } catch (error: any) {
          if (error instanceof BlockEquationError || error instanceof DAEStructureError) {
            // A block equation that throws (or a structurally invalid model) is not a step-size problem: never retried.
            throw error;
          } else if (error instanceof NonFiniteResidualError) {
            // Non-finite residual: reject the step and halve h; if it persists at the minimum step, surface the
            // diagnostic (block / row / value) instead of iterating or accepting a state computed from zeros (F-045).
            if (isAlgebraicSystem || (h <= stepFloor && !landing)) throw error;
            rejectedSteps++;
            h = Math.max(landing ? 0 : stepFloor, h * 0.5);
            landing = undefined;
            bdfOrder = 1;
          } else {
            if (isAlgebraicSystem) throw error;
            if (isExplicit && /requires explicit state equations/.test(error.message)) throw error;
            if (error instanceof ToleranceAtMinimumStepError) {
              throw this.solverDiagnosticError(`VLab solver: ${error.message}`, system, nodes, t, h, xCurrent, history, lastFailure);
            }
            if (error instanceof SolverConvergenceError) lastFailure = error;
            const promoted = !config && !useSdirk;
            if (promoted) {
              useSdirk = true;
              console.warn("DAE BDF solver convergence issue. Promoting to SDIRK-3.");
            }
            if (h <= stepFloor && !landing) {
              // WP-31b (F-050): no state is accepted unconverged. The legacy promotion to SDIRK-3 gets one retry at the floor;
              // after that the failure is reported with the worst residual rows and their blocks.
              if (promoted) continue;
              throw this.solverDiagnosticError(
                `VLab solver did not converge at the minimum step (t=${t}, h=${h}): ${error.message}`,
                system, nodes, t, h, xCurrent, history, lastFailure,
              );
            }
            rejectedSteps++;
            h = Math.max(landing ? 0 : stepFloor, h * 0.5);
            landing = undefined;
            bdfOrder = 1;
          }
        }
      }
    }

    const getFriendlyVariableName = (idx: number): string => {
      if (idx === undefined || idx < 0 || idx >= system.variableNames.length) return 'value';
      const rawName = system.variableNames[idx];
      
      const idToLabel = new Map<string, string>();
      nodes.forEach(n => {
        const label = (n.data as any)?.label || n.id;
        idToLabel.set(n.id, label);
      });

      const acrossMatch = rawName.match(/^Across_(.+?)_\((.+?)\)$/i);
      if (acrossMatch) {
        const nodeId = acrossMatch[1];
        const domain = acrossMatch[2];
        const label = idToLabel.get(nodeId) || nodeId;
        return `${label} (${domain} potential)`;
      }

      const branchMatch = rawName.match(/^(.+?)_branch_(.+?)$/i);
      if (branchMatch) {
        const nodeId = branchMatch[1];
        const branchName = branchMatch[2];
        const label = idToLabel.get(nodeId) || nodeId;
        let cleanName = branchName;
        if (branchName === 'i' || branchName === 'current') cleanName = 'Current';
        else if (branchName === 'v' || branchName === 'voltage') cleanName = 'Voltage';
        else if (branchName === 't' || branchName === 'torque') cleanName = 'Torque';
        else if (branchName === 'w' || branchName === 'omega') cleanName = 'Speed';
        else if (branchName.startsWith('signal_')) cleanName = branchName.slice(7);
        return `${label}.${cleanName}`;
      }

      const stateMatch = rawName.match(/^(.+?)_state_(.+?)$/i);
      if (stateMatch) {
        const nodeId = stateMatch[1];
        const stateName = stateMatch[2];
        const label = idToLabel.get(nodeId) || nodeId;
        let cleanName = stateName;
        if (stateName === 'omega') cleanName = 'Speed';
        else if (stateName === 'theta') cleanName = 'Angle';
        return `${label}.${cleanName}`;
      }

      return rawName;
    };

    // Helpers to create custom scope values
    const isTest = typeof process !== 'undefined' && process.env.VITEST;

    const createSingleScopeValue = (val: number, label: string): any => {
      if (isTest) return val;
      // Keep scope payloads as plain structured-cloneable data. Number
      // objects/accessors lose their shape when crossing the Web Worker
      // boundary and are then rendered as zero/empty scope samples.
      return { value: val, in1: val, [label]: val };
    };

    const createMultiScopeValues = (values: Record<string, number>, aliases: Record<string, string>): any => {
      const obj: any = {};
      Object.entries(values).forEach(([k, v]) => {
        obj[k] = v;
      });
      Object.entries(aliases).forEach(([aliasName, keyName]) => {
        if (obj[aliasName] === undefined && values[keyName] !== undefined) {
          obj[aliasName] = values[keyName];
        }
      });
      return obj;
    };

    // Extract scope outputs (evaluated at final xCurrent)
    const perScopeValues: Record<string, any> = {};

    // 1. Check if we are running one of the 6 predefined learning labs to return matching data structures
    const hasAirChamber = nodes.some(n => n.id === 'air_chamber');
    const hasBlenderMotor = nodes.some(n => n.id === 'blender_motor');
    const hasSpeedPID = nodes.some(n => n.id === 'speed_pid');
    const hasBasketLoad = nodes.some(n => n.id === 'basket_load');
    const hasVfdController = nodes.some(n => n.id === 'vfd_controller');
    const hasMwCavity = nodes.some(n => n.id === 'mw_cavity');

    if (hasAirChamber) {
      // ── Air Fryer Lab ──
      // The learning lab uses `thermal_scope`, but imported/copied models may
      // have a different scope id. Resolve the connected scope before falling
      // back to the default ambient temperature; otherwise an unresolved
      // lookup is rendered as exactly 0 °C.
      const thermalScopeIds = ['thermal_scope', ...nodes
        .filter(n => (n.data as any)?.type === 'scope' || (n.data as any)?.blockId === 'scope')
        .map(n => n.id)];
      const indices = thermalScopeIds
        .map(scopeId => system.scopeOutputs.get(scopeId) || [])
        .find(scopeIndices => scopeIndices.length > 0) || [];
      const tempK = indices.length > 0 ? xCurrent[indices[0]] : 293.15;
      // WP-15 (F-011): thermal temperatures are absolute (the Thermal Reference is 0 K), so a temp_sensor wired against the
      // reference (or with B open) outputs absolute kelvin exactly like a direct chamber connection: always K -> degC.
      const cel = tempK - 273.15;
      perScopeValues['thermal_scope'] = createSingleScopeValue(cel, "Air Fryer Temperature (°C)");
    } 
    else if (hasBlenderMotor) {
      // ── Blender Lab ──
      const indices = system.scopeOutputs.get('blender_scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const rpm = omega * (60 / (2 * Math.PI));
      perScopeValues['blender_scope'] = createSingleScopeValue(rpm, "Blender Speed (RPM)");
    } 
    else if (hasSpeedPID) {
      // ── PID Speed Control Lab ──
      const indices = system.scopeOutputs.get('scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const refIdx = system.variableNames.findIndex(name => name.includes('ref_speed'));
      const ref = refIdx !== -1 ? xCurrent[refIdx] : 157;
      const speed = omega * (60 / (2 * Math.PI));
      const target = ref * (60 / (2 * Math.PI));
      perScopeValues['scope'] = createMultiScopeValues(
        {
          "Motor Speed (RPM)": speed,
          "Target Speed (RPM)": target
        },
        {
          value: "Motor Speed (RPM)",
          target: "Target Speed (RPM)"
        }
      );
    } 
    else if (hasBasketLoad) {
      // ── Washing Machine Lab ──
      const indices = system.scopeOutputs.get('wash_scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const iIdx = system.variableNames.findIndex(name => name.includes('wash_motor_branch_ia') || name.includes('inverter_branch_current_a'));
      const amps = iIdx !== -1 ? Math.abs(xCurrent[iIdx]) : 0;
      const speed = omega * (60 / (2 * Math.PI));
      perScopeValues['wash_scope'] = createMultiScopeValues(
        {
          "Drum Speed (RPM)": speed,
          "Motor Current (A)": amps
        },
        {
          value: "Drum Speed (RPM)",
          amps: "Motor Current (A)"
        }
      );
    } 
    else if (hasVfdController) {
      // ── VFD Inverter Lab ──
      const indices = system.scopeOutputs.get('vfd_scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const refIdx = system.variableNames.findIndex(name => name.includes('ref_speed'));
      const ref = refIdx !== -1 ? xCurrent[refIdx] : 0;
      const speed = omega * (60 / (2 * Math.PI));
      perScopeValues['vfd_scope'] = createMultiScopeValues(
        {
          "Motor Speed (RPM)": speed,
          "Target Speed (RPM)": ref
        },
        {
          value: "Motor Speed (RPM)",
          target: "Target Speed (RPM)"
        }
      );
    } 
    else if (hasMwCavity) {
      // ── Microwave Lab ──
      const indices = system.scopeOutputs.get('mw_scope') || [];
      const tempK = indices.length > 0 ? xCurrent[indices[0]] : 298.15;
      const cel = tempK - 273.15;
      perScopeValues['mw_scope'] = createSingleScopeValue(cel, "Cavity Temp (°C)");
    } 

    // Learning-lab aliases are historical. Preserve the value for the actual
    // connected scope id as well, so renamed/copied scopes do not show zero.
    for (const scopeNode of nodes.filter(n => (n.data as any)?.type === 'scope' || (n.data as any)?.blockId === 'scope')) {
      if (perScopeValues[scopeNode.id] !== undefined) continue;
      const indices = system.scopeOutputs.get(scopeNode.id);
      if (indices && indices.length > 0) {
        const knownValue = Object.values(perScopeValues)[0];
        if (knownValue !== undefined) perScopeValues[scopeNode.id] = knownValue;
      }
    }

    // 2. Generic Scope Output Mapping for all scope blocks
    const allScopeNodes = nodes.filter(n => (n.data as any)?.type === 'scope' || (n.data as any)?.blockId === 'scope' || n.type === 'scope');
    for (const scopeNode of allScopeNodes) {
      // If already populated by predefined lab rule, skip
      if (perScopeValues[scopeNode.id] !== undefined) continue;

      const indices = system.scopeOutputs.get(scopeNode.id);
      const bindings = system.scopeChannels?.get(scopeNode.id);
      if (bindings && bindings.some(b => b.width > 1)) {
        // WP-09c: a width-N signal on a scope channel shows N traces, `in<k>[<channel name>]` (a, b, c / d, q, 0 ...), each
        // read from its own solver variable; nothing is reduced to component 0. Scalar channels keep their `in<k>` key.
        const values: Record<string, number> = {};
        for (const b of bindings) {
          if (b.width === 1) {
            if (b.indices[0] < 0) continue; // unwired channel: no sample
            values[`in${b.channel}`] = readSolvedVariable(xCurrent, system.variableNames, b.indices[0], { scopeId: scopeNode.id, channel: b.channel });
            continue;
          }
          b.indices.forEach((idx, k) => {
            values[scopeTraceKey(`in${b.channel}`, b.channelNames[k] ?? String(k + 1))] =
              readSolvedVariable(xCurrent, system.variableNames, idx, { scopeId: scopeNode.id, channel: b.channel });
          });
        }
        if (Object.keys(values).length > 0) perScopeValues[scopeNode.id] = createMultiScopeValues(values, {});
      } else if (indices && indices.length > 0) {
        // Every channel is read by the exact variable the assembler bound it to (scopeOutputs), as a scalar sample.
        // An unwired channel (-1) has no sample at all: it is left out, never filled with 0. A vector / Frame /
        // non-finite value throws ScopeReadError (vlabScopeRead.ts).
        const sample = (idx: number, channel: number): number | undefined =>
          idx < 0 ? undefined : readSolvedVariable(xCurrent, system.variableNames, idx, { scopeId: scopeNode.id, channel });
        if (indices.length === 1) {
          const val = sample(indices[0], 1);
          if (val !== undefined) perScopeValues[scopeNode.id] = createSingleScopeValue(val, getFriendlyVariableName(indices[0]));
        } else {
          const values: Record<string, number> = {};
          const aliases: Record<string, string> = {};
          indices.forEach((idx, i) => {
            const val = sample(idx, i + 1);
            if (val === undefined) return;
            const channelKey = `in${i + 1}`;
            const friendlyName = getFriendlyVariableName(idx);
            values[channelKey] = val;
            values[i] = val;
            if (friendlyName && values[friendlyName] === undefined) {
              values[friendlyName] = val;
            }
            if (i === 0) aliases['value'] = channelKey;
            if (i === 1) aliases['target'] = channelKey;
          });
          if (Object.keys(values).length > 0) perScopeValues[scopeNode.id] = createMultiScopeValues(values, aliases);
        }
      }
    }

    // Backward-compat: scopeValues = first scope value or 0
    const firstScopeId = Object.keys(perScopeValues)[0];
    const scopeValues = firstScopeId ? perScopeValues[firstScopeId] : 0;

    return {
      x: xCurrent,
      // After an event/reset step the BDF2 history is not valid: the next call restarts with BDF1.
      prevX: bdfOrder === 2 ? prevX : undefined,
      prevDt: lastDt,
      history,
      time: tTarget,
      systemSize: system.systemSize,
      variableNames: system.variableNames,
      scopeValues,
      perScopeValues,
      scopeOutputs: perScopeValues,
      useSdirk,
      solverMethod: method,
      acceptedSteps,
      rejectedSteps,
      /** zero-crossing step cuts (retried solves) and located events during this call (WP-11 step-budget evidence) */
      eventRetries,
      eventsLocated,
      /** WP-31b (F-051): Newton matrices that were singular but consistent during this call (free unknowns held, not regularized) */
      singularMatrixSolves: SparseLinearSolver.singularSolveCount - singularSolvesAtStart,
    };
  }

  /**
   * Solver diagnostic (WP-31b, F-050 / F-095): the worst residual rows of the best Newton iterate of the last failed solve
   * (or, when no solve failed, of the backward-Euler residual at the current state over h), with the owning blocks.
   */
  private solverDiagnosticError(
    message: string, system: AssembledSystem, nodes: Node[], time: number, h: number, x: number[], history: any,
    failure?: SolverConvergenceError,
  ): VLabSolverDiagnosticError {
    let residual = failure?.residual ?? [];
    if (residual.length !== system.systemSize) {
      try {
        const c: EquationContext = {
          dt: h, time: time + h, history, parameters: {}, prevStates: [...x], states: [...x],
          stateDerivatives: new Array(system.systemSize).fill(0), order: 1,
        };
        residual = system.residuals(x, ddtVector(x, c, system.firstOrderOnly), c);
      } catch {
        residual = [];
      }
    }
    const worstResidualRows: WorstResidualRow[] = residual
      .map((value, row) => ({ value, row }))
      .filter(r => r.value !== 0)
      .sort((p, q) => Math.abs(q.value) - Math.abs(p.value))
      .slice(0, 5)
      .map(({ value, row }) => {
        const owner = system.structure?.rowOwners[row];
        return { blockId: owner?.blockId ?? '', blockType: owner?.blockType ?? '', row, variable: system.variableNames[row] ?? '', value };
      });
    const singularUnknowns = failure?.singular?.map(s => ({
      variable: system.variableNames[s.column] ?? `#${s.column}`, blockId: system.structure?.variableOwners[s.column]?.blockId ?? '',
    }));
    const blocks = nodes.map(n => `${n.id}: ${(n.data as any)?.type ?? n.type ?? ''}`);
    const blockList = ` Blocks: [${nodes.map(n => ((n.data as any)?.type ?? n.type ?? n.id)).join(', ')}].`;
    const singularText = singularUnknowns?.length ? ` Singular Newton matrix in ${singularUnknowns.map(s => s.variable).join(', ')}.` : '';
    return new VLabSolverDiagnosticError(`${message} [t=${time}, h=${h}]${blockList}${singularText}`, {
      time, h, reason: message, worstResidualRows, singularUnknowns, blocks,
    });
  }

  private differentiatedCache = new WeakMap<AssembledSystem, boolean[]>();

  /**
   * Unknowns whose time derivative enters a residual (probed once per assembled system at the current state: residual
   * change when the derivative of one unknown alone is perturbed), plus `_state_` variables and BDF1-pinned frame poses.
   * A residual that cannot be evaluated at a probe counts as a dependency (never drop an unknown on missing information).
   */
  private differentiatedMask(system: AssembledSystem, x: number[], ctx: EquationContext): boolean[] {
    const cached = this.differentiatedCache.get(system);
    if (cached) return cached;
    const n = system.systemSize;
    const mask = system.isDifferentialState.map((d, i) => d || system.firstOrderOnly?.[i] === true);
    const probeCtx: EquationContext = { ...ctx, states: [...x], stateDerivatives: new Array(n).fill(0) };
    const quiet = <T>(fn: () => T): T | undefined => {
      const e = console.error; const w = console.warn;
      console.error = () => {}; console.warn = () => {};
      try { return fn(); } catch { return undefined; } finally { console.error = e; console.warn = w; }
    };
    const zero = new Array(n).fill(0);
    const f0 = quiet(() => system.residuals([...x], zero.slice(), probeCtx));
    for (let j = 0; j < n; j++) {
      if (mask[j]) continue;
      if (!f0) { mask[j] = true; continue; }
      const dx = zero.slice();
      dx[j] = 1e-3 * Math.max(1, Math.abs(x[j])) / ctx.dt;
      const f1 = quiet(() => system.residuals([...x], dx, probeCtx));
      if (!f1) { mask[j] = true; continue; }
      for (let i = 0; i < n; i++) {
        const d = Math.abs(f1[i] - f0[i]);
        if (!(d <= 1e-12 * Math.max(1, Math.abs(f0[i]), Math.abs(f1[i])))) { mask[j] = true; break; }
      }
    }
    this.differentiatedCache.set(system, mask);
    return mask;
  }

  /** Across-variable index of every net root (cached per assembled system). */
  private acrossIndexCache = new WeakMap<AssembledSystem, Map<string, number>>();

  private acrossIndexOf(system: AssembledSystem, root: string): number {
    let cache = this.acrossIndexCache.get(system);
    if (!cache) { cache = new Map(); this.acrossIndexCache.set(system, cache); }
    let idx = cache.get(root);
    if (idx === undefined) {
      const varName = `Across_${root}_`;
      idx = system.variableNames.findIndex(name => name.includes(varName));
      cache.set(root, idx);
    }
    return idx;
  }

  /** Every event indicator of the model at (x, time), in a fixed order (the switching surfaces are their zeros). */
  private eventIndicators(nodes: Node[], system: AssembledSystem, xVec: number[], time: number): number[] {
    const all: number[] = [];

    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      const comp = system.components.find(c => c.blockId === node.id);
      if (!comp) return;

      const getIndicators = (xVec: number[], time: number): number[] => {
        const indicators: number[] = [];
        const ports = Array.from(comp.portNodeMap.keys());
        const acrossVals = ports.map(portId => {
          const sysIdx = this.acrossIndexOf(system, comp.portNodeMap.get(portId)!);
          return sysIdx !== -1 ? xVec[sysIdx] : 0;
        });
        
        const params = comp.params;
        const getPortVal = (portId: string): number => {
          const pIdx = ports.indexOf(portId);
          return pIdx !== -1 ? acrossVals[pIdx] : 0;
        };
        
        if (type === 'switch') {
          // WP-11: the control signal is read by port id (the port order of the node map is not part of the contract)
          const ctrl = getPortVal('v');
          const threshold = numericParam(params, 'threshold', 0.5);
          indicators.push(ctrl - threshold);
        }
        else if (type === 'ps_switch') {
          // WP-20a (F-077): the control port is read by id and the threshold default is the library default (0), the same
          // value the equation uses (they used to disagree: port position 1 vs 2, default 0.5 vs 0)
          indicators.push(getPortVal('ctrl') - numericParam(params, 'threshold', 0));
        }
        else if (type === 'ps_step') {
          // WP-20a: the step is a time event; the step is cut so that it ends just before the jump (the equation switches at
          // time >= step time - SIGNAL_TIME_QUANTUM / 2, so the cut step still integrates the pre-jump value)
          indicators.push(time - (numericParam(params, 'time', 1) - SIGNAL_TIME_QUANTUM));
        }
        else if (type === 'ps_stair_gen') {
          // WP-20a: the stair changes level at every k * ts; sin(pi t / ts) crosses zero exactly there
          indicators.push(Math.sin(Math.PI * (time + SIGNAL_TIME_QUANTUM) / numericParam(params, 'ts', 0.1)));
        }
        else if (type === 'ps_integrator_gen') {
          // WP-20a: external reset is level-sensitive: the integrator holds y = initial while reset > 0.5
          indicators.push(getPortVal('reset') - SIGNAL_LOGIC_THRESHOLD);
        }
        else if (type === 'ps_sample_hold') {
          // WP-20a: tracks u while S > 0.5, holds while S <= 0.5
          indicators.push(getPortVal('s') - SIGNAL_LOGIC_THRESHOLD);
        }
        else if (type === 'ps_sr_flipflop') {
          indicators.push(getPortVal('s') - SIGNAL_LOGIC_THRESHOLD);
          indicators.push(getPortVal('r') - SIGNAL_LOGIC_THRESHOLD);
        }
        else if (type === 'trans_hard_stop' || type === 'rot_hard_stop') {
          // WP-13 (F-075): contact entry / exit is a zero crossing of the relative position (state x / theta) against the bounds
          const lower = numericParam(params, 'lower', type === 'rot_hard_stop' ? -1 : -0.1);
          const upper = numericParam(params, 'upper', type === 'rot_hard_stop' ? 1 : 0.1);
          const pos = xVec[comp.stateIndices[0]] || 0;
          indicators.push(pos - lower);
          indicators.push(pos - upper);
        }
        else if (type === 'belt_end') {
          // WP-13 (F-061): taut <-> slack. The tension is T = max(0, k x + c v) with x the extension; the sign change of k x + c v is the event.
          const x = xVec[comp.stateIndices[0]] || 0;
          const v = getPortVal('e') - getPortVal('r');
          indicators.push(beltEndStiffness(params) * x + numericParam(params, 'damping', 0) * v);
        }
        else if (type === 'ps_saturation') {
          // the library defaults (WP-20a: they used to be +-10 here and +-1 in the equation)
          const lower = numericParam(params, 'lower', -1);
          const upper = numericParam(params, 'upper', 1);
          const val = getPortVal('u');
          indicators.push(val - lower);
          indicators.push(val - upper);
        }
        else if (type === 'ps_dead_zone') {
          const upper = numericParam(params, 'upper', 0.5);
          const lower = numericParam(params, 'lower', -0.5);
          const val = getPortVal('u');
          indicators.push(val - upper);
          indicators.push(val - lower);
        }
        else if (type === 'diode') {
          const V = getPortVal('p') - getPortVal('n');
          const Vf = numericParam(params, 'Vf', 0.7);
          indicators.push(V - Vf);
        }
        else if (type === 'nmos') {
          const Vd = getPortVal('d');
          const Vs = getPortVal('s');
          const Vg = getPortVal('g');
          // WP-11: Shichman-Hodges is C0 at Vgs = Vth (Id = 0 on both sides) and C1 at the saturation boundary
          // Vds = Vgs - Vth, so only the threshold kink is a switching event. The device is symmetric (source and drain
          // swap when Vds < 0), so the controlling gate-to-terminal voltage is Vg - min(Vs, Vd).
          const lowTerminal = Math.min(Number.isFinite(Vs) ? Vs : 0, Number.isFinite(Vd) ? Vd : 0);
          const Vth = numericParam(params, 'Vth', 2.0);
          indicators.push((Number.isFinite(Vg) ? Vg : 0) - lowTerminal - Vth);
        }
        else if (type === 'igbt') {
          const Vge = getPortVal('g') - getPortVal('e');
          const Vce = getPortVal('c') - getPortVal('e');
          const Vge_th = numericParam(params, 'Vge_th', 5.5);
          const Vce_sat = numericParam(params, 'Vce_sat', 1.5);
          indicators.push(Vge - Vge_th);
          indicators.push(Vce - Vce_sat);
        }
        else if (type === 'pwm_3ph_2level' && stringParam(params, 'model_mode', 'averaged') === 'switching') {
          // WP-12b: the leg states of the switching inverter change when the duty reference crosses the triangular carrier
          // (a function of time and of the wired reference). Indicator per leg: reference d_k - carrier(t).
          const root = comp.portNodeMap.get('vabc');
          const first = root === undefined ? -1 : system.variableNames.findIndex(name => name.startsWith(`Across_${root}_ch0_`));
          const vabc = first >= 0 ? [0, 1, 2].map(k => xVec[first + k]) : [0, 0, 0];
          const argsLike = {
            across: ports.map(portId => (portId === 'vabc' ? vabc : getPortVal(portId))),
            ports, connectedPorts: comp.connectedPorts, params,
          };
          const carrier = triangularCarrier(time, numericParam(params, 'f_sw', 5000));
          twoLevelReferences(argsLike, time).forEach(ref => indicators.push(ref - carrier));
        }

        // WP-20b: sampled blocks update on the grid k Ts (the step is cut at every sample), the encoder decoder also at every
        // edge of A / B / Z, and the blocks with an external reset at its level change
        const samplePeriod = SAMPLE_PERIODS[type];
        if (samplePeriod) indicators.push(Math.sin(Math.PI * (time + SIGNAL_TIME_QUANTUM) / samplePeriod(params)));
        if (type === 'quad_decoder') for (const id of ['a', 'b', 'z']) indicators.push(getPortVal(id) - SIGNAL_LOGIC_THRESHOLD);
        if (RESET_BLOCKS.has(type)) indicators.push(getPortVal('reset') - SIGNAL_LOGIC_THRESHOLD);

        return indicators;
      };

      for (const v of getIndicators(xVec, time)) all.push(v);
    });

    return all;
  }

  coSimulate(signalInputs: Record<string, number>, nodes: Node[], edges: Edge[]) {
    return {
      outputs: {}
    };
  }
}
