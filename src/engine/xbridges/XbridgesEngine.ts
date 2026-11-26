// src/engine/xbridges/XbridgesEngine.ts
import { XModel, XBlock, ModelDiagnostic, SolverOptions, BlockEvalContext } from './types';
import { BLOCK_LIBRARY, nextEventTimeOf, resetTwinRunState, getPolynomialCoefficients, trimLeadingZeros, effectivePortUnit } from './BlockDefinitions';
import { VectorUtils } from './VectorUtils';
import { runModelChecks, getBlockSampleTime, evaluateBlockParameters, parameterKindsOf, describeParameterProblem } from './modelChecks';
import { evaluateParameter } from './parameterEvaluation';

/** Tolerance for "sample time reached": 1e-9 s plus a few dozen ulps of t (floating-point error of t = start + k*h), far below any step. */
const hitTolerance = (t: number) => 1e-9 + 64 * Number.EPSILON * Math.abs(t);

export class XbridgesEngine {
  private model: XModel;
  public executionOrder: XBlock[] = [];
  public compiled = false;
  private blockMap = new Map<string, XBlock>();
  private signalValues = new Map<string, any>(); // key: "blockId.portId"
  public diagnostics: ModelDiagnostic[] = [];
  public options: SolverOptions | null = null;
  /** Set when a block threw an exception; solver run loops and the live loop stop (Simulink stops on a runtime error). */
  private fatal = false;
  public hasFatalError(): boolean {
    if (this.fatal) return true;
    // Stiff solver failures are pushed straight into `diagnostics` by StiffSolver; Simulink stops on a solver error.
    return this.diagnostics.some(d => d.severity === 'error' && (d.code.startsWith('STIFF_SOLVER_') || d.code === 'ZERO_CROSSING_CHATTER'));
  }

  /** Snapshot of the fault state; a variable-step solver uses it to discard a fault raised only at a rejected trial point. */
  public faultMark(): { fatal: boolean; count: number } {
    return { fatal: this.fatal, count: this.diagnostics.length };
  }
  /** Restores the fault state of `faultMark` (the trial point is rejected, so its faults are not those of the run). */
  public rollbackFaults(mark: { fatal: boolean; count: number }) {
    this.fatal = mark.fatal;
    this.diagnostics.length = Math.min(this.diagnostics.length, mark.count);
  }

  /** Mode of discontinuous blocks decided at the last major step (kept during minor steps). */
  private heldModes = new Map<string, any>();
  /** Fixed-step grid of the current run, for blocks that derive a phase from the integer tick. */
  private timeGrid(): { start: number; step: number } | undefined {
    const o = this.options as any;
    if (!o || typeof o.startTime !== 'number' || typeof o.fixedStep !== 'number' || !(o.fixedStep > 0)) return undefined;
    if (o.solver === 'ode23' || o.solver === 'ode45') return undefined;
    return { start: o.startTime, step: o.fixedStep };
  }
  private contextOf(block: XBlock, minor: boolean): BlockEvalContext {
    return {
      minor,
      mode: this.heldModes.get(block.id),
      setMode: (m: any) => { if (!minor) this.heldModes.set(block.id, m); },
      timeGrid: this.timeGrid(),
    };
  }
  /** Connection feeding each input port: key `${block}\u0000${port}`. */
  private inputIndex = new Map<string, { sourceBlock: string; sourcePort: string }>();
  private buildInputIndex() {
    this.inputIndex.clear();
    for (const c of this.flatConnections) {
      const key = `${c.targetBlock}\u0000${c.targetPort}`;
      if (!this.inputIndex.has(key)) this.inputIndex.set(key, c);
    }
  }

