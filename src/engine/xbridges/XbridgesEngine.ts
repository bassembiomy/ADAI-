// src/engine/xbridges/XbridgesEngine.ts
import { XModel, XBlock } from './types';

export class XbridgesEngine {
  private model: XModel;
  private executionOrder: XBlock[] = [];
  private compiled = false;
  private blockMap = new Map<string, XBlock>();
  private signalValues = new Map<string, any>(); // key: "blockId.portId"

  constructor(model: XModel) {
    this.model = model;
    this.model.blocks.forEach(b => this.blockMap.set(b.id, b));
  }

  public compile() {
    // 1. Build adjacency list for Topological Sort
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    this.model.blocks.forEach(b => {
      adjList.set(b.id, []);
      inDegree.set(b.id, 0);
    });

    this.model.connections.forEach(conn => {
      // Directed edge from source to target
      if (adjList.has(conn.sourceBlock) && inDegree.has(conn.targetBlock)) {
        adjList.get(conn.sourceBlock)!.push(conn.targetBlock);
        inDegree.set(conn.targetBlock, inDegree.get(conn.targetBlock)! + 1);
      }
    });

    // 2. Kahn's Algorithm for Topological Sort
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
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      });
    }

    if (this.executionOrder.length !== this.model.blocks.length) {
      throw new Error("Algebraic loop detected in model topology.");
    }

    // 3. Initialize signal map
    this.model.blocks.forEach(b => {
      b.outputs.forEach(out => {
        this.signalValues.set(`${b.id}.${out.id}`, out.value);
      });
    });

    this.compiled = true;
  }

  public gatherInputs(block: XBlock): any[] {
    return block.inputs.map(inPort => {
      const conn = this.model.connections.find(c => c.targetBlock === block.id && c.targetPort === inPort.id);
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
    const conn = this.model.connections.find(c => c.targetBlock === blockId && c.targetPort === portId);
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
}
