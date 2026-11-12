// src/engine/xbridges/XbridgesEngine.ts
import { XModel, XBlock, ModelDiagnostic, SolverOptions, BlockEvalContext } from './types';
import { BLOCK_LIBRARY, getPolynomialCoefficients, trimLeadingZeros } from './BlockDefinitions';
import { VectorUtils } from './VectorUtils';
import { runModelChecks, getBlockSampleTime, evaluateBlockParameters, parameterKindsOf, describeParameterProblem } from './modelChecks';
import { evaluateParameter } from './parameterEvaluation';
import * as math from 'mathjs';

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
    return this.diagnostics.some(d => d.severity === 'error' && d.code.startsWith('STIFF_SOLVER_'));
  }

  /** Mode of discontinuous blocks decided at the last major step (kept during minor steps). */
  private heldModes = new Map<string, any>();
  /** True while bracketZeroCrossing probes: those evaluations are treated as major steps. */
  private bracketing = false;
  private contextOf(block: XBlock, minor: boolean): BlockEvalContext {
    return {
      minor,
      mode: this.heldModes.get(block.id),
      setMode: (m: any) => { if (!minor) this.heldModes.set(block.id, m); },
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
  private lastOutputs = new Map<string, any[]>();

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

    this.model.blocks.forEach(b => {
      if (!b.execute) {
        const typeKey = Object.keys(BLOCK_LIBRARY).find(k => k.toLowerCase() === b.type.toLowerCase());
        if (typeKey) {
          const fresh = BLOCK_LIBRARY[typeKey](b.id, b.params || {});
          b.execute = fresh.execute;
          b.evaluateDerivatives = fresh.evaluateDerivatives;
          b.ZeroCrossingFn = fresh.ZeroCrossingFn;
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
      if (outPort.unit && inPort.unit && outPort.unit !== 'inherit' && inPort.unit !== 'inherit' && outPort.unit !== inPort.unit) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'UNIT_INCONSISTENCY',
          message: `Unit inconsistency: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' has unit '${outPort.unit}' but is connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' with unit '${inPort.unit}'.`,
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

  public compile(startTime = 0): ModelDiagnostic[] {
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
        const firstHit = Math.ceil(startTime / ts - 1e-9) * ts;
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
      if (time < nextTime - 1e-9 || tempStates) {
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
      const result = block.execute(inputValues, block.params, currentState, time, this.contextOf(block, tempStates !== undefined && !this.bracketing));
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
    if (!this.fatal && !(tempStates !== undefined && !this.bracketing)) {
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
    const snapshot = () => loopKeys.map(lk => this.signalValues.get(`${lk.blockId}.${lk.portId}`));
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
    let prev = snapshot();
    const start = prev;
    const maxPasses = this.options?.algMaxPasses ?? 50;
    for (let pass = 0; pass < maxPasses; pass++) {
      this.cycleBlocks.forEach(b => this.executeBlockOrCache(b, time, tempStates));
      const cur = snapshot();
      const settled = cur.every((v, i) => settledValue(v, prev[i]));
      prev = cur;
      if (settled) return;
    }

    // Gauss-Seidel did not settle (it may be diverging): restart Newton from the pre-sweep values.
    loopKeys.forEach((lk, i) => this.signalValues.set(`${lk.blockId}.${lk.portId}`, start[i]));

    // Newton operates on plain numeric outputs only; others are left untouched.
    const numericKeys = loopKeys.filter(lk => typeof this.signalValues.get(`${lk.blockId}.${lk.portId}`) === 'number');
    loopKeys.length = 0;
    loopKeys.push(...numericKeys);
    const n = loopKeys.length;
    if (n === 0) return;

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
          const result = block.execute(inputValues, block.params, currentState, time, this.contextOf(block, tempStates !== undefined && !this.bracketing));
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

    let z = getZ();
    const eps = 1e-6;

    for (let iter = 0; iter < maxIter; iter++) {
      const fz = evaluateF(z);
      const g = z.map((zi, i) => zi - fz[i]);
      const gNorm = Math.max(...g.map(Math.abs));

      if (gNorm < algTol) {
        setZ(z);
        return;
      }

      const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let j = 0; j < n; j++) {
        const zPerturbed = [...z];
        zPerturbed[j] += eps;
        const fzPerturbed = evaluateF(zPerturbed);
        for (let i = 0; i < n; i++) {
          const df_ij = (fzPerturbed[i] - fz[i]) / eps;
          J[i][j] = (i === j ? 1 : 0) - df_ij;
        }
      }

      try {
        const negG = g.map(val => -val);
        const deltaZ = math.lusolve(J, negG) as number[];
        const dZ = math.flatten(deltaZ) as number[];
        // A (near-)singular Jacobian gives an absurdly long step; take the damped step instead.
        const zScale = 1 + Math.max(...z.map(Math.abs));
        if (dZ.some(v => !Number.isFinite(v) || Math.abs(v) > 1e6 * zScale)) throw new Error('singular loop Jacobian');
        z = z.map((zi, i) => zi + (dZ[i] || 0));
      } catch (err) {
        z = z.map((zi, i) => zi - 0.1 * g[i]);
      }
      if (z.some(v => !Number.isFinite(v))) {
        reportNotConverged();
        return;
      }
    }

    // Final residual check: |F(z) - z| relative to 1 + |z|.
    const fFinal = evaluateF(z);
    const residual = Math.max(...z.map((zi, i) => Math.abs(fFinal[i] - zi) / (1 + Math.abs(zi))));
    if (!(residual <= algTol)) reportNotConverged();
    setZ(z);
  }

  public computeOutputs(time: number, tempStates?: Map<string, any>) {
    if (!this.compiled) this.compile();

    // 1. Run sorted upstream blocks
    for (const block of this.sortedBlocks) {
      this.executeBlockOrCache(block, time, tempStates);
    }

    // 2. Solve algebraic loops
    if (this.cycleBlocks.length > 0) {
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
          const dx = block.evaluateDerivatives(inputValues, block.params, currentState, time, this.contextOf(block, tempStates !== undefined && !this.bracketing));
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
          if (time >= nextTime - 1e-9) {
            const inputValues = this.gatherInputs(block);
            try {
              const result = block.execute(inputValues, block.params, block.state, time);
              if (result.nextState !== undefined) {
                 block.state = result.nextState;
              }
              const nextScheduled = nextTime + ts;
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

  public bracketZeroCrossing(
    tPrev: number,
    tCurr: number,
    statesPrev: Map<string, any>,
    statesCurr: Map<string, any>,
    zeroTol = 1e-6
  ): number {
    let tLow = tPrev;
    let tHigh = tCurr;
    
    const interpolateStates = (frac: number): Map<string, any> => {
      const inter = new Map<string, any>();
      statesPrev.forEach((sPrev, blockId) => {
        const sCurr = statesCurr.get(blockId);
        if (sCurr !== undefined) {
          inter.set(blockId, VectorUtils.integrateState(sPrev, VectorUtils.applyElementWise(sCurr, sPrev, 'subtract'), frac));
        } else {
          inter.set(blockId, sPrev);
        }
      });
      return inter;
    };

    const zcPrev = this.getZeroCrossings(tPrev, statesPrev);

    this.bracketing = true;
    try {
    for (let iter = 0; iter < 30; iter++) {
      if (tHigh - tLow < zeroTol) {
        break;
      }
      const tMid = (tLow + tHigh) / 2;
      const frac = (tMid - tPrev) / (tCurr - tPrev || 1e-9);
      const statesMid = interpolateStates(frac);
      
      this.computeOutputs(tMid, statesMid);
      const zcMid = this.getZeroCrossings(tMid, statesMid);
      
      if (this.hasZeroCrossingSignChange(zcPrev, zcMid)) {
        tHigh = tMid;
      } else {
        tLow = tMid;
      }
    }
    } finally { this.bracketing = false; }

    return tHigh;
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

