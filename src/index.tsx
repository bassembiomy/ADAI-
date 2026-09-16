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
        for (let i = 0; i < 5; i++) {
          state = await client.step(nodes, edges, config, state, 0.01);
        }
        return { completed: true, state };
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
        const res = await client.step({
          model,
          solverType: 'rk4',
          dt: 0.01,
          time: 0,
          batchSize: 5,
        });
        return { completed: true, result: res };
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
        },
        usages: {},
        connectors: {},
        relationships: {},
        requirements: {
          r1: { id: 'r1', requirementId: 'REQ-1', name: 'Req 1', text: 'Text', status: 'approved', version: '1.0', namespace: [], kind: 'requirement' },
        },
        verificationCases: {},
        evidence: {},
        baselines: {},
        artifacts: {},
      };
      const res = await client.validate(mockSnapshot, 1);
      return { completed: true, result: res };
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
      return { completed: true, result: res };
    },
    async hil() {
      return new Promise<any>((resolve) => {
        let flushes = 0;
        const buffer = new HILTelemetryBuffer({
          maxDisplayPoints: 100,
          flushIntervalMs: 20,
          onFlush: (snapshot) => {
            flushes++;
            if (flushes >= 1) {
              buffer.dispose();
              resolve({ completed: true, flushes, sampleCount: snapshot.timestamps.length });
            }
          },
        });
        for (let i = 0; i < 50; i++) {
          buffer.pushSample({ timestamp: Date.now() + i, values: { ch1: Math.sin(i * 0.1) } });
        }
      });
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
