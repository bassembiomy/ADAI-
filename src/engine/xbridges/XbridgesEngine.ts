// src/engine/xbridges/XbridgesEngine.ts
import { XModel, XBlock, ModelDiagnostic, SolverOptions } from './types';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { VectorUtils } from './VectorUtils';
import * as math from 'mathjs';

export class XbridgesEngine {
  private model: XModel;
  public executionOrder: XBlock[] = [];
  public compiled = false;
  private blockMap = new Map<string, XBlock>();
  private signalValues = new Map<string, any>(); // key: "blockId.portId"
  public diagnostics: ModelDiagnostic[] = [];
  public options: SolverOptions | null = null;

  private sortedBlocks: XBlock[] = [];
  private cycleBlocks: XBlock[] = [];
  private downstreamBlocks: XBlock[] = [];
  private nextSampleTime = new Map<string, number>();
  private lastOutputs = new Map<string, any[]>();

  constructor(model: XModel) {
    this.model = model;
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
        }
      }
      this.blockMap.set(b.id, b);
    });
  }

  private flatBlocks: XBlock[] = [];
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
      if (outPort.unit && inPort.unit && outPort.unit !== inPort.unit) {
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
          severity: 'warning',
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
            severity: 'warning',
            code: 'DIMENSION_MISMATCH',
            message: `Dimension mismatch: Port '${outPort.name}' on block '${sourceBlock.label || sourceBlock.type}' with dimensions [${dim1}] connected to port '${inPort.name}' on block '${targetBlock.label || targetBlock.type}' expecting [${dim2}].`,
            blockIds: [sourceBlock.id, targetBlock.id]
          });
        }
      }
    });
  }

  public compile(startTime = 0): ModelDiagnostic[] {
    this.diagnostics = [];
    this.flatten();
    this.validateConnections();
    
    // 1. Build adjacency list for Topological Sort
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    this.flatBlocks.forEach(b => {
      adjList.set(b.id, []);
      inDegree.set(b.id, 0);
    });

    this.flatConnections.forEach(conn => {
      const sourceBlock = this.blockMap.get(conn.sourceBlock);
      const targetBlock = this.blockMap.get(conn.targetBlock);
      
      if (sourceBlock && targetBlock && adjList.has(conn.sourceBlock) && adjList.has(conn.targetBlock)) {
        adjList.get(conn.sourceBlock)!.push(conn.targetBlock);
        if (!sourceBlock.isStateful) {
          inDegree.set(conn.targetBlock, inDegree.get(conn.targetBlock)! + 1);
        }
      }
    });

    // 2. Kahn's Algorithm
    const queue: string[] = [];
    inDegree.forEach((degree, blockId) => {
      if (degree === 0) queue.push(blockId);
    });

    const sortedBlocks: XBlock[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      const block = this.blockMap.get(u)!;
      sortedBlocks.push(block);

      adjList.get(u)!.forEach(v => {
        if (!block.isStateful) {
          inDegree.set(v, inDegree.get(v)! - 1);
          if (inDegree.get(v) === 0) queue.push(v);
        }
      });
    }

    const missing = this.flatBlocks.filter(b => !sortedBlocks.includes(b));
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
          
          const outputs = this.flatConnections.filter(c => c.sourceBlock === curr);
          outputs.forEach(c => {
            q.push(c.targetBlock);
          });
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

    this.sortedBlocks = sortedBlocks;
    this.cycleBlocks = cycleBlocks;
    this.downstreamBlocks = downstreamBlocks;
    this.executionOrder = [...sortedBlocks, ...cycleBlocks, ...downstreamBlocks];

    // 3. Initialize signal map, sample times, and ZOH caches
    this.nextSampleTime.clear();
    this.lastOutputs.clear();
    this.flatBlocks.forEach(b => {
      b.outputs.forEach(out => {
        this.signalValues.set(`${b.id}.${out.id}`, out.value);
      });
      const ts = Number(b.params.sampleTime);
      if (ts > 0) {
        b.nextTick = startTime;
        this.nextSampleTime.set(b.id, startTime);
        this.lastOutputs.set(b.id, b.outputs.map(out => out.value));
      }
    });

    this.compiled = true;
    return this.diagnostics;
  }

  public gatherInputs(block: XBlock): any[] {
    return block.inputs.map(inPort => {
      const conn = this.flatConnections.find(c => c.targetBlock === block.id && c.targetPort === inPort.id);
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

  private executeBlockOrCache(block: XBlock, time: number, tempStates?: Map<string, any>) {
    const ts = Number(block.params.sampleTime);
    if (ts > 0) {
      const nextTime = block.nextTick ?? this.nextSampleTime.get(block.id) ?? 0;
      if (time < nextTime - 1e-9) {
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
      const result = block.execute(inputValues, block.params, currentState, time);
      result.outputs.forEach((val, i) => {
        this.checkNumericalStability(block, val, `Output[${i}]`);
      });

      block.outputs.forEach((outPort, i) => {
        this.signalValues.set(`${block.id}.${outPort.id}`, result.outputs[i]);
      });

      if (ts > 0) {
        this.lastOutputs.set(block.id, [...result.outputs]);
      }
    } catch (err: any) {
       console.error(`Error executing block ${block.label || block.type}: ${err.message}`);
    }
  }

  private solveAlgebraicLoop(time: number, tempStates?: Map<string, any>, algTol = 1e-6, maxIter = 100) {
    const loopKeys: { blockId: string; portId: string; block: XBlock; portIndex: number }[] = [];
    this.cycleBlocks.forEach(b => {
      b.outputs.forEach((out, idx) => {
        loopKeys.push({ blockId: b.id, portId: out.id, block: b, portIndex: idx });
      });
    });

    const n = loopKeys.length;
    if (n === 0) return;

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
          const result = block.execute(inputValues, block.params, currentState, time);
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
        z = z.map((zi, i) => zi + (dZ[i] || 0));
      } catch (err) {
        z = z.map((zi, i) => zi - 0.1 * g[i]);
      }
    }

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
      if (block.evaluateDerivatives) {
        const inputValues = this.gatherInputs(block);
        const currentState = tempStates?.has(block.id) ? tempStates.get(block.id) : block.state;
        try {
          const dx = block.evaluateDerivatives(inputValues, block.params, currentState, time);
          this.checkNumericalStability(block, dx, 'Derivative');
          derivatives.set(block.id, dx);
        } catch (err: any) {
          console.error(`Error computing derivative for ${block.label || block.type}: ${err.message}`);
        }
      }
    }
    return derivatives;
  }

  public updateDiscreteStates(time: number) {
    for (const block of this.executionOrder) {
      if (!block.evaluateDerivatives) {
        const ts = Number(block.params.sampleTime);
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
            } catch (err: any) {}
          }
        } else {
          const inputValues = this.gatherInputs(block);
          try {
            const result = block.execute(inputValues, block.params, block.state, time);
            if (result.nextState !== undefined) {
               block.state = result.nextState;
            }
          } catch (err: any) {}
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
    const conn = this.flatConnections.find(c => c.targetBlock === blockId && c.targetPort === portId);
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

