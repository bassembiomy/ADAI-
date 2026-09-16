import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import './index.css';
import { VLabWorkerClient } from './services/vlabWorkerClient';
import { XbridgesWorkerClient } from './services/xbridgesWorkerClient';
import { getDefaultSysmlWorkerClient } from './services/sysmlCommandGateway';
import { getSharedDOEWorkerClient } from './services/doeWorkerClient';
import { HILTelemetryBuffer } from './services/hilTelemetryBuffer';

// Register deterministic browser freeze workloads for test automation
if (typeof window !== 'undefined') {
  (window as any).__adia_freeze_workloads = {
    async vlab() {
      const client = new VLabWorkerClient();
      try {
        const nodes: any[] = [
          { id: 'gnd', data: { type: 'ground' } },
          { id: 'src', data: { type: 'dc_voltage', params: { V: 10 } } },
          { id: 'res', data: { type: 'resistor', params: { R: 1000 } } },
          { id: 'cap', data: { type: 'capacitor', params: { C: 1e-3 } } },
        ];
        const edges: any[] = [
          { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
          { id: 'e2', source: 'res', target: 'cap', sourceHandle: 'n_s', targetHandle: 'p_t' },
          { id: 'e3', source: 'cap', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
          { id: 'e4', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        ];
        const config: any = { id: 'test_cfg', solver: 'auto', maximumIterations: 50, nonlinearTolerance: 1e-6 };
        let state: any = null;
        const steps = 5;
        for (let i = 0; i < steps; i++) {
          state = await client.step(nodes, edges, config, state, 0.01);
        }
        return { workload: 'vlab' as const, operations: steps, state };
      } finally {
        client.dispose();
      }
    },
    async xbridges() {
      const client = new XbridgesWorkerClient();
      try {
        const model: any = {
          blocks: [
            { id: 'src', type: 'Constant', params: { value: 5 }, inputs: [], outputs: [{ id: 'out' }] },
            { id: 'integ', type: 'Integrator', params: { initialCondition: 0 }, inputs: [{ id: 'u' }], outputs: [{ id: 'y' }] },
          ],
          connections: [
            { sourceBlock: 'src', sourcePort: 'out', targetBlock: 'integ', targetPort: 'u' },
          ],
        };
        const batchSize = 5;
        const res = await client.step({
          model,
          solverType: 'rk4',
          dt: 0.01,
          time: 0,
          batchSize,
        });
        return { workload: 'xbridges' as const, operations: batchSize, result: res };
      } finally {
        client.dispose();
      }
    },
    async sysml() {
      const client = getDefaultSysmlWorkerClient();
      const mockSnapshot: any = {
        schemaVersion: 2,
        revision: 1,
        definitions: {
          b1: { id: 'b1', name: 'Block1', kind: 'block', namespace: [], isAbstract: false, isLeaf: true, properties: [], ports: [], operations: [], constraints: [] },
          b2: { id: 'b2', name: 'Block2', kind: 'block', namespace: [], isAbstract: false, isLeaf: true, properties: [], ports: [], operations: [], constraints: [] },
        },
        usages: {},
        connectors: {},
        relationships: {
          rel1: { id: 'rel1', sourceId: 'b1', targetId: 'b2', kind: 'dependency', stereotype: null },
        },
        requirements: {
          r1: { id: 'r1', requirementId: 'REQ-1', name: 'Req 1', text: 'Text', status: 'approved', version: '1.0', namespace: [], kind: 'requirement' },
        },
        verificationCases: {},
        evidence: {},
        baselines: {},
        artifacts: {},
      };
      // Run validate in a loop with explicit macrotask yields so
      // setInterval/rAF heartbeat monitors fire between iterations.
      const rounds = 10;
      let ops = 0;
      for (let i = 0; i < rounds; i++) {
        mockSnapshot.revision = i + 1;
        await client.validate(mockSnapshot, i + 1);
        ops++;
        // Yield to macrotask queue — 10ms pacing allows setInterval/rAF callbacks to run
        await new Promise(r => setTimeout(r, 10));
      }
      return { workload: 'sysml' as const, operations: ops };
    },
    async doe() {
      const client = getSharedDOEWorkerClient();
      const sampleData = {
        headers: ['Factor A', 'Factor B', 'Yield'],
        data: [
          [-1, -1, 12.5],
          [1, -1, 15.8],
          [-1, 1, 14.2],
          [1, 1, 22.4],
          [0, 0, 18.1],
        ],
      };
      const res = await client.fitRSM(sampleData);
      return { workload: 'doe' as const, operations: sampleData.data.length, result: res };
    },
    async hil() {
      const sampleCount = 200;
      const batches = 4;
      const perBatch = sampleCount / batches;
      let totalFlushes = 0;
      let lastSnapshot: any = null;
      const buffer = new HILTelemetryBuffer({
        maxDisplayPoints: 100,
        flushIntervalMs: 20,
        onFlush: (snapshot) => {
          totalFlushes++;
          lastSnapshot = snapshot;
        },
      });
      // Push samples in batches with explicit yields and manual flushes
      // between batches — avoids reliance on throttled internal timers.
      for (let batch = 0; batch < batches; batch++) {
        for (let i = 0; i < perBatch; i++) {
          const idx = batch * perBatch + i;
          buffer.pushSample({ timestamp: Date.now() + idx, values: { ch1: Math.sin(idx * 0.1) } });
        }
        // Manually flush after each batch to trigger onFlush
        buffer.flush();
        // Yield to macrotask queue — 10ms pacing between batches
        await new Promise(r => setTimeout(r, 10));
      }
      buffer.dispose();
      return { workload: 'hil' as const, operations: sampleCount, flushes: totalFlushes, sampleCount: lastSnapshot?.timestamps?.length ?? 0 };
    },
  };
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
