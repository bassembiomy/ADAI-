import { Node, Edge } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { ImplicitSolver } from './ImplicitSolver';
import { EquationContext, AssembledSystem, PhysicalDomain } from './types';
import { SolverConfiguration } from './kernel/types';
import { explicitSolverStep } from './ExplicitSolverAdapter';
import { initializeJointFrames } from './vlabJointInitialization';
import { jointKindOf, isJointMultiplierName } from './vlabJointCore';
import { assertValidTopology } from './vlabTopologyValidation';
import { assertStructurallyWellPosed, DAEStructureError } from './vlabStructure';
import { BlockEquationError, NonFiniteResidualError } from './vlabResidualDiagnostics';
import { readSolvedVariable } from './vlabScopeRead';
import { scopeTraceKey } from './vlabVectorPorts';
import { numericParam, stringParam } from './vlabParams';
import { twoLevelReferences, triangularCarrier, beltEndStiffness } from './vlabEquations';
import { ddtVector } from './vlabDiscretization';
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

class EventTriggerError extends Error {
  hEvent: number;
  constructor(hEvent: number) {
    super('Zero crossing event detected');
    this.name = 'EventTriggerError';
    this.hEvent = hEvent;
  }
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

  /** Optional wall-clock budget (ms) for one simulateStep call; 0 disables it. */
  private wallClockBudgetMs = 0;

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
        default:
          break;
      }
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
          x[idx] = 0.01 * (idx + 1);
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
    }

    const config = this.solverConfiguration;
    const method = config?.solver ?? 'auto';
    const isExplicit = method === 'euler' || method === 'rk4' || method === 'rk_adaptive';
    const sameMethod = !prevState?.solverMethod || prevState.solverMethod === method;
    let t = prevState?.time ?? config?.startTime ?? 0;
    const tTarget = t + dt;
    
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
    
    // Choose initial step size. Start with last accepted size but never start below 1ms
    // to avoid excessive step count.
    const initialStep = typeof config?.initialStep === 'number' ? config.initialStep : Math.min(dt, maxStep);
    let h = Math.min(maxStep, Math.max(minStep, lastDt || initialStep));
    
    // Keep the legacy epsilon for unconfigured models; configured jobs need
    // exact boundary handling for sub-microsecond solver settings.
    const targetEpsilon = config ? 0 : 1e-12;
    while (t < tTarget - targetEpsilon) {
      // Don't step past target time
      const remaining = tTarget - t;
      const stepFloor = Math.min(minStep, remaining);
      h = Math.min(h, remaining);
      if (t + h === t) throw new Error('Solver step is too small to advance simulation time.');
      
      let stepAccepted = false;
      let attemptsThisStep = 0;
      let eventStepStart: number | undefined;
      let nextX: number[] = [];
      
      while (!stepAccepted) {
        if (attemptsThisStep++ > 0) rejectedAttempts++;
        if (
          rejectedAttempts > this.maxStepAttempts ||
          (this.wallClockBudgetMs > 0 && Date.now() - budgetStart > this.wallClockBudgetMs)
        ) {
          const reason = rejectedAttempts > this.maxStepAttempts
            ? `exceeded ${this.maxStepAttempts} rejected step attempts`
            : `exceeded ${this.wallClockBudgetMs} ms wall-clock budget`;
          throw new Error(
            `VLab solver ${reason} advancing to t=${tTarget} ` +
            `(reached t=${t}, h=${h}, accepted=${acceptedSteps}, rejected=${rejectedSteps}, ` +
            `blocks=[${nodes.map(n => ((n.data as any)?.type ?? n.type ?? n.id)).join(', ')}]). ` +
            `The model is likely non-convergent; check parameters and connections.`
          );
        }
        // Enforce minimum step size to prevent infinite loops
        h = Math.max(stepFloor, h);
        
        try {
          const ctx: EquationContext = {
            dt: h,
            time: t + h,
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
              if (h <= stepFloor) throw new Error('Explicit solver cannot satisfy tolerances at minimumStep.');
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
            if (bdfOrder === 2 && prevX && lastDt) {
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
            const eventInfo = this.detectZeroCrossings(nodes, edges, xCurrent, nextX, system, t, t + h);
            if (eventInfo.eventOccurred && eventInfo.fraction < 0.999) {
              const hEvent = h * eventInfo.fraction;
              throw new EventTriggerError(hEvent);
            }
          }
          
          // --- Local Truncation Error (LTE) Control ---
          let lte = explicitLte;
          // Preserve the legacy unconfigured LTE path; configured runs use
          // their explicit minimum-step boundary for adaptive control.
          if (!isAlgebraicSystem && !isExplicit && !useSdirk && (config || h > 1e-6)) {
            const bdf1Residuals = (solveX: number[], solveCtx: EquationContext) => {
              const dx = ddtVector(solveX, solveCtx, system.firstOrderOnly);
              return system.residuals(solveX, dx, solveCtx);
            };
            const bdf1Ctx: EquationContext = { ...ctx, order: 1, prevPrevStates: undefined, prevDt: undefined };
            let comparison = this.solver.solve(bdf1Residuals, xCurrent, bdf1Ctx);
            // BDF1 needs a startup estimate too: compare one full step to two half steps.
            if (config && ctx.order === 1) {
              const halfResiduals = (solveX: number[], solveCtx: EquationContext) =>
                system.residuals(solveX, ddtVector(solveX, solveCtx, system.firstOrderOnly), solveCtx);
              const halfContext = { ...bdf1Ctx, dt: h / 2, time: t + h / 2 };
              const half = this.solver.solve(halfResiduals, xCurrent, halfContext);
              comparison = this.solver.solve(halfResiduals, half, { ...halfContext, time: t + h, prevStates: half });
            }
            
            let sumSq = 0;
            let diffCount = 0;
            for (let idx = 0; idx < system.systemSize; idx++) {
              if (config || system.isDifferentialState[idx]) {
                const diff = nextX[idx] - comparison[idx];
                const scale = (config?.relativeTolerance ?? 1e-3) * Math.max(Math.abs(nextX[idx]), Math.abs(xCurrent[idx]))
                  + (config?.absoluteTolerance ?? 1e-5);
                sumSq += (diff / scale) * (diff / scale);
                diffCount++;
              }
            }
            
            lte = diffCount > 0 ? Math.sqrt(sumSq / diffCount) : 0;
            if (lte > 1.0) {
              if (h <= stepFloor) throw new Error('BDF solver cannot satisfy tolerances at minimumStep.');
              rejectedSteps++;
              h = Math.max(stepFloor, h * 0.5);
              if (!config) bdfOrder = 1;
              continue;
            }
          }
          
          // Grow step size if error is low or if we are successfully resolving minimum steps
          const nextH = (lte < 0.1 || useSdirk) ? Math.min(h * 1.5, maxStep) : h;
          
          stepAccepted = true;
          acceptedSteps++;
          prevX = [...xCurrent];
          lastDt = h;
          xCurrent = [...nextX];
          t += h;
          h = nextH;
          bdfOrder = 2;
          
        } catch (error: any) {
          if (error instanceof EventTriggerError) {
            // WP-11 switching approach: the crossing is localized by cutting the step to the interpolated event time
            // (secant on the indicator, the Simscape zero-crossing behaviour). Once h has reached the step floor
            // the crossing is localized to within minimumStep: accept the step in the new mode (a mode-locked
            // continuation) instead of cutting again, which used to crawl at the floor and exhaust the attempt budget.
            if (eventStepStart === undefined) eventStepStart = h;
            eventRetries++;
            if (error.hEvent < h && h > stepFloor * (1 + 1e-9)) {
              h = Math.max(stepFloor, error.hEvent);
              bdfOrder = 1; // resolve the crossing before switching algebraic modes
            } else {
              stepAccepted = true;
              xCurrent = [...nextX];
              prevX = [...xCurrent];
              t += h;
              acceptedSteps++;
              eventsLocated++;
              // resume at the step size in force before the event cut, with a fresh BDF1 start in the new mode
              h = Math.max(stepFloor, Math.min(maxStep, eventStepStart));
              bdfOrder = 1;
            }
          } else if (error instanceof BlockEquationError || error instanceof DAEStructureError) {
            // A block equation that throws (or a structurally invalid model) is not a step-size problem: never retried.
            throw error;
          } else if (error instanceof NonFiniteResidualError) {
            // Non-finite residual: reject the step and halve h; if it persists at the minimum step, surface the
            // diagnostic (block / row / value) instead of iterating or accepting a state computed from zeros (F-045).
            if (isAlgebraicSystem || h <= stepFloor) throw error;
            rejectedSteps++;
            h = Math.max(stepFloor, h * 0.5);
            bdfOrder = 1;
          } else {
            if (isAlgebraicSystem) throw error;
            if (isExplicit && /requires explicit state equations/.test(error.message)) throw error;
            if (!config && !useSdirk) {
              useSdirk = true;
              console.warn("DAE BDF solver convergence issue. Promoting to SDIRK-3.");
            }
            if (h <= stepFloor && !useSdirk && config && config.maximumIterations <= 1) {
              throw new Error(`DAE Solver failed to converge at minimumStep: ${error.message}`);
            }
            if (h <= stepFloor) {
              // Preserve the established V-Lab behavior at the configured
              // minimum step: accept the best state rather than retrying
              // forever. Explicit-state incompatibilities are still errors.
              stepAccepted = true;
              if (nextX.length > 0) xCurrent = [...nextX];
              bdfOrder = 1; // best-effort state: no valid BDF2 history for the next step
              t += h;
              acceptedSteps++;
            } else {
              rejectedSteps++;
              h = Math.max(stepFloor, h * 0.5);
              bdfOrder = 1;
            }
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
      eventsLocated
    };
  }

  private detectZeroCrossings(
    nodes: Node[],
    edges: Edge[],
    xStart: number[],
    xEnd: number[],
    system: AssembledSystem,
    tStart = 0,
    tEnd = 0
  ): { eventOccurred: boolean; fraction: number } {
    let earliestFraction = 1.0;
    let eventOccurred = false;

    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      const comp = system.components.find(c => c.blockId === node.id);
      if (!comp) return;

      const getIndicators = (xVec: number[], time: number): number[] => {
        const indicators: number[] = [];
        const ports = Array.from(comp.portNodeMap.keys());
        const acrossVals = ports.map(portId => {
          const root = comp.portNodeMap.get(portId)!;
          // Find across index for root
          const varName = `Across_${root}_`;
          const sysIdx = system.variableNames.findIndex(name => name.includes(varName));
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
          const ctrl = acrossVals[1] !== undefined ? acrossVals[1] : 0;
          const threshold = numericParam(params, 'threshold', 0.5);
          indicators.push(ctrl - threshold);
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
          const lower = numericParam(params, 'lower', -10);
          const upper = numericParam(params, 'upper', 10);
          const val = acrossVals[0] || 0;
          indicators.push(val - lower);
          indicators.push(val - upper);
        }
        else if (type === 'ps_dead_zone') {
          const upper = numericParam(params, 'upper', 0.5);
          const lower = numericParam(params, 'lower', -0.5);
          const val = acrossVals[0] || 0;
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

        return indicators;
      };

      const indStart = getIndicators(xStart, tStart);
      const indEnd = getIndicators(xEnd, tEnd);
      
      indStart.forEach((valStart, i) => {
        const valEnd = indEnd[i];
        // A step that starts on the event surface (the previous step was cut at this crossing) is not a new crossing:
        // re-localizing it would shrink the step forever (the Newton-stall of F-075 style chatter).
        if (Math.abs(valStart) <= EVENT_BAND) return;
        if (valStart * valEnd < 0) {
          const fraction = Math.abs(valStart) / (Math.abs(valStart) + Math.abs(valEnd));
          if (fraction < earliestFraction) {
            earliestFraction = fraction;
            eventOccurred = true;
          }
        }
      });
    });
    
    return { eventOccurred, fraction: earliestFraction };
  }

  coSimulate(signalInputs: Record<string, number>, nodes: Node[], edges: Edge[]) {
    return {
      outputs: {}
    };
  }
}
