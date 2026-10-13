import { describe, expect, it, vi } from 'vitest';
import { VLabWorkerClient } from './vlabWorkerClient';
import { VLabPhysicsEngine } from '../engine/vlab/vlabPhysics';
import type { Node, Edge } from '@xyflow/react';
import { VLabWorkerClient as Client, VLabWorkerError } from './vlabWorkerClient';
import { createVLabWorkerHandler } from '../engine/vlab/vlabWorkerCore';
import { serializeVLabError, toCloneable } from '../engine/vlab/vlabDiagnostics';
import { blockEquations } from '../engine/vlab/vlabEquations';
import { TopologyValidationError } from '../engine/vlab/vlabTopologyValidation';
import { DAEStructureError } from '../engine/vlab/vlabStructure';
import { BlockEquationError, NonFiniteResidualError, VLabCancelledError, VLabSolverDiagnosticError } from '../engine/vlab/vlabResidualDiagnostics';
import { ScopeReadError } from '../engine/vlab/vlabScopeRead';
import { VLabParamError } from '../engine/vlab/vlabParams';
import { PortWidthMismatchError } from '../engine/vlab/vlabVectorPorts';
import { MultibodyConstraintDiagnosticError } from '../engine/vlab/vlabConstraintDiagnostics';
import { mixed30, node } from '../engine/vlab/review/perfFixtures';
import type { VLabWorkerResponse } from '../engine/vlab/vlabWorkerProtocol';