  /** Records an exception raised inside a block as a BLOCK_RUNTIME_FAULT error (once per block) and stops the run. */
  private reportBlockException(block: XBlock, where: string, err: unknown) {
    this.fatal = true;
    if (this.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes(block.id))) return;
    const text = err instanceof Error ? err.message : String(err);
    this.diagnostics.push({
      severity: 'error',
      code: 'BLOCK_RUNTIME_FAULT',
      message: `Block '${block.label || block.type}' raised an exception while ${where}: ${text}`,
      blockIds: [block.id],
    });
  }

  private sortedBlocks: XBlock[] = [];
  private cycleBlocks: XBlock[] = [];
  private downstreamBlocks: XBlock[] = [];
  private nextSampleTime = new Map<string, number>();

  /** Restores a discrete block's sample-hit grid from an engine snapshot (hit index and next scheduled tick). */
  restoreSampleGrid(blockId: string, grid: { hitIndex?: unknown; nextTick?: unknown }): void {
    const block = this.getBlock(blockId);
    if (!block || this.sampleTimeOf(block) <= 0) return;
    if (typeof grid.hitIndex !== 'number' || !Number.isFinite(grid.hitIndex)) return;
    if (typeof grid.nextTick !== 'number' || !Number.isFinite(grid.nextTick)) return;
    block.hitIndex = grid.hitIndex;
    block.nextTick = grid.nextTick;
    this.nextSampleTime.set(blockId, grid.nextTick);
  }
  private lastOutputs = new Map<string, any[]>();

  /** Restores the held (ZOH) output of a discrete block from an engine snapshot, so a resume between sample hits publishes it. */
  restoreHeldOutput(blockId: string, portId: string, value: unknown): void {
    const block = this.getBlock(blockId);
    if (!block || this.sampleTimeOf(block) <= 0) return;
    const index = block.outputs.findIndex(o => o.id === portId);
    if (index < 0) return;
    const cached = this.lastOutputs.get(blockId);
    if (cached) cached[index] = value;
    this.signalValues.set(`${blockId}.${portId}`, value);
  }

  constructor(model: XModel) {
    this.model = model;

    // Pre-sync LAPLACE_TRANSFORM blocks from connected DOE_MODEL blocks
    this.model.blocks.forEach(b => {
      if (b.type === 'LAPLACE_TRANSFORM') {
        const conn = this.model.connections.find(c => {
          const targetId = c.targetBlock || (c as any).target;
          const targetP = c.targetPort || (c as any).targetHandle;
          if (targetId !== b.id) return false;
          if (targetP === 'doe') return true;
          if (targetP === 'u' || targetP === 'in') {
            const srcId = c.sourceBlock || (c as any).source;
            const srcBlock = this.model.blocks.find(sb => sb.id === srcId);
            return srcBlock?.type === 'DOE_MODEL';
          }
          return false;
        });
        if (conn) {
          const sourceId = conn.sourceBlock || (conn as any).source;
          const sourceBlock = this.model.blocks.find(sb => sb.id === sourceId);
          // Only polynomial (RSM) models have a meaningful s-domain polynomial; GMDH/Taguchi equations are placeholders.
          const srcModelType = sourceBlock?.params?.modelType?.value || sourceBlock?.params?.modelType || 'RSM';
          if (sourceBlock && sourceBlock.type === 'DOE_MODEL' && srcModelType === 'RSM') {
            const equationStr = sourceBlock.params?.equation?.value || sourceBlock.params?.equation || '';
            const inputNames = sourceBlock.params?.inputNames?.value || sourceBlock.params?.inputNames || ['X1'];
            const factorName = inputNames[0] || 'X1';
            const mappingType = b.params.mappingType || 'denominator';
            const maxDegree = b.params.maxDegree !== undefined ? Number(b.params.maxDegree) : 3;
            
            if (equationStr) {
              const coeffs = getPolynomialCoefficients(equationStr, factorName, inputNames, maxDegree);
              const poly = trimLeadingZeros([...coeffs].reverse());
              if (mappingType === 'denominator') {
                b.params.denominator = poly;
                b.params.numerator = [1];
              } else {
                b.params.numerator = poly;
                b.params.denominator = b.params.defaultDenominator || [1, 1];
              }
              b.params.equation = equationStr;
            }
          }
        }
      }
    });

    // The nextEventTime contract is non-enumerable: a model that was cloned, spread or sent to the worker has lost it.
    this.model.blocks.forEach(b => {
      const next = nextEventTimeOf(b.type);
      if (next && typeof b.nextEventTime !== 'function') Object.defineProperty(b, 'nextEventTime', { value: next, enumerable: false, writable: true, configurable: true });
    });
    this.model.blocks.forEach(b => {
      if (!b.execute) {
        // Exact-case key first (BLOCK_LIBRARY has e.g. 'Integrator' and 'INTEGRATOR'); case-insensitive only without an exact match.
        const typeKey = Object.prototype.hasOwnProperty.call(BLOCK_LIBRARY, b.type)
          ? b.type
          : Object.keys(BLOCK_LIBRARY).find(k => k.toLowerCase() === b.type.toLowerCase());
        if (typeKey) {
          const fresh = BLOCK_LIBRARY[typeKey](b.id, b.params || {});
          // Restore every function member the factory defines (execute, evaluateDerivatives, updateDiscrete, ZeroCrossingFn, ...):
          // functions are not sent to the worker (XBV-047).
          for (const key of Object.keys(fresh)) {
            const member = (fresh as any)[key];
            if (typeof member === 'function' && typeof (b as any)[key] !== 'function') (b as any)[key] = member;
          }
          b.execute = fresh.execute;
          if (typeof fresh.nextEventTime === 'function' && typeof b.nextEventTime !== 'function') {
            Object.defineProperty(b, 'nextEventTime', { value: fresh.nextEventTime, enumerable: false, writable: true, configurable: true });
          }
          if (!b.inputs || b.inputs.length === 0) b.inputs = fresh.inputs;
          if (!b.outputs || b.outputs.length === 0) b.outputs = fresh.outputs;
          if (b.state === undefined) b.state = fresh.state;
          if (b.isStateful === undefined) b.isStateful = fresh.isStateful;
          // Merge computed params (e.g. A, B, C, D matrices from transfer function realization)
          if (fresh.params) {
            Object.keys(fresh.params).forEach(k => {
              if (b.params[k] === undefined) {
                b.params[k] = fresh.params[k];
              }
            });
          }
        }
      }
      this.blockMap.set(b.id, b);
    });
  }

  private flatBlocks: XBlock[] = [];
  /** Blocks of the compiled model (subsystems flattened). */
  public getFlatBlocks(): XBlock[] { return this.flatBlocks; }
  private flatConnections: { sourceBlock: string; sourcePort: string; targetBlock: string; targetPort: string }[] = [];

  private flatten() {
    this.flatBlocks = this.model.blocks.filter(b => b.type !== 'Subsystem');
    this.flatConnections = [];

    this.model.connections.forEach(conn => {
      const source = this.blockMap.get(conn.sourceBlock);
      const target = this.blockMap.get(conn.targetBlock);
      if (!source || !target) return;

      let sBlock = conn.sourceBlock;
      let sPort = conn.sourcePort;
      let tBlock = conn.targetBlock;
      let tPort = conn.targetPort;

      if (source.type === 'Subsystem') {
        sBlock = conn.sourcePort; // Subsystem port ID is the internal Outport block ID
        sPort = 'out';
      }
      if (target.type === 'Subsystem') {
        tBlock = conn.targetPort; // Subsystem port ID is the internal Inport block ID
        tPort = 'in';
      }

      this.flatConnections.push({ sourceBlock: sBlock, sourcePort: sPort, targetBlock: tBlock, targetPort: tPort });
    });
  }

  private validateConnections() {
    this.flatConnections.forEach(conn => {
      const sourceBlock = this.blockMap.get(conn.sourceBlock);
      const targetBlock = this.blockMap.get(conn.targetBlock);
      if (!sourceBlock || !targetBlock) return;

      const outPort = sourceBlock.outputs.find(o => o.id === conn.sourcePort);
      const inPort = targetBlock.inputs.find(i => i.id === conn.targetPort);
      if (!outPort || !inPort) return;

      const t1 = outPort.type;
      const t2 = inPort.type;

      if (t1 !== 'auto' && t2 !== 'auto' && t1 !== t2) {
        const isPowerLogical = (t1 === 'power' && t2 === 'logical') || (t1 === 'logical' && t2 === 'power');
        const isLogicalContinuous = (t1 === 'logical' && t2 === 'continuous') || (t1 === 'continuous' && t2 === 'logical');
        const isMatrixContinuous = (t1 === 'matrix' && t2 === 'continuous') || (t1 === 'continuous' && t2 === 'matrix');

        if (isPowerLogical || isLogicalContinuous || isMatrixContinuous) {
          this.diagnostics.push({
            severity: 'warning',
            code: 'SIGNAL_TYPE_MISMATCH',
            message: `Signal type mismatch: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' of type '${t1}' connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' of type '${t2}'.`,
            blockIds: [sourceBlock.id, targetBlock.id]
          });
        }
      }

      // Unit consistency validation
      // 'inherit' (Simulink unit inheritance) takes the unit of the connected signal and is never inconsistent.
      const outUnit = effectivePortUnit(sourceBlock, outPort), inUnit = effectivePortUnit(targetBlock, inPort);
      if (outUnit && inUnit && outUnit !== 'inherit' && inUnit !== 'inherit' && outUnit !== inUnit) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'UNIT_INCONSISTENCY',
          message: `Unit inconsistency: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' has unit '${outUnit}' but is connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' with unit '${inUnit}'.`,
          blockIds: [sourceBlock.id, targetBlock.id]
        });
      }

      // Frame consistency validation
      if (outPort.frame && inPort.frame && outPort.frame !== inPort.frame && outPort.frame !== 'none' && inPort.frame !== 'none') {
        this.diagnostics.push({
          severity: 'warning',
          code: 'FRAME_INCONSISTENCY',
          message: `Frame inconsistency: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' is in '${outPort.frame}' coordinate frame but is connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' which expects '${inPort.frame}' frame.`,
          blockIds: [sourceBlock.id, targetBlock.id]
        });
      }

      // Data type consistency validation
      if (outPort.dataType && inPort.dataType && outPort.dataType !== inPort.dataType) {
        this.diagnostics.push({
          severity: 'error',
          code: 'DATA_TYPE_MISMATCH',
          message: `Data type mismatch: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' of data type '${outPort.dataType}' connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' of data type '${inPort.dataType}'.`,
          blockIds: [sourceBlock.id, targetBlock.id]
        });
      }

      // Sample rate consistency validation
      if (outPort.sampleRate !== undefined && inPort.sampleRate !== undefined && outPort.sampleRate !== inPort.sampleRate) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'SAMPLE_RATE_MISMATCH',
          message: `Sample rate mismatch: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' has sample rate ${outPort.sampleRate} Hz but is connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' expecting ${inPort.sampleRate} Hz.`,
          blockIds: [sourceBlock.id, targetBlock.id]
        });
      }

      // Signal dimensions validation
      if (outPort.dimensions && inPort.dimensions) {
        const dim1 = outPort.dimensions.join('x');
        const dim2 = inPort.dimensions.join('x');
        if (dim1 !== dim2) {
          this.diagnostics.push({
            severity: 'error',
            code: 'DIMENSION_MISMATCH',
            message: `Dimension mismatch: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' with dimensions [${dim1}] connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' expecting [${dim2}].`,
            blockIds: [sourceBlock.id, targetBlock.id]
          });
        }
      }
    });
  }

  /** Malformed models (files, agent, DOE/TRM build models directly): duplicate ids, unknown types, two drivers on one input. */
  private validateStructure() {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const b of this.model.blocks) {
      if (seen.has(b.id) && !reported.has(b.id)) {
        reported.add(b.id);
        this.diagnostics.push({ severity: 'error', code: 'DUPLICATE_BLOCK_ID', message: `Model is malformed: more than one block has the id '${b.id}'.`, blockIds: [b.id] });
      }
      seen.add(b.id);
    }
    for (const b of this.flatBlocks) {
      if (typeof b.execute !== 'function') {
        this.diagnostics.push({ severity: 'error', code: 'UNKNOWN_BLOCK_TYPE', message: `Model is malformed: block '${b.label || b.id}' has the unknown block type '${b.type}'.`, blockIds: [b.id] });
      }
    }
    const drivers = new Map<string, number>();
    for (const c of this.flatConnections) {
      const key = `${c.targetBlock}\u0000${c.targetPort}`;
      const n = (drivers.get(key) ?? 0) + 1;
      drivers.set(key, n);
      if (n === 2) {
        const tb = this.blockMap.get(c.targetBlock);
        this.diagnostics.push({
          severity: 'error', code: 'MULTIPLE_DRIVERS',
          message: `Model is malformed: input port '${c.targetPort}' of block '${tb?.label || c.targetBlock}' is driven by more than one signal.`,
          blockIds: [c.targetBlock],
        });
      }
    }
  }

  /** Shape of a value as dimensions: undefined for a scalar, [n] for a vector, [r, c] for a matrix. */
  private shapeOfValue(v: any): number[] | undefined {
    if (!Array.isArray(v)) return undefined;
    if (v.length > 0 && Array.isArray(v[0])) return [v.length, (v[0] as any[]).length];
    return [v.length];
  }

  /**
   * Dimension propagation (Simulink: signal dimensions are propagated and checked at compile). Seeds are declared
   * output-port dimensions and Constant values; element-wise blocks (Sum, Vector Add/Sub/Mul/Div) accept scalars or
   * equally dimensioned signals and propagate the common dimension. Unknown dimensions are never flagged.
   */
  private propagateDimensions() {
    const ELEMENTWISE = new Set(['Sum', 'VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv']);
    const dims = new Map<string, number[] | undefined>();
    const key = (b: string, p: string) => `${b}\u0000${p}`;
    for (const b of this.flatBlocks) {
      for (const o of b.outputs) {
        let d: number[] | undefined = o.dimensions && o.dimensions.length > 0 ? o.dimensions : undefined;
        if (!d && b.type === 'Constant') {
          let v: any = b.params?.value;
          if (typeof v === 'string') { try { v = VectorUtils.parseMatlabArray(v); } catch { v = undefined; } }
          d = this.shapeOfValue(v);
        }
        dims.set(key(b.id, o.id), d);
      }
    }
    const dimsOf = (c: { sourceBlock: string; sourcePort: string }) => dims.get(key(c.sourceBlock, c.sourcePort));
    for (const b of this.executionOrder) {
      if (!ELEMENTWISE.has(b.type)) continue;
      const known: { name: string; dim: number[]; blockId: string }[] = [];
      for (const inp of b.inputs) {
        const c = this.inputIndex.get(key(b.id, inp.id));
        if (!c) continue;
        const d = dimsOf(c);
        if (d) known.push({ name: inp.name, dim: d, blockId: c.sourceBlock });
      }
      const nonScalar = known.filter(k => !(k.dim.length === 1 && k.dim[0] === 1));
      let common: number[] | undefined = nonScalar[0]?.dim;
      for (const k of nonScalar) {
        if (common && k.dim.join('x') !== common.join('x')) {
          this.diagnostics.push({
            severity: 'error',
            code: 'DIMENSION_MISMATCH',
            message: `Dimension mismatch: inputs of block '${b.label || b.type}' have incompatible dimensions [${common.join('x')}] and [${k.dim.join('x')}].`,
            blockIds: [b.id, k.blockId],
          });
          common = undefined;
          break;
        }
      }
      const out = b.outputs[0];
      if (out) dims.set(key(b.id, out.id), common);
    }
  }

  /**
   * Parameters typed as MATLAB expressions ('2*pi', '[1 2 3]') are evaluated and the block is rebuilt from the
   * evaluated values (some factories derive values, e.g. TF -> A..D). A block with an invalid parameter is left
   * untouched; modelChecks reports the problem and the model is not simulated.
   */
  private resolveParameters() {
    for (const b of this.flatBlocks) {
      const { resolved, problems } = evaluateBlockParameters(b);
      if (problems.length > 0 || Object.keys(resolved).length === 0) continue;
      this.rebuildBlock(b, { ...b.params, ...resolved });
    }
  }

  /** Re-instantiates the block's behaviour from `params` in place (id, label and the object identity are kept). */
  private rebuildBlock(b: XBlock, params: Record<string, any>) {
    const typeKey = BLOCK_LIBRARY[b.type] ? b.type : Object.keys(BLOCK_LIBRARY).find(k => k.toLowerCase() === b.type.toLowerCase());
    if (!typeKey) { b.params = params; return; }
    try {
      const fresh = BLOCK_LIBRARY[typeKey](b.id, params);
      const keep = new Set(['id', 'type', 'label', 'parentId', 'params']);
      for (const k of Object.keys(fresh)) if (!keep.has(k)) (b as any)[k] = (fresh as any)[k];
      b.params = { ...params, ...fresh.params };
    } catch {
      b.params = params;
    }
  }

  /**
   * Live parameter edit (Simulink: change a block parameter while the model runs). Text is evaluated like at compile;
   * valid values replace the block's parameters (re-seeding derived values through patchBlockParams); an invalid
   * value adds one PARAMETER_* error and the last valid value is kept.
   */
  public applyParameterUpdates(blockId: string, updates: Record<string, any>) {
    const block = this.blockMap.get(blockId);
    if (!block || !updates) return;
    const kinds = parameterKindsOf(block.type);
    const accepted: Record<string, any> = {};
    for (const [param, raw] of Object.entries(updates)) {
      const kind = kinds[param];
      const tag = `parameter '${param}'`;
      const stale = (d: { code: string; blockIds?: string[]; message: string }) =>
        d.code.startsWith('PARAMETER_') && d.blockIds?.length === 1 && d.blockIds[0] === blockId && d.message.includes(tag);
      if (!kind) {
        if (JSON.stringify(raw) !== JSON.stringify(block.params[param])) accepted[param] = raw;
        continue;
      }
      const r = evaluateParameter(raw, kind);
      if (!r.ok) {
        const problem = { param, raw, code: r.code, reason: r.reason };
        const message = describeParameterProblem(block, problem);
        if (!this.diagnostics.some(d => d.code === r.code && d.message === message && stale(d))) {
          this.diagnostics.push({ severity: 'error', code: r.code, message, blockIds: [blockId] });
        }
        continue;
      }
      this.diagnostics = this.diagnostics.filter(d => !stale(d));
      const value = typeof raw === 'string' && kind.kind !== 'option' ? r.value : raw;
      if (JSON.stringify(value) !== JSON.stringify(block.params[param])) accepted[param] = value;
    }
    // Delay length 0 makes the Delay direct feedthrough, which changes the execution order fixed at compile: a live
    // change across 0 is refused (last valid value kept) until the model is recompiled.
    if (block.type === 'DELAY' && accepted.delay_length !== undefined
        && (Number(accepted.delay_length) === 0) !== (Number(block.params.delay_length) === 0)) {
      this.diagnostics.push({
        severity: 'error', code: 'PARAMETER_OUT_OF_RANGE',
        message: `Block '${block.label || block.id}': parameter 'delay_length' cannot change to or from 0 while the model runs (0 makes the Delay direct feedthrough and changes the execution order). Stop, edit the value and compile again.`,
        blockIds: [blockId],
      });
      delete accepted.delay_length;
    }
    if (Object.keys(accepted).length > 0) this.patchBlockParams(blockId, accepted);
  }

  /** Message when options.algTol / options.maxIter is present but invalid; null when both are unset or valid. */
  private loopOptionProblem(): string | null {
    const o = this.options as { algTol?: unknown; maxIter?: unknown } | undefined;
    const a = o?.algTol;
    const m = o?.maxIter;
    if (a !== undefined && !(typeof a === 'number' && Number.isFinite(a) && a > 0)) {
      return `Algebraic loop tolerance must be a finite number > 0 (algTol = ${String(a)}).`;
    }
    if (m !== undefined && !(typeof m === 'number' && Number.isSafeInteger(m) && m >= 1)) {
      return `Algebraic loop iteration limit must be an integer >= 1 (maxIter = ${String(m)}).`;
    }
    return null;
  }

  public compile(startTime = 0): ModelDiagnostic[] {
    resetTwinRunState(); // run-level state held outside the blocks starts from its initial value (XBV-188)
    this.diagnostics = [];
    this.fatal = false;
    this.flatten();
    this.resolveParameters();
    this.buildInputIndex();
    this.heldModes.clear();
    this.validateStructure();
    this.validateConnections();
    
    // Validate parameters of Fuzzy Surface Viewer blocks
    this.flatBlocks.forEach(b => {
      if (b.type === 'FUZZY_SURFACE_VIEWER' && (!b.params || !b.params.fisConfig)) {
        this.diagnostics.push({
          severity: 'error',
          code: 'MISSING_FIS_CONFIG',
          message: `Fuzzy Surface Viewer block '${b.label || b.id}' has no FIS configuration linked. Select a valid Fuzzy Inference System block in the properties panel.`,
          blockIds: [b.id]
        });
      }
    });
    
    // 1. Build adjacency list for Topological Sort.
    // Hard sorting dependency: an edge s->t where t has direct feedthrough. Phase 1 orders by ALL edges (so a
    // non-feedthrough block such as a Unit Delay is evaluated after its source whenever there is no loop); what is left
    // (blocks on or behind a loop) is ordered in phase 2 by feedthrough edges only.
    const isFeedthrough = (b: XBlock): boolean => b.directFeedthrough ?? !b.isStateful;
    // Per-port feedthrough (Simulink: direct feedthrough is a property of each input port): a block may list the input
    // ports its outputs depend on in `feedthroughInputs`; without the list every input of a feedthrough block counts.
    const edgeFt = (b: XBlock, port: string): boolean => isFeedthrough(b) && (!b.feedthroughInputs || b.feedthroughInputs.includes(port));
    const adjList = new Map<string, { to: string; ft: boolean }[]>();
    const inDegreeAll = new Map<string, number>();
    const inDegree = new Map<string, number>();

    this.flatBlocks.forEach(b => {
      adjList.set(b.id, []);
      inDegree.set(b.id, 0);
      inDegreeAll.set(b.id, 0);
    });

    this.flatConnections.forEach(conn => {
      const sourceBlock = this.blockMap.get(conn.sourceBlock);
      const targetBlock = this.blockMap.get(conn.targetBlock);
      if (sourceBlock && targetBlock && adjList.has(conn.sourceBlock) && adjList.has(conn.targetBlock)) {
        const ft = edgeFt(targetBlock, conn.targetPort);
        adjList.get(conn.sourceBlock)!.push({ to: conn.targetBlock, ft });
        inDegreeAll.set(conn.targetBlock, inDegreeAll.get(conn.targetBlock)! + 1);
        if (ft) {
          inDegree.set(conn.targetBlock, inDegree.get(conn.targetBlock)! + 1);
        }
      }
    });

    // 2. Kahn's algorithm, phase 1 (all edges) then phase 2 (feedthrough edges, among the remaining blocks).
    const sortedBlocks: XBlock[] = [];
    const placed = new Set<string>();
    {
      const queue: string[] = [];
      inDegreeAll.forEach((degree, blockId) => { if (degree === 0) queue.push(blockId); });
      for (let qi = 0; qi < queue.length; qi++) {
        const u = queue[qi];
        sortedBlocks.push(this.blockMap.get(u)!);
        placed.add(u);
        adjList.get(u)!.forEach(({ to: v }) => {
          inDegreeAll.set(v, inDegreeAll.get(v)! - 1);
          if (inDegreeAll.get(v) === 0) queue.push(v);
        });
      }
    }
    if (placed.size < this.flatBlocks.length) {
      // Edges coming from phase-1 blocks are satisfied already.
      const remaining = new Map<string, number>();
      this.flatBlocks.forEach(b => { if (!placed.has(b.id)) remaining.set(b.id, 0); });
      this.flatConnections.forEach(conn => {
        const tb = this.blockMap.get(conn.targetBlock);
        if (tb && remaining.has(conn.targetBlock) && remaining.has(conn.sourceBlock) && edgeFt(tb, conn.targetPort)) {
          remaining.set(conn.targetBlock, remaining.get(conn.targetBlock)! + 1);
        }
      });
      const queue: string[] = [];
      // keep model order for the start of phase 2
      this.flatBlocks.forEach(b => { if (remaining.get(b.id) === 0) queue.push(b.id); });
      for (let qi = 0; qi < queue.length; qi++) {
        const u = queue[qi];
        sortedBlocks.push(this.blockMap.get(u)!);
        placed.add(u);
        adjList.get(u)!.forEach(({ to: v, ft }) => {
          if (!remaining.has(v) || !ft) return;
          remaining.set(v, remaining.get(v)! - 1);
          if (remaining.get(v) === 0) queue.push(v);
        });
      }
    }

    const missing = this.flatBlocks.filter(b => !placed.has(b.id));
    const cycleBlocks: XBlock[] = [];
    const downstreamBlocks: XBlock[] = [];

    if (missing.length > 0) {
      // Find which blocks are in actual loops (strongly connected)
      const canReach = (startId: string, targetId: string): boolean => {
        const visited = new Set<string>();
        const q = [startId];
        while (q.length > 0) {
          const curr = q.shift()!;
          if (curr === targetId && visited.size > 0) return true;
          if (visited.has(curr)) continue;
          visited.add(curr);
          
          (adjList.get(curr) ?? []).forEach(({ to, ft }) => { if (ft) q.push(to); });
        }
        return false;
      };

      missing.forEach(b => {
        if (canReach(b.id, b.id)) {
          cycleBlocks.push(b);
        } else {
          downstreamBlocks.push(b);
        }
      });

      const missingLabels = cycleBlocks.map(b => b.label || b.type).join(', ');
      if (cycleBlocks.length > 0) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'ALGEBRAIC_LOOP',
          message: `Algebraic loop detected involving blocks: ${missingLabels}. Solving using Newton-Raphson iteration.`,
          blockIds: cycleBlocks.map(b => b.id)
        });
      }
    }

    // Simulink-equivalent compile-time checks (connectivity, sample times / solver, parameter constraints).
    this.diagnostics.push(...runModelChecks(this.flatBlocks, this.flatConnections, this.options));

    const loopOptionProblem = this.loopOptionProblem();
    if (loopOptionProblem !== null && !this.diagnostics.some(d => d.code === 'STIFF_SOLVER_INVALID_OPTION')) {
      this.diagnostics.push({ severity: 'error', code: 'STIFF_SOLVER_INVALID_OPTION', message: loopOptionProblem });
    }

    this.sortedBlocks = sortedBlocks;
    this.cycleBlocks = cycleBlocks;
    this.downstreamBlocks = downstreamBlocks;
    this.executionOrder = [...sortedBlocks, ...cycleBlocks, ...downstreamBlocks];
    this.propagateDimensions();

    // 3. Initialize signal map, sample times, and ZOH caches
    this.nextSampleTime.clear();
    this.lastOutputs.clear();
    this.flatBlocks.forEach(b => {
      b.outputs.forEach(out => {
        this.signalValues.set(`${b.id}.${out.id}`, out.value);
      });
      const ts = this.sampleTimeOf(b);
      if (ts > 0) {
        // Sample hits lie on the absolute grid t = n*Ts: first hit is the smallest n*Ts >= startTime (1e-9 tolerance).
        const n0 = Math.ceil(startTime / ts - Math.max(1e-6, 64 * Number.EPSILON * Math.abs(startTime / ts)));
        const firstHit = n0 * ts;
        b.hitIndex = n0;
        b.nextTick = firstHit;
        this.nextSampleTime.set(b.id, firstHit);
        this.lastOutputs.set(b.id, b.outputs.map(out => out.value));
      }
    });

    this.compiled = true;
    return this.diagnostics;
  }

  public gatherInputs(block: XBlock): any[] {
    return block.inputs.map(inPort => {
      const conn = this.inputIndex.get(`${block.id}\u0000${inPort.id}`);
      if (conn) {
        return this.signalValues.get(`${conn.sourceBlock}.${conn.sourcePort}`);
      }
      return inPort.value;
    });
  }

  private checkNumericalStability(block: XBlock, val: any, context: string) {
    const isInvalid = (v: any): boolean => {
      if (typeof v === 'number') {
        return isNaN(v) || !isFinite(v);
      }
      if (Array.isArray(v)) {
        return v.some(isInvalid);
      }
      if (typeof v === 'object' && v !== null) {
        return Object.values(v).some(isInvalid);
      }
      return false;
    };

    if (isInvalid(val)) {
      const msg = `Numerical instability detected in block '${block.label || block.type}' (${context}): value is NaN or Infinite.`;
      if (!this.diagnostics.some(d => d.message === msg)) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'NUMERICAL_INSTABILITY',
          message: msg,
          blockIds: [block.id]
        });
      }
    }
  }

  /** Periodic sample time of a block (`sampleTime` or its alias `sample_time`); 0 when continuous/inherited/invalid. */
  private sampleTimeOf(block: XBlock): number {
    const t = getBlockSampleTime(block);
    return t !== null && Number.isFinite(t) && t > 0 ? t : 0;
  }

  private executeBlockOrCache(block: XBlock, time: number, tempStates?: Map<string, any>) {
    if (this.fatal) return;
    const ts = this.sampleTimeOf(block);
    if (ts > 0) {
      const nextTime = block.nextTick ?? this.nextSampleTime.get(block.id) ?? 0;
      // Minor stages (tempStates) of a solver step never trigger a sample hit: discrete outputs are held (ZOH).
      if (time < nextTime - hitTolerance(time) || tempStates) {
        const cached = this.lastOutputs.get(block.id);
        if (cached) {
          block.outputs.forEach((outPort, i) => {
            this.signalValues.set(`${block.id}.${outPort.id}`, cached[i]);
          });
          return;
        }
      }
    }

    const inputValues = this.gatherInputs(block);
    const currentState = tempStates?.has(block.id) ? tempStates.get(block.id) : block.state;
    
    try {
      const result = block.execute(inputValues, block.params, currentState, time, this.contextOf(block, tempStates !== undefined));
      result.outputs.forEach((val, i) => {
        this.checkNumericalStability(block, val, `Output[${i}]`);
      });

      const runtimeError = (result as any).error;
      if (runtimeError) {
        this.fatal = true; // Simulink stops on a block error
        const faultCode = (result as any).nextState?.lastFault?.code;
        // One diagnostic per block per run (this.diagnostics is reset at the start of each run).
        if (!this.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes(block.id))) {
          this.diagnostics.push({
            severity: 'error',
            code: 'BLOCK_RUNTIME_FAULT',
            message: `Block '${block.label || block.type}' reported a runtime fault${faultCode ? ` [${faultCode}]` : ''}: ${String(runtimeError)}`,
            blockIds: [block.id]
          });
        }
      }

      const typed = result.diagnostic;
      if (typed && typed.severity === 'error') this.fatal = true;
      if (typed && !this.diagnostics.some(d => d.code === typed.code && d.blockIds?.includes(block.id))) {
        this.diagnostics.push({
          severity: typed.severity,
          code: typed.code,
          message: `Block '${block.label || block.type}': ${typed.message}`,
          blockIds: [block.id]
        });
      }

      block.outputs.forEach((outPort, i) => {
        this.signalValues.set(`${block.id}.${outPort.id}`, result.outputs[i]);
      });

      if (ts > 0) {
        this.lastOutputs.set(block.id, [...result.outputs]);
      }
    } catch (err: any) {
      this.reportBlockException(block, 'executing', err);
    }
  }

  private solveAlgebraicLoop(time: number, tempStates?: Map<string, any>, algTol = 1e-6, maxIter = 100) {
    this.solveAlgebraicLoopCore(time, tempStates, algTol, maxIter);
    // Modes of discontinuous blocks inside the loop must reflect the solution, not an intermediate iterate: one more
    // pass at the solution fixes them (major steps) before minor steps hold them.
    if (!this.fatal && !(tempStates !== undefined)) {
      this.cycleBlocks.forEach(b => this.executeBlockOrCache(b, time, tempStates));
    }
  }

  private solveAlgebraicLoopCore(time: number, tempStates?: Map<string, any>, algTol = 1e-6, maxIter = 100) {
    const loopKeys: { blockId: string; portId: string; block: XBlock; portIndex: number }[] = [];
    this.cycleBlocks.forEach(b => {
      b.outputs.forEach((out, idx) => {
        loopKeys.push({ blockId: b.id, portId: out.id, block: b, portIndex: idx });
      });
    });

    if (loopKeys.length === 0) return;

    // Gauss-Seidel passes (cycle blocks in order) before falling back to Newton.
    const allKeys = loopKeys.slice(); // every loop output; loopKeys is narrowed to the numeric ones below (Newton)
    const snapshot = () => allKeys.map(lk => this.signalValues.get(`${lk.blockId}.${lk.portId}`));
    const settledValue = (a: any, b: any): boolean => {
      if (typeof a === 'number' && typeof b === 'number') {
        if (a === b) return true;
        return Math.abs(a - b) <= algTol * (1 + Math.abs(b));
      }
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => settledValue(v, b[i]));
      }
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        return ka.length === kb.length && ka.every(k => k in b && settledValue(a[k], b[k]));
      }
      return a === b;
    };
    const isFiniteValue = (v: any): boolean => {
      if (typeof v === 'number') return Number.isFinite(v);
      if (Array.isArray(v)) return v.every(isFiniteValue);
      if (v && typeof v === 'object') return Object.values(v).every(isFiniteValue);
      return true;
    };
    let prev = snapshot();
    const start = prev;
    const maxPasses = this.options?.algMaxPasses ?? 50;
    // Size of one sweep's change (scaled); a sweep only counts as converged when the change is also not growing
    // (a contraction). A warm-started iterate whose first sweep barely moves can still sit far from the solution
    // when the loop gain is large (|g| > 1): the next sweep then changes g times more, so it is not accepted.
    const sweepChange = (a: any[], b: any[]): number => {
      let m = 0;
      const visit = (x: any, y: any) => {
        if (typeof x === 'number' && typeof y === 'number') {
          if (x !== y) m = Math.max(m, Math.abs(x - y) / (1 + Math.abs(y)));
        } else if (Array.isArray(x) && Array.isArray(y)) x.forEach((v, i) => visit(v, y[i]));
        else if (x && y && typeof x === 'object' && typeof y === 'object') Object.keys(x).forEach(k => visit(x[k], y[k]));
      };
      a.forEach((v, i) => visit(v, b[i]));
      return m;
    };

    // Newton operates on plain numeric outputs only (judged at the pre-sweep values); others are left untouched.
    const numericKeys = allKeys.filter((_, i) => typeof start[i] === 'number');
    loopKeys.length = 0;
    loopKeys.push(...numericKeys);
    const n = loopKeys.length;

    const reportNotConverged = () => {
      this.fatal = true; // Simulink stops when an algebraic loop cannot be solved
      if (this.diagnostics.some(d => d.code === 'ALGEBRAIC_LOOP_NOT_CONVERGED')) return;
      this.diagnostics.push({
        severity: 'error',
        code: 'ALGEBRAIC_LOOP_NOT_CONVERGED',
        message: `Algebraic loop through ${this.cycleBlocks.map(b => b.label || b.type).join(', ')} did not converge (tolerance ${algTol}).`,
        blockIds: this.cycleBlocks.map(b => b.id)
      });
    };

    const getZ = (): number[] => {
      return loopKeys.map(lk => {
        const val = this.signalValues.get(`${lk.blockId}.${lk.portId}`);
        return typeof val === 'number' ? val : 0;
      });
    };

    const setZ = (z: number[]) => {
      z.forEach((val, idx) => {
        const lk = loopKeys[idx];
        this.signalValues.set(`${lk.blockId}.${lk.portId}`, val);
      });
    };

    const evaluateF = (z: number[]): number[] => {
      setZ(z);
      const fVal: number[] = new Array(n).fill(0);
      
      this.cycleBlocks.forEach(block => {
        const inputValues = this.gatherInputs(block);
        const currentState = tempStates?.has(block.id) ? tempStates.get(block.id) : block.state;
        try {
          const result = block.execute(inputValues, block.params, currentState, time, this.contextOf(block, tempStates !== undefined));
          block.outputs.forEach((outPort, i) => {
            this.signalValues.set(`${block.id}.${outPort.id}`, result.outputs[i]);
          });
        } catch (err) {}
      });

      loopKeys.forEach((lk, idx) => {
        const val = this.signalValues.get(`${lk.blockId}.${lk.portId}`);
        fVal[idx] = typeof val === 'number' ? val : 0;
      });
      return fVal;
    };

    // Newton on g(z) = z - F(z) with a central (Richardson) finite-difference Jacobian, globalised by NLEQ-ERR (Deuflhard,
    // Numer. Math. 22, 1974; Nowak and Weimann), in the form measured in scripts/xbridges-verification/loopLab.ts (D24).
    // Convergence is judged on the solution (XBV-421): the residual AND the Newton correction within algTol (1 + |z|), plus
    // the rounding noise of F itself. Never on the residual alone: for a rate near 1 (or a multiple root) a tiny residual
    // leaves a large solution error. One iteration evaluates the loop (and its Jacobian); maxIter counts them.
    const EPS = 2.220446049250313e-16;
    const finite = (v: number[]) => v.every(Number.isFinite);
    const relNorm = (v: number[], zv: number[]): number => {
      let m = 0;
      for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]) / (1 + Math.abs(zv[i])));
      return m;
    };
    const residualOf = (zv: number[], fv: number[]) => zv.map((zi, i) => zi - fv[i]);
    const absNorm = (v: number[]) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    // dF/dz by central differences, h and 2h combined (error O(h^4), no truncation error for a cubic); null when F is not
    // finite at any of the four points. An entry within the rounding noise of the difference quotient, 32 eps |F_i| / h,
    // cannot be told from zero and is set to zero (J); where F is not finite on one side the one-sided difference (forward, then backward, step 1e-6 scale) is used; the matrix without that step is returned as well (raw), for the
    // case where every entry of a row is noise (|F| so large that no derivative is resolved) and J is singular.
    const jacobianOf = (zv: number[], fv: number[]): { J: number[][]; raw: number[][] } | null => {
      const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      const raw: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let j = 0; j < n; j++) {
        const h = 1e-4 * Math.max(1, Math.abs(zv[j]));
        const at = (d: number) => evaluateF(zv.map((v, i) => (i === j ? v + d : v)));
        const p1 = at(h), m1 = at(-h);
        let col: number[] | null = null;
        let hUsed = h;
        if (finite(p1) && finite(m1)) {
          const d1 = p1.map((v, i) => (v - m1[i]) / (2 * h));
          const p2 = at(2 * h), m2 = at(-2 * h);
          col = finite(p2) && finite(m2) ? d1.map((v, i) => (4 * v - (p2[i] - m2[i]) / (4 * h)) / 3) : d1;
        } else {
          // F is not finite on one side (e.g. a square root at its domain edge): a one-sided difference on the finite side,
          // forward first, then backward. Both sides non-finite: the column is unusable.
          const hf = 1e-6 * Math.max(1, Math.abs(zv[j]));
          const pf = at(hf);
          if (finite(pf)) { col = pf.map((v, i) => (v - fv[i]) / hf); hUsed = hf; }
          else {
            const mf = at(-hf);
            if (finite(mf)) { col = mf.map((v, i) => (fv[i] - v) / hf); hUsed = hf; }
          }
        }
        if (!col || !finite(col)) return null;
        for (let i = 0; i < n; i++) {
          J[i][j] = raw[i][j] = (i === j ? 1 : 0) - col[i];
          if (Math.abs(J[i][j]) <= (32 * EPS * Math.abs(fv[i])) / hUsed) J[i][j] = 0;
        }
      }
      return finite(raw.flat()) ? { J, raw } : null;
    };
    // Gaussian elimination with partial pivoting after column scaling by w (the unknowns' scale 1 + |z|, x = W y) and row
    // equilibration (every row to max-norm 1). Singular only when a row is identically zero or a pivot is exactly zero or not
    // finite: a determinant that is small but resolvable (e.g. 2 k z) is a regular system (LAB-1).
    const solveScaled = (A: number[][], b: number[], w?: number[]): number[] | null => {
      const wt = w ?? new Array(n).fill(1);
      const R: number[][] = [];
      for (let i = 0; i < n; i++) {
        const scaled = A[i].map((v, j) => v * wt[j]);
        const m = absNorm(scaled);
        if (!(m > 0) || !Number.isFinite(m)) return null;
        R.push([...scaled.map(v => v / m), b[i] / m]);
      }
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(R[r][c]) > Math.abs(R[piv][c])) piv = r;
        if (R[piv][c] === 0 || !Number.isFinite(R[piv][c])) return null;
        [R[c], R[piv]] = [R[piv], R[c]];
        for (let r = c + 1; r < n; r++) {
          const f = R[r][c] / R[c][c];
          if (f !== 0) for (let k = c; k <= n; k++) R[r][k] -= f * R[c][k];
        }
      }
      const x = new Array(n).fill(0);
      for (let r = n - 1; r >= 0; r--) {
        let acc = R[r][n];
        for (let k = r + 1; k < n; k++) acc -= R[r][k] * x[k];
        x[r] = acc / R[r][r];
      }
      const out = x.map((v, j) => v * wt[j]);
      return finite(out) ? out : null;
    };
    // Rounding noise of a simplified Newton correction J^-1 r when r carries the componentwise absolute error rn: |J^-1| rn.
    const correctionNoise = (J: number[][], w: number[], rn: number[]): number[] | null => {
      const out = new Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        const e = new Array(n).fill(0);
        e[j] = 1;
        const col = solveScaled(J, e, w);
        if (!col) return null;
        for (let i = 0; i < n; i++) out[i] += Math.abs(col[i]) * rn[j];
      }
      return out;
    };
    // Least-squares direction (damped normal equations) for a singular Jacobian; null for a zero Jacobian.
    const dampedDirection = (J: number[][], g: number[]): number[] | null => {
      const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, c) => J.reduce((acc, row) => acc + row[a] * row[c], 0)));
      const maxDiag = Math.max(...JtJ.map((row, i) => row[i]));
      if (!(maxDiag > 0) || !Number.isFinite(maxDiag)) return null;
      for (let i = 0; i < n; i++) JtJ[i][i] += 1e-8 * maxDiag;
      const rhs = Array.from({ length: n }, (_, a) => -J.reduce((acc, row, i) => acc + row[a] * g[i], 0));
      return solveScaled(JtJ, rhs);
    };
    // XBV-421: an accepted point is a root of g to within algTol (1 + |z|) plus the rounding noise of F itself (the larger of
    // |z| and |F|), AND its Newton correction dz is within algTol (1 + |z|).
    const acceptedSolution = (zb: number[], dz: number[] | null): boolean => {
      const fb = evaluateF(zb);
      if (!finite(fb)) return false;
      if (!zb.every((zi, i) => Math.abs(zi - fb[i]) <= algTol * (1 + Math.abs(zi)) + 64 * EPS * Math.max(Math.abs(zi), Math.abs(fb[i])))) return false;
      return !(dz && relNorm(dz, zb) > algTol);
    };
    // Error left after a correction of size `corr` when the previous correction was `before` (both scaled): for a contraction
    // by r = corr / before it is about corr r / (1 - r) (a multiple root converges at r near 1 and a small correction there
    // still leaves a large error); a correction at rounding level (about 50 ulp) is the floor of double precision.
    const errorAfter = (corr: number, before: number): number => {
      if (corr <= 1e-14) return 0;
      const r = corr / before;
      return r < 1 ? (corr * r) / (1 - r) : Infinity;
    };
    const finalize = (zf: number[]) => {
      evaluateF(zf);
      setZ(zf);
    };

    // NLEQ-ERR: lambda = 1; J dz = -g; a step lambda dz is accepted when the simplified Newton correction at the trial point,
    // J(z)^-1 g(z + lambda dz), is smaller than dz: |dz_bar| <= (1 - lambda / 4) |dz| (natural monotonicity, scaled norm,
    // affine invariant, needs no merit |g|, which stagnates on the way to a far root). lambda is predicted from the last
    // accepted step (mu'), reduced by lambda = min(lambda / 2, mu) on rejection, grown by at most 4 after an accepted step.
    const nleqErr = (zStart: number[]): { converged: boolean; z: number[] } => {
      let z = zStart.slice();
      let lambda = 1;
      let last: { lambda: number; dz: number[]; dzAbs: number; rate: number | null; dbar: number[] } | null = null;
      for (let iterations = 0; iterations < maxIter; iterations++) {
        const f = evaluateF(z);
        if (!finite(f)) return { converged: false, z };
        const g = residualOf(z, f);
        if (absNorm(g) === 0) return { converged: true, z };
        const w = z.map(v => 1 + Math.abs(v));
        const jac = jacobianOf(z, f);
        let J = jac ? jac.J : null;
        let dz = J ? solveScaled(J, g.map(v => -v), w) : null;
        if (!dz && jac) { J = jac.raw; dz = solveScaled(J, g.map(v => -v), w); }
        let regularised = false;
        if (!J || !dz) {
          // Rank-deficient Jacobian: a regularised least-squares step, always damped, never applied in full.
          dz = J ? dampedDirection(J, g) : null;
          if (!dz) return { converged: false, z }; // zero Jacobian: a stationary point of |g|
          regularised = true;
        }
        const dzNorm = relNorm(dz, z);
        if (dzNorm === 0) return { converged: false, z };
        // Solution test on consecutive full Newton steps: the error left after the step dz contracting by r = |dz| / |dz_prev| is
        // about |dz| r / (1 - r) (r taken as the larger of the last two ratios) and must be within algTol (1 + |z|), at a near-root of g.
        // This is what resolves a multiple root, where Newton converges linearly and a small correction leaves a large error.
        const rate: number | null = !regularised && last && last.lambda === 1 && last.dzAbs > 0 ? absNorm(dz) / last.dzAbs : null;
        const atFloor = !regularised && dzNorm <= 1e-14; // a correction at rounding level (about 50 ulp) cannot shrink further
        if ((atFloor || (rate !== null && rate < 1)) && absNorm(dz) <= 1e9 * absNorm(g)) {
          const rEff = Math.max(rate ?? 0, last?.rate ?? 0);
          const err = atFloor ? 0 : rEff < 1 ? (dzNorm * rEff) / (1 - rEff) : Infinity;
          const zc = z.map((v, i) => v + dz![i]);
          if (err <= algTol && acceptedSolution(zc, null)) return { converged: true, z: zc };
          // Below the rounding noise of F (scaled residual under 1e-9) the measured steps are noise and the residual cannot
          // confirm a multiple root any more: the Aitken limit of the geometric tail is then accepted when the drift of the
          // measured rate, its uncertainty, is within algTol.
          const resolved = g.some((gi, i) => Math.abs(gi) / Math.max(1, Math.abs(z[i]), Math.abs(f[i])) > 1e-9);
          if (!resolved && rate !== null) {
            const ua = (dzNorm * Math.abs(rate - (last!.rate ?? 0))) / ((1 - rate) * (1 - rate));
            const za = z.map((v, i) => v + dz![i] / (1 - rate));
            if (ua <= algTol && acceptedSolution(za, null)) return { converged: true, z: za };
          }
        }

        if (last && !regularised) {
          const den = relNorm(last.dbar.map((v, i) => v - dz![i]), z);
          const noise = 64 * EPS * (relNorm(last.dbar, z) + dzNorm);
          // below the rounding noise of the difference mu' is noise: only the growth limit (factor 4) then applies
          const mu = den > noise ? (last.lambda * relNorm(last.dz, z) * relNorm(last.dbar, z)) / (den * dzNorm) : Infinity;
          lambda = Math.min(1, 4 * last.lambda, Math.max(mu, last.lambda / 10));
        } else lambda = regularised ? Math.min(lambda, 0.5) : 1;

        let accepted = false;
        const last0 = last, z0Iter = z; // the previous step and the iterate this step starts from
        for (let tries = 0; tries < 4000; tries++) {
          // a step that no longer moves the iterate (below double precision) cannot be damped further
          if (lambda * dzNorm < EPS) break;
          const trial = z.map((v, i) => v + lambda * dz![i]);
          const ft = evaluateF(trial);
          if (!finite(ft)) { lambda /= 2; continue; }
          const zb = J ? solveScaled(J, residualOf(trial, ft), w) : null;
          if (!zb) { lambda /= 2; continue; }
          const dbar = relNorm(zb, z);
          // componentwise rounding error of g(trial): eps (|trial| + |F|); its image under J^-1 is the noise of zb
          const zbNoise = correctionNoise(J!, w, trial.map((v, i) => EPS * (Math.abs(v) + Math.abs(ft[i]))));
          const noise = zbNoise ? relNorm(zbNoise, z) : 0;
          const denom = relNorm(zb.map((v, i) => v + (1 - lambda) * dz![i]), z);
          const mu = denom > 8 * noise + 64 * EPS * (dbar + dzNorm) ? (lambda * lambda * dzNorm) / (2 * denom) : Infinity;
          // the comparison is allowed the rounding noise of the two corrections (it cannot be told from rounding below it)
          if (dbar <= (1 - lambda / 4) * dzNorm + 8 * noise + 64 * EPS * (dbar + dzNorm)) {
            accepted = true;
            z = trial;
            last = regularised ? null : { lambda, dz, dzAbs: absNorm(dz), rate, dbar: zb.map(v => -v) };
            // after a full step the remaining error is estimated by the simplified correction; confirmed by the solution test
            // A simplified correction shrinks faster than the Newton steps at a multiple root, so where the previous step
            // was a full Newton step too, their ratio must also show a contraction.
            const rateOk = !(last0 && last0.lambda === 1) || errorAfter(dzNorm, relNorm(last0.dz, z0Iter)) <= algTol;
            if (lambda === 1 && dbar <= algTol && errorAfter(dbar, dzNorm) <= algTol && rateOk) {
              const zc = z.map((v, i) => v - zb[i]);
              const corr = solveScaled(J!, residualOf(zc, evaluateF(zc)), w);
              if (acceptedSolution(zc, corr ? corr.map(v => -v) : null)) return { converged: true, z: zc };
            }
            break;
          }
          lambda = Math.min(lambda / 2, mu);
        }
        if (!accepted) return { converged: false, z }; // no damping factor above the rounding floor
      }
      return { converged: false, z }; // maxIter iterations did not reach algTol on the solution
    };

    // Warm-up Gauss-Seidel passes (XBV-439, D25). No point leaves the passes without the acceptance of the main solver:
    // only a clear contraction of EVERY moving component is accepted from the rate estimate (q_i <= Q_MAX per component,
    // on two consecutive passes for the fast path, on the last pass for a rounding-level candidate; error estimate per
    // component within algTol). The max-norm rate is meaningless while other loop values settle faster (the change then falls
    // although one value keeps drifting at rate 1). Every other settled candidate (pass 0, change 0, a component with q_i > Q_MAX
    // or unknown) must pass acceptedSolution (residual AND Newton correction) at that point; if it does not, Newton restarts from `start`.
    const Q_MAX = 0.5;
    const verifiedCandidate = (exactSweep: boolean): boolean => {
      // An unchanged sweep over blocks that all really execute (no held sampled-output cache) already evaluated F at z and
      // returned z exactly: nothing more to evaluate.
      if (exactSweep && !this.cycleBlocks.some(b => this.sampleTimeOf(b) > 0)) return true;
      const zb = getZ();
      const fb = evaluateF(zb);
      if (!finite(fb)) return false;
      // A sweep that changed nothing and a loop function that returns every iterate exactly: g(z) = 0 exactly, so the Newton
      // correction -J^-1 g is exactly 0 and needs no Jacobian (a Jacobian per solve costs 4n+1 loop evaluations).
      if (exactSweep && zb.every((zi, i) => zi === fb[i])) return true;
      const jac = jacobianOf(zb, fb);
      if (!jac) return false;
      const w = zb.map(v => 1 + Math.abs(v));
      const rhs = residualOf(zb, fb).map(v => -v);
      const dz = solveScaled(jac.J, rhs, w) ?? solveScaled(jac.raw, rhs, w);
      if (!dz) return false; // a singular Jacobian cannot confirm the correction: leave it to NLEQ-ERR
      return acceptedSolution(zb, dz);
    };
    const restore = (values: any[]) => allKeys.forEach((lk, i) => this.signalValues.set(`${lk.blockId}.${lk.portId}`, values[i]));
    // Scaled change of every numeric leaf of the loop values (0 for an unchanged leaf; Infinity where the earlier value was not
    // a number). The rate is judged PER COMPONENT: the max-norm change is dominated by the part that settles fastest, so a value
    // that drifts at rate 1 next to one that contracts quickly would look like a contraction (D25, second amendment).
    const leafChanges = (a: any[], b: any[]): number[] => {
      const out: number[] = [];
      const visit = (x: any, y: any) => {
        if (typeof x === 'number') out.push(typeof y !== 'number' ? Infinity : x === y ? 0 : Math.abs(x - y) / (1 + Math.abs(y)));
        else if (Array.isArray(x)) x.forEach((v, i) => visit(v, Array.isArray(y) ? y[i] : undefined));
        else if (x && typeof x === 'object') Object.keys(x).forEach(k => visit(x[k], y && typeof y === 'object' ? y[k] : undefined));
      };
      a.forEach((v, i) => visit(v, b[i]));
      return out;
    };
    // true when every component that moved this pass contracts with q_i = ch_i / prevCh_i <= Q_MAX and an error estimate
    // ch_i q_i / (1 - q_i) within algTol; a component that moved with no earlier movement (prevCh_i = 0) or no earlier pass is unknown.
    const contractsPerComponent = (ch: number[], prevCh: number[] | null): boolean => {
      if (!prevCh || prevCh.length !== ch.length) return false;
      for (let i = 0; i < ch.length; i++) {
        if (ch[i] === 0) continue;
        if (!(prevCh[i] > 0)) return false;
        const qi = ch[i] / prevCh[i];
        if (!(qi <= Q_MAX) || (ch[i] * qi) / (1 - qi) > algTol) return false;
      }
      return true;
    };
    let prevChange = Infinity;
    let prevCh: number[] | null = null;
    let prevContracts = false;
    const MAX_DEFERRALS = 3;
    let deferrals = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
      this.cycleBlocks.forEach(b => this.executeBlockOrCache(b, time, tempStates));
      const cur = snapshot();
      // A diverged sweep (Infinity / NaN) is never a settled loop: Newton restarts from the pre-sweep values.
      if (!cur.every(isFiniteValue)) break;
      const change = sweepChange(cur, prev);
      // Judge the solution, not the residual: for sweeps contracting by q the error left after this sweep is about
      // change * q / (1 - q). A sweep that does not contract (q >= 1) is not settled unless the change is at rounding level.
      const q = change / prevChange;
      const solutionError = q < 1 ? (change * q) / (1 - q) : Infinity;
      const settled = cur.every((v, i) => settledValue(v, prev[i]))
        && (change === 0 || (pass >= 1 && change <= prevChange && (solutionError <= algTol || change <= 1e-14)));
      // an unchanged sweep needs no per-component rates (it is never a contraction candidate; [] reads as unknown)
      const ch = change > 0 ? leafChanges(cur, prev) : [];
      const contractsNow = change > 0 && contractsPerComponent(ch, prevCh);
      const fast = settled && change > 0 && pass >= 2 && contractsNow && prevContracts;
      prev = cur;
      prevChange = change;
      prevCh = ch;
      prevContracts = contractsNow;
      if (fast) return;
      // A clear contraction seen once (pass 1) has no second measurement yet: one more pass decides between fast path and check.
      const awaitingSecondQ = settled && change > 0 && pass === 1 && contractsNow;
      if (settled && !awaitingSecondQ) {
        // Every moving component contracts on the last pass (q_i <= Q_MAX): no Jacobian verification. A drift without a root
        // has q_i near 1 in its own component and still goes to the check; so do pass 0, change 0 and an unknown component.
        const contracting = pass >= 1 && change > 0 && contractsNow;
        if (contracting) { restore(cur); return; }
        // A candidate that does not yet prove a contraction in every component (coupled values still settling) gets a few more
        // cheap sweeps before it pays the Jacobian of the check; a drift without a root stays non-contracting and is checked.
        if (change > 0 && deferrals < MAX_DEFERRALS && pass + 1 < maxPasses) { deferrals++; continue; }
        if (verifiedCandidate(change === 0)) { restore(cur); return; }
        break;
      }
    }

    // Gauss-Seidel did not settle (it may be diverging) or its candidate failed the check: restart Newton from the pre-sweep values.
    restore(start);
    if (n === 0) return;

    const z0 = getZ();
    const res = nleqErr(z0);
    if (res.converged) { finalize(res.z); return; }

    // maxIter steps did not reach algTol on the solution.
    reportNotConverged();
    setZ(finite(res.z) ? res.z : z0);
  }

  /** Final major step at the stop time (outputs, then the logging/discrete update), as the live path does; no integration. */
  public finishAtStopTime(stopTime: number) {
    this.computeOutputs(stopTime);
    if (!this.fatal) this.updateDiscreteStates(stopTime);
  }

  public computeOutputs(time: number, tempStates?: Map<string, any>) {
    if (!this.compiled) this.compile();

    // 1. Run sorted upstream blocks
    for (const block of this.sortedBlocks) {
      this.executeBlockOrCache(block, time, tempStates);
    }

    // 2. Solve algebraic loops
    if (this.cycleBlocks.length > 0 && this.loopOptionProblem() === null) {
      const algTol = this.options?.algTol ?? 1e-6;
      const maxIter = this.options?.maxIter ?? 100;
      this.solveAlgebraicLoop(time, tempStates, algTol, maxIter);
    }

    // 3. Run downstream blocks
    for (const block of this.downstreamBlocks) {
      this.executeBlockOrCache(block, time, tempStates);
    }
  }

  public computeDerivatives(time: number, tempStates?: Map<string, any>): Map<string, any> {
    const derivatives = new Map<string, any>();
    for (const block of this.executionOrder) {
      if (this.fatal) break;
      if (block.evaluateDerivatives) {
        const inputValues = this.gatherInputs(block);
        const currentState = tempStates?.has(block.id) ? tempStates.get(block.id) : block.state;
        try {
          const dx = block.evaluateDerivatives(inputValues, block.params, currentState, time, this.contextOf(block, tempStates !== undefined));
          this.checkNumericalStability(block, dx, 'Derivative');
          // A scalar initial condition on a vector input is expanded over the derivative's shape (Simulink).
          if (!tempStates) {
            const conformed = XbridgesEngine.conformState(block.state, dx);
            if (conformed !== block.state) block.state = conformed;
          }
          derivatives.set(block.id, dx);
        } catch (err: any) {
          this.reportBlockException(block, 'computing its derivatives', err);
        }
      }
    }
    return derivatives;
  }

  /** Returns `state` with scalar leaves expanded to the shape of the matching derivative leaves (same object when nothing changes). */
  private static conformState(state: any, dx: any): any {
    if (typeof state === 'number' && Array.isArray(dx)) {
      const expand = (d: any): any => (Array.isArray(d) ? d.map(expand) : state);
      return expand(dx);
    }
    if (state !== null && typeof state === 'object' && !Array.isArray(state) && dx !== null && typeof dx === 'object' && !Array.isArray(dx)) {
      let out: any = state;
      for (const k of Object.keys(dx)) {
        if (!(k in state)) continue;
        const c = XbridgesEngine.conformState(state[k], dx[k]);
        if (c !== state[k]) { if (out === state) out = { ...state }; out[k] = c; }
      }
      return out;
    }
    return state;
  }

  private hybridUpdates = new Map<string, { time: number; state: any }>();

  public updateDiscreteStates(time: number) {
    for (const block of this.executionOrder) {
      if (this.fatal) break;
      if (block.evaluateDerivatives && block.updateDiscrete) {
        // Hybrid block: once per major step. A retried step at the same time with the same committed state is skipped;
        // after a rollback the state object differs, so the update is applied again.
        const last = this.hybridUpdates.get(block.id);
        if (last && last.time === time && last.state === block.state) continue;
        try {
          const next = block.updateDiscrete(this.gatherInputs(block), block.params, block.state, time);
          if (next !== undefined) block.state = next;
        } catch (err: any) { this.reportBlockException(block, 'updating its discrete states', err); }
        this.hybridUpdates.set(block.id, { time, state: block.state });
        continue;
      }
      if (block.evaluateDerivatives && block.projectsState) {
        try {
          const r = block.execute(this.gatherInputs(block), block.params, block.state, time);
          if (r.nextState !== undefined) block.state = r.nextState;
        } catch (err: any) { this.reportBlockException(block, 'projecting its state', err); }
        continue;
      }
      if (!block.evaluateDerivatives) {
        const ts = this.sampleTimeOf(block);
        if (ts > 0) {
          const nextTime = block.nextTick ?? this.nextSampleTime.get(block.id) ?? 0;
          if (time >= nextTime - hitTolerance(time)) {
            const inputValues = this.gatherInputs(block);
            try {
              const result = block.execute(inputValues, block.params, block.state, time);
              if (result.nextState !== undefined) {
                 block.state = result.nextState;
              }
              // Integer-tick schedule: hit n happens at t = n*Ts (never a running sum, which drifts past the tolerance).
              const hitIndex = (block.hitIndex ?? Math.round(nextTime / ts)) + 1;
              block.hitIndex = hitIndex;
              const nextScheduled = hitIndex * ts;
              block.nextTick = nextScheduled;
              this.nextSampleTime.set(block.id, nextScheduled);
            } catch (err: any) { this.reportBlockException(block, "updating its discrete states", err); }
          }
        } else {
          const inputValues = this.gatherInputs(block);
          try {
            const result = block.execute(inputValues, block.params, block.state, time);
            if (result.nextState !== undefined) {
               block.state = result.nextState;
            }
          } catch (err: any) { this.reportBlockException(block, "updating its discrete states", err); }
        }
      }
    }
  }

  public getZeroCrossings(time: number, tempStates?: Map<string, any>): Map<string, number[]> {
    const zcValues = new Map<string, number[]>();
    for (const block of this.executionOrder) {
      if (block.ZeroCrossingFn) {
        const inputValues = this.gatherInputs(block);
        const currentState = tempStates?.has(block.id) ? tempStates.get(block.id) : block.state;
        try {
          const val = block.ZeroCrossingFn(inputValues, block.params, currentState, time);
          zcValues.set(block.id, val);
        } catch (err) {}
      }
    }
    return zcValues;
  }

  /** True when a block schedules events in time (nextEventTime). */
  public hasScheduledEvents(): boolean {
    return this.executionOrder.some(b => typeof b.nextEventTime === 'function');
  }

  /**
   * True when one block's own consecutive scheduled events after `time` are closer than `hMin` (a minimum-step violation: the
   * solver cannot resolve that block). Events of different blocks may be as close as they like.
   */
  public ownScheduledEventsCloserThan(time: number, hHalfWidth: (t: number) => number, hMin: number): boolean {
    for (const block of this.executionOrder) {
      if (typeof block.nextEventTime !== 'function') continue;
      try {
        const a = block.nextEventTime(block.params, block.state, time);
        if (a === undefined || !Number.isFinite(a) || !(a > time)) continue;
        const b = block.nextEventTime(block.params, block.state, a + 2 * hHalfWidth(a));
        if (b !== undefined && Number.isFinite(b) && b - a < hMin) return true;
      } catch (err) { /* reported by the block itself */ }
    }
    return false;
  }

  /** The earliest scheduled event of any block after `time` (undefined: none). */
  public nextScheduledEvent(time: number): number | undefined {
    let best: number | undefined;
    for (const block of this.executionOrder) {
      if (typeof block.nextEventTime !== 'function') continue;
      try {
        const d = block.nextEventTime(block.params, block.state, time);
        if (d !== undefined && Number.isFinite(d) && d > time && (best === undefined || d < best)) best = d;
      } catch (err) { /* a block with invalid parameters reports its own error when it executes */ }
    }
    return best;
  }

  public hasZeroCrossingSignChange(zcPrev: Map<string, number[]>, zcCurr: Map<string, number[]>): boolean {
    for (const [blockId, prevVals] of zcPrev.entries()) {
      const currVals = zcCurr.get(blockId);
      if (currVals) {
        for (let i = 0; i < prevVals.length; i++) {
          if (prevVals[i] * currVals[i] < 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public commitStateUpdates(nextStates: Map<string, any>) {
    for (const block of this.executionOrder) {
      if (nextStates.has(block.id)) {
        block.state = nextStates.get(block.id);
      }
    }
  }

  public step(time: number, dt: number) {
    this.computeOutputs(time);
    this.updateDiscreteStates(time);
  }

  public getSignalValue(blockId: string, portId: string): any {
    const key = `${blockId}.${portId}`;
    if (this.signalValues.has(key)) {
      return this.signalValues.get(key);
    }
    // If it's an input port, try to find what's connected to it
    const conn = this.inputIndex.get(`${blockId}\u0000${portId}`);
    if (conn) {
      return this.signalValues.get(`${conn.sourceBlock}.${conn.sourcePort}`);
    }
    // Fallback to static value
    const block = this.blockMap.get(blockId);
    const inPort = block?.inputs.find(i => i.id === portId);
    return inPort ? inPort.value : undefined;
  }

  public setSignalValue(blockId: string, portId: string, value: any) {
    this.signalValues.set(`${blockId}.${portId}`, value);
  }

  public getBlock(blockId: string): XBlock | undefined {
    return this.blockMap.get(blockId);
  }

  public patchBlockParams(blockId: string, newParams: Record<string, any>) {
    const block = this.blockMap.get(blockId);
    if (!block) return;

    // Detect if we need to re-seed state.
    // The keys are: initialCondition, initW1, initW2, initBias, alpha, gamma, epsilon, numStates, numActions, etc.
    const reseedKeys = [
      'initialCondition', 'initW1', 'initW2', 'initBias', 'alpha', 'gamma', 'epsilon', 
      'numStates', 'numActions', 'numerator', 'denominator', 'zeros', 'poles', 'gain'
    ];
    let needsReseed = false;
    for (const key of reseedKeys) {
      if (newParams[key] !== undefined && JSON.stringify(newParams[key]) !== JSON.stringify(block.params[key])) {
        needsReseed = true;
      }
    }

    // Merge parameters
    block.params = { ...block.params, ...newParams };

    // Sync block outputs and inputs with BLOCK_LIBRARY to handle changes in data type / sizes immediately
    if (BLOCK_LIBRARY[block.type]) {
      try {
        const fresh = BLOCK_LIBRARY[block.type](block.id, block.params);
        block.outputs = fresh.outputs;
        block.inputs = fresh.inputs;
      } catch (e) {
        console.error(`Failed to refresh ports for block ${blockId}:`, e);
      }
    }

    // Sync input port default values with params if they share the same key
    if (block.inputs) {
      block.inputs = block.inputs.map(inPort => {
        if (newParams[inPort.id] !== undefined) {
          return { ...inPort, value: newParams[inPort.id] };
        }
        return inPort;
      });
    }

    if (needsReseed) {
      // Re-seed state and re-generate parameters (e.g. state-space matrices A, B, C, D) from BLOCK_LIBRARY
      try {
        if (BLOCK_LIBRARY[block.type]) {
          const freshBlock = BLOCK_LIBRARY[block.type](block.id, block.params);
          block.state = freshBlock.state;
          block.params = { ...block.params, ...freshBlock.params };
        }
      } catch (e) {
        console.error(`Failed to re-seed state for block ${blockId}:`, e);
      }
    }
  }
}

