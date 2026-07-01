// src/engine/xbridges/XbridgesEngine.ts
import { XModel, XBlock, ModelDiagnostic } from './types';
import { BLOCK_LIBRARY } from './BlockDefinitions';

export class XbridgesEngine {
  private model: XModel;
  private executionOrder: XBlock[] = [];
  private compiled = false;
  private blockMap = new Map<string, XBlock>();
  private signalValues = new Map<string, any>(); // key: "blockId.portId"
  public diagnostics: ModelDiagnostic[] = [];

  constructor(model: XModel) {
    this.model = model;
    this.model.blocks.forEach(b => this.blockMap.set(b.id, b));
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

  public compile(): ModelDiagnostic[] {
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

    this.executionOrder = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      const block = this.blockMap.get(u)!;
      this.executionOrder.push(block);

      adjList.get(u)!.forEach(v => {
        if (!block.isStateful) {
          inDegree.set(v, inDegree.get(v)! - 1);
          if (inDegree.get(v) === 0) queue.push(v);
        }
      });
    }

    if (this.executionOrder.length !== this.flatBlocks.length) {
      const missing = this.flatBlocks.filter(b => !this.executionOrder.includes(b));
      const missingIds = missing.map(b => b.id);
      const missingLabels = missing.map(b => b.label || b.type).join(', ');
      this.diagnostics.push({
        severity: 'error',
        code: 'ALGEBRAIC_LOOP',
        message: `Algebraic loop detected involving blocks: ${missingLabels}. Try introducing a Unit Delay or Integrator to break the loop.`,
        blockIds: missingIds
      });
      missing.forEach(m => this.executionOrder.push(m));
    }

    // 3. Initialize signal map
    this.flatBlocks.forEach(b => {
      b.outputs.forEach(out => {
        this.signalValues.set(`${b.id}.${out.id}`, out.value);
      });
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

  public computeOutputs(time: number, tempStates?: Map<string, any>) {
    if (!this.compiled) this.compile();

    for (const block of this.executionOrder) {
      const inputValues = this.gatherInputs(block);
      const currentState = tempStates?.has(block.id) ? tempStates.get(block.id) : block.state;
      
      try {
        const result = block.execute(inputValues, block.params, currentState, time);
        block.outputs.forEach((outPort, i) => {
          this.signalValues.set(`${block.id}.${outPort.id}`, result.outputs[i]);
        });
      } catch (err: any) {
         console.error(`Error executing block ${block.label || block.type}: ${err.message}`);
      }
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
      // If block has evaluateDerivatives, its state is continuous and updated by the solver.
      // Otherwise, it's discrete and we update it here via execute().
      if (!block.evaluateDerivatives) {
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

  public commitStateUpdates(nextStates: Map<string, any>) {
    for (const block of this.executionOrder) {
      if (nextStates.has(block.id)) {
        block.state = nextStates.get(block.id);
      }
    }
  }

  // Compatibility or simple execution
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