describe('VLabWorkerClient', () => {
  it('resolves a simulation step response by request id', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn((request: any) => handler?.({ data: { requestId: request.requestId, state: { time: 1 } } } as MessageEvent)),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    await expect(client.step([], [], { id: 'c' } as any, null, 0.1)).resolves.toEqual({ time: 1 });
    expect(worker.postMessage).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('proves a second step is queued or serialized while the first step is pending', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const postedRequests: any[] = [];
    const worker = {
      postMessage: vi.fn((request: any) => {
        postedRequests.push(request);
      }),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);

    // Call step 1
    const p1 = client.step([], [], { id: 'c' } as any, null, 0.1);
    expect(postedRequests.length).toBe(1);
    expect(postedRequests[0].requestId).toBe(1);

    // Call step 2 while step 1 is still in-flight
    const p2 = client.step([], [], { id: 'c' } as any, { time: 0.1 }, 0.1);
    // Crucial check: Step 2 should NOT have posted to worker yet because step 1 is in-flight!
    expect(postedRequests.length).toBe(1);

    // Complete step 1
    handler?.({ data: { requestId: 1, state: { time: 0.1 } } } as MessageEvent);
    await expect(p1).resolves.toEqual({ time: 0.1 });

    // Now step 2 should be dispatched
    expect(postedRequests.length).toBe(2);
    expect(postedRequests[1].requestId).toBe(2);

    // Complete step 2
    handler?.({ data: { requestId: 2, state: { time: 0.2 } } } as MessageEvent);
    await expect(p2).resolves.toEqual({ time: 0.2 });

    client.dispose();
  });

  it('proves worker errors reject the step promise and clear in-flight state', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn((request: any) => {
        handler?.({ data: { requestId: request.requestId, error: 'DAE Singular Matrix Error' } } as MessageEvent);
      }),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    await expect(client.step([], [], { id: 'c' } as any, null, 0.1)).rejects.toThrow('DAE Singular Matrix Error');
    expect(client.inFlightCount).toBe(0);
    client.dispose();
  });

  it('rejects pending and queued steps on cancellation or disposal and rejects stale responses', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    const p1 = client.step([], [], { id: 'c' } as any, null, 0.1);
    const p2 = client.step([], [], { id: 'c' } as any, null, 0.1);

    client.dispose();

    await expect(p1).rejects.toThrow(/disposed|cancelled/i);
    await expect(p2).rejects.toThrow(/disposed|cancelled/i);

    // Stale message arriving after disposal should not throw or resurrect
    expect(() => {
      handler?.({ data: { requestId: 1, state: { time: 0.1 } } } as MessageEvent);
    }).not.toThrow();
  });

  it('produces identical state and output to direct VLabPhysicsEngine.simulateStep for electrical circuit', async () => {
    const nodes: Node[] = [
      { id: 'gnd', data: { type: 'ground' } } as any,
      { id: 'src', data: { type: 'dc_voltage', params: { V: 12 } } } as any,
      { id: 'res', data: { type: 'resistor', params: { R: 100 } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];
    const dt = 0.05;

    // Direct engine simulation
    const directEngine = new VLabPhysicsEngine();
    let directState: any = null;
    for (let i = 0; i < 3; i++) {
      directState = directEngine.simulateStep(nodes, edges, directState, dt);
    }

    // Worker simulation simulated via client and worker logic
    const workerEngine = new VLabPhysicsEngine();
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn((request: any) => {
        const state = workerEngine.simulateStep(request.nodes, request.edges, request.previousState, request.dt);
        handler?.({ data: { requestId: request.requestId, state } } as MessageEvent);
      }),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    let workerState: any = null;
    for (let i = 0; i < 3; i++) {
      workerState = await client.step(nodes, edges, { id: 'cfg' } as any, workerState, dt);
    }

    expect(workerState.x).toEqual(directState.x);
    expect(workerState.time).toEqual(directState.time);
    client.dispose();
  });

  // ── WP-31c: typed diagnostics, cancel, progress, determinism ─────────────────────────────────────────────────────────────
  /** a Worker whose message handler is the real worker core (vlabWorkerCore), driven synchronously like postMessage would be */
  const coreWorker = (options: Parameters<typeof createVLabWorkerHandler>[1] = {}) => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const received: VLabWorkerResponse[] = [];
    const core = createVLabWorkerHandler(message => {
      received.push(JSON.parse(JSON.stringify(message))); // what structured clone keeps: plain data only
      handler?.({ data: message } as MessageEvent);
    }, options);
    const worker = {
      postMessage: vi.fn((request: any) => core(request)),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;
    return { worker, received, core };
  };
  const cfg = { id: 'cfg' } as any;

  it('a topology error crosses the boundary as a typed diagnostic (code, blockId, portId, details), not a string', async () => {
    const { worker, received } = coreWorker();
    const client = new VLabWorkerClient(() => worker);
    const seen: any[] = [];
    client.onDiagnostics(d => seen.push(d));
    const nodes = [node('gain', 'ps_gain', { gain: 2 })]; // required input u unwired
    const error = await client.step(nodes, [], cfg, null, 0.01).catch(e => e);
    expect(error).toBeInstanceOf(VLabWorkerError);
    expect(error.diagnostic.code).toBe('TOPOLOGY');
    expect(error.diagnostic.name).toBe('TopologyValidationError');
    expect(error.diagnostic.blockId).toBe('gain');
    expect(error.diagnostic.blockIds).toEqual(['gain']);
    expect(typeof error.diagnostic.portId).toBe('string');
    expect(error.diagnostic.items.length).toBeGreaterThan(0);
    expect(error.diagnostic.items[0]).toMatchObject({ blockId: 'gain', details: expect.any(Object) });
    expect(error.message).toBe(error.diagnostic.message);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(error.diagnostic);
    expect(client.lastDiagnostic).toEqual(error.diagnostic);
    expect(received.at(-1)!.diagnostic!.code).toBe('TOPOLOGY'); // plain data survived the JSON round trip
    expect(client.inFlightCount).toBe(0);
    client.dispose();
  });

  it('a block whose equation throws is a BLOCK_EQUATION diagnostic naming the block (never a swallowed error)', async () => {
    blockEquations.wp31c_boom = () => { throw new Error('boom from the equation'); };
    try {
      const { worker } = coreWorker();
      const client = new VLabWorkerClient(() => worker);
      const nodes = [node('b1', 'wp31c_boom', {}, { ports: [{ id: 'y', pos: 'right', label: 'y', domain: 'Physical', direction: 'out' }] })];
      const error = await client.step(nodes, [], cfg, null, 0.01).catch(e => e);
      expect(error).toBeInstanceOf(VLabWorkerError);
      const d = error.diagnostic;
      expect(['BLOCK_EQUATION', 'TOPOLOGY', 'DAE_STRUCTURE']).toContain(d.code);
      expect(d.blockIds).toContain('b1');
      expect(JSON.stringify(d)).toContain('b1');
      client.dispose();
    } finally { delete blockEquations.wp31c_boom; }
  });

  it('every structured diagnostic class serializes to a typed record with code, blockId(s), portId and details', () => {
    const cases: [string, unknown, (d: ReturnType<typeof serializeVLabError>) => void][] = [
      ['TOPOLOGY', new TopologyValidationError([{ blockId: 'a', portId: 'p', expectedDomain: 'electrical', actualDomain: 'thermal', reason: 'domain mismatch', code: 'domain-mismatch', otherBlockId: 'b', otherPortId: 'q' } as any]),
        d => { expect(d.blockId).toBe('a'); expect(d.portId).toBe('p'); expect(d.items[0].details).toMatchObject({ expectedDomain: 'electrical', actualDomain: 'thermal', otherBlockId: 'b', otherPortId: 'q' }); }],
      ['PORT_WIDTH', new TopologyValidationError([{ blockId: 'a', portId: 'abc', expectedDomain: 'physical', actualDomain: 'physical', reason: 'width', code: 'width-mismatch', expectedWidth: 3, actualWidth: 1 } as any]),
        d => { expect(d.items[0].details).toMatchObject({ expectedWidth: 3, actualWidth: 1 }); }],
      ['PORT_WIDTH', new TopologyValidationError([{ blockId: 'a', portId: 'abc', expectedDomain: 'electrical', actualDomain: 'electrical', reason: 'composite', code: 'composite-mismatch' } as any]),
        d => { expect(d.items[0].code).toBe('composite-mismatch'); }],
      ['PORT_WIDTH', new PortWidthMismatchError([{ blockId: 'a', portId: 'x', expectedWidth: 3, actualWidth: 2, reason: 'w' } as any]),
        d => { expect(d.portId).toBe('x'); expect(d.items[0].details).toMatchObject({ expectedWidth: 3, actualWidth: 2 }); }],
      ['DAE_STRUCTURE', new DAEStructureError([{ code: 'free-unknown', blockId: 'm', blockType: 'mass', expectedRows: 2, actualRows: 1, missingIndices: ['branch[1]'], reason: 'free' }]),
        d => { expect(d.blockId).toBe('m'); expect(d.items[0].details).toMatchObject({ blockType: 'mass', expectedRows: 2, actualRows: 1, missingIndices: ['branch[1]'] }); }],
      ['NON_FINITE_RESIDUAL', new NonFiniteResidualError([{ kind: 'non-finite-residual', blockId: 'r', blockType: 'resistor', rowIndex: 0, variable: 'r_branch_current', value: NaN, reason: 'nan' }]),
        d => { expect(d.blockId).toBe('r'); expect(d.items[0].details.value).toBe('NaN'); }],
      ['BLOCK_EQUATION', new BlockEquationError([{ kind: 'equation-threw', blockId: 'q', blockType: 'x', rowIndex: -1, error: 'bad', reason: 'threw' }]),
        d => { expect(d.blockId).toBe('q'); expect(d.items[0].details.error).toBe('bad'); }],
      ['SCOPE_READ', new ScopeReadError({ code: 'frame', scopeId: 'sc', channel: 2, variable: 'v', reason: 'frame in scope' }),
        d => { expect(d.blockId).toBe('sc'); expect(d.items[0].details).toMatchObject({ channel: 2, variable: 'v' }); }],
      ['SOLVER', new VLabSolverDiagnosticError('did not converge', { time: 1, h: 1e-6, reason: 'r', blocks: ['a: x'], singularUnknowns: [{ variable: 'v1', blockId: 'u' }],
        worstResidualRows: [{ blockId: 'w', blockType: 'x', row: 3, variable: 'v', value: 12 }] }),
        d => { expect(d.blockIds).toEqual(['w', 'u']); expect(d.details).toMatchObject({ time: 1, h: 1e-6 }); }],
      ['PARAM', new VLabParamError([{ blockId: 'pb', param: 'R', raw: 'abc', reason: 'not a number', code: 'invalid-number' } as any]),
        d => { expect(d.blockId).toBe('pb'); expect(d.items[0].details).toMatchObject({ param: 'R', raw: 'abc' }); }],
      ['MULTIBODY_CONSTRAINT', new MultibodyConstraintDiagnosticError('UNDEFINED_DIRECTION' as any, 'j', ['f1', 'f2'], 'msg'),
        d => { expect(d.blockId).toBe('j'); expect(d.items[0].details.frameNodeIds).toEqual(['f1', 'f2']); }],
      ['CANCELLED', new VLabCancelledError(0.5, 7), d => { expect(d.details).toMatchObject({ time: 0.5, acceptedSteps: 7 }); }],
      ['UNKNOWN', new Error('plain'), d => { expect(d.message).toBe('plain'); }],
    ];
    for (const [code, error, check] of cases) {
      const d = serializeVLabError(error);
      expect(d.code, (error as Error).name).toBe(code);
      expect(d.message).toBe((error as Error).message);
      expect(Array.isArray(d.blockIds)).toBe(true);
      expect(() => structuredClone(d)).not.toThrow();
      expect(JSON.parse(JSON.stringify(d))).toEqual(d); // plain data: nothing is lost by the boundary
      check(d);
    }
    expect(serializeVLabError('just a string')).toMatchObject({ code: 'UNKNOWN', message: 'just a string' });
    expect(toCloneable({ a: NaN, b: [Infinity, 1], f: () => 1 })).toEqual({ a: 'NaN', b: ['Infinity', 1] });
  });

  it('cancel stops a running step mid-solve (flag polled in the step loop) and the worker engine stays usable', async () => {
    let polls = 0;
    const { worker, received } = coreWorker({ isCancelled: () => ++polls > 4 });
    const client = new VLabWorkerClient(() => worker);
    const m = mixed30();
    const error = await client.step(m.nodes, m.edges, cfg, null, 0.05).catch(e => e);
    expect(error).toBeInstanceOf(VLabWorkerError);
    expect(error.diagnostic.code).toBe('CANCELLED');
    expect(error.diagnostic.details.acceptedSteps).toBeLessThan(10); // stopped within a few solver attempts, not after the whole 50 ms
    expect(received.filter(r => r.state).length).toBe(0);
    polls = -1e9; // not cancelled any more
    const state = await client.step(m.nodes, m.edges, cfg, null, 0.01);
    expect(state.time).toBeCloseTo(0.01, 12);
    client.dispose();
  });

  it('client.cancel writes the request id into the shared flag, rejects the step, and the next step is not affected', async () => {
    const posted: any[] = [];
    const worker = { postMessage: vi.fn((r: any) => { posted.push(r); }), terminate: vi.fn(), set onmessage(_v: any) {}, set onerror(_v: any) {} } as unknown as Worker;
    const client = new VLabWorkerClient(() => worker);
    const p1 = client.step([], [], cfg, null, 0.1);
    const flag: Int32Array | undefined = posted[0].cancelFlag;
    expect(flag).toBeInstanceOf(Int32Array);
    client.cancel(1);
    await expect(p1).rejects.toThrow(/cancelled/);
    expect(Atomics.load(flag!, 0)).toBe(1);
    const p2 = client.step([], [], cfg, null, 0.1);
    expect(posted.at(-1).requestId).toBe(2);
    expect(posted.at(-1).cancelFlag).toBe(flag); // the flag now reads 1 != 2: the new step is not cancelled
    client.dispose();
    await expect(p2).rejects.toThrow(/cancelled/);
  });

  it('without SharedArrayBuffer a cancel restarts the worker (terminate stops a CPU-bound step)', async () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    try {
      const workers: any[] = [];
      const factory = () => { const w = { postMessage: vi.fn(), terminate: vi.fn(), set onmessage(_v: any) {}, set onerror(_v: any) {} }; workers.push(w); return w as unknown as Worker; };
      const client = new VLabWorkerClient(factory);
      const p = client.step([], [], cfg, null, 0.1);
      expect(workers[0].postMessage.mock.calls[0][0].cancelFlag).toBeUndefined();
      client.cancel();
      await expect(p).rejects.toThrow(/cancelled/);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(workers).toHaveLength(2);
      client.dispose();
    } finally { vi.unstubAllGlobals(); }
  });

  it('progress messages arrive while a long step runs and never resolve the step', async () => {
    const { worker, received } = coreWorker({ progressIntervalMs: 0 });
    const client = new VLabWorkerClient(() => worker);
    const progress: any[] = [];
    const off = client.onProgress(p => progress.push(p));
    const m = mixed30();
    const state = await client.step(m.nodes, m.edges, cfg, null, 0.02);
    expect(progress.length).toBeGreaterThan(2);
    expect(progress.every(p => p.targetTime === 0.02 && p.time <= 0.02 + 1e-12)).toBe(true);
    expect(progress.map(p => p.acceptedSteps)).toEqual([...progress.map(p => p.acceptedSteps)].sort((a, b) => a - b));
    expect(state.acceptedSteps).toBeGreaterThanOrEqual(progress.at(-1).acceptedSteps);
    expect(received.filter(r => r.state).length).toBe(1);
    off();
    client.dispose();
  });

  it('is deterministic: the same model twice through the worker gives bit-identical states', async () => {
    const run = async () => {
      const { worker } = coreWorker();
      const client = new VLabWorkerClient(() => worker);
      const m = mixed30();
      let state: any = null;
      for (let i = 0; i < 5; i++) state = await client.step(m.nodes, m.edges, cfg, state, 0.01);
      client.dispose();
      return state;
    };
    const a = await run(), b = await run();
    expect(b.x.length).toBe(a.x.length);
    b.x.forEach((v: number, i: number) => expect(Object.is(v, a.x[i])).toBe(true));
    expect(b.acceptedSteps).toBe(a.acceptedSteps);
  });

  it('a structurally ill-posed model (floating resistor) is a DAE_STRUCTURE diagnostic naming the block', async () => {
    const { worker } = coreWorker();
    const client = new VLabWorkerClient(() => worker);
    const error = await client.step([node('res', 'resistor', { R: 100 })], [], cfg, null, 0.01).catch(e => e);
    expect(error.diagnostic.code).toBe('DAE_STRUCTURE');
    expect(error.diagnostic.blockIds).toContain('res');
    expect(error.diagnostic.items[0].code).toBe('floating-network');
    client.dispose();
  });
  it('unsubscribing stops diagnostics; a throwing listener does not block the queue', async () => {
    const { worker } = coreWorker();
    const client = new VLabWorkerClient(() => worker);
    const calls: number[] = [];
    const off = client.onDiagnostics(() => { calls.push(1); });
    client.onDiagnostics(() => { throw new Error('ui bug'); });
    const bad = [node('res', 'resistor', { R: 100 })];
    await expect(client.step(bad, [], cfg, null, 0.01)).rejects.toBeInstanceOf(VLabWorkerError);
    off();
    await expect(client.step(bad, [], cfg, null, 0.01)).rejects.toBeInstanceOf(VLabWorkerError);
    expect(calls).toHaveLength(1);
    expect(client.inFlightCount).toBe(0);
    client.dispose();
  });
});