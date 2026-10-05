// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { validateConnection, type RuleNode } from '../../engine/vlab/vlabConnectionRules';
import { VLabWorkspace } from './VLabWorkspace';

/**
 * F-027: this file used to test its own COPY of validateConnection. It now tests the real rules module
 * (engine/vlab/vlabConnectionRules) and, through a mounted VLabWorkspace, proves that the real onConnect and the
 * Run button use that module. Exhaustive per-port coverage lives in engine/vlab/review/connections.test.ts.
 */

// Capture the props the workspace hands to <ReactFlow> (onConnect, the edges it renders) without a real canvas.
const rf = vi.hoisted(() => ({ props: null as any }));
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual: any = await importOriginal();
  const react: any = await import('react');
  return {
    ...actual,
    ReactFlow: (props: any) => { rf.props = props; return react.createElement('div', { 'data-testid': 'rf' }, props.children); },
  };
});

const node = (id: string, type: string, extra: Record<string, any> = {}): RuleNode => ({ id, type: 'default', data: { type, label: id, ...extra } });
const conn = (nodes: RuleNode[], s: string, sp: string, t: string, tp: string, edges: any[] = []) =>
  validateConnection(nodes, edges, { source: s, sourceHandle: `${s}-${sp}`, target: t, targetHandle: `${t}-${tp}` });

describe('real rules module: behaviours the former test-local copy covered', () => {
  it('rejects mismatched domains (electrical to thermal) with a message naming both ports', () => {
    const r = conn([node('bat', 'dc_voltage', { label: '24V Battery' }), node('heater', 'thermal_resistor', { label: 'Heater' })], 'bat', 'p', 'heater', 'h');
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.message).toContain('Cannot connect');
      expect(r.message).toContain('electrical port (24V Battery)');
      expect(r.message).toContain('thermal port (Heater)');
      expect(r.diagnostic).toMatchObject({ code: 'domain-mismatch' });
    }
  });

  it('allows matching physical domains (electrical to electrical)', () => {
    expect(conn([node('bat', 'dc_voltage'), node('r', 'resistor')], 'bat', 'p', 'r', 'p').valid).toBe(true);
  });

  it('rejects a PS Constant wired straight to an electrical conserving port', () => {
    const nodes = [node('cmd', 'ps_constant', { label: 'DC Command' }), node('load', 'resistor', { label: 'Load' })];
    const r = conn(nodes, 'cmd', 'y', 'load', 'p');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.message).toMatch(/physical port \(DC Command\) to electrical port \(Load\)|electrical port \(Load\) to physical port \(DC Command\)/);
  });

  it('allows a PS Constant to drive the physical-signal control port of a controlled voltage source', () => {
    expect(conn([node('cmd', 'ps_constant'), node('cv', 'controlled_voltage')], 'cmd', 'y', 'cv', 's').valid).toBe(true);
  });

  it('a scope accepts a sensor output but not a bare thermal port (measure through a sensor)', () => {
    expect(conn([node('ts', 'temp_sensor'), node('sc', 'scope')], 'ts', 't', 'sc', 'in1').valid).toBe(true);
    const bare = conn([node('tm', 'thermal_mass'), node('sc', 'scope')], 'tm', 'a', 'sc', 'in1');
    expect(bare.valid).toBe(false);
    if (!bare.valid) expect(bare.diagnostic.code).toBe('scope-needs-measurable-output');
  });

  it('solver_config connects to ground and to any domain reference block', () => {
    expect(conn([node('sc', 'solver_config'), node('gnd', 'ground')], 'sc', 'a', 'gnd', 'a').valid).toBe(true);
    expect(conn([node('sc', 'solver_config'), node('tr', 'thermal_ref')], 'sc', 'a', 'tr', 'a').valid).toBe(true);
  });

  it('the PS-Simulink / Simulink-PS converters bridge domains through their Any ports', () => {
    expect(conn([node('r', 'resistor'), node('cv', 'ps_simulink_conv')], 'r', 'p', 'cv', 'in').valid).toBe(true);
    expect(conn([node('cv2', 'simulink_ps_conv'), node('m', 'dc_motor')], 'cv2', 'out', 'm', 'r').valid).toBe(true);
  });
});

describe('VLabWorkspace.onConnect uses the shared rules (RTL integration)', () => {
  beforeAll(() => {
    (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    (globalThis as any).DOMMatrixReadOnly ??= class { m22 = 1; constructor(_?: any) {} };
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
  });
  afterEach(() => { cleanup(); rf.props = null; });

  const wsNode = (id: string, type: string, label = id) => ({
    id, type: 'vlabNode', position: { x: 0, y: 0 },
    data: { type, label, params: {}, ports: undefined as any },
  });

  const mount = (nodes: any[], edges: any[] = []) =>
    render(
      <ReactFlowProvider>
        <VLabWorkspace
          nodes={nodes} edges={edges}
          onNodesChange={() => {}} onEdgesChange={() => {}} onResult={() => {}} onSendToDOE={() => {}} onBack={() => {}}
        />
      </ReactFlowProvider>,
    );

  const connectVia = (params: { source: string; target: string; sourceHandle: string; targetHandle: string }) => {
    act(() => { rf.props.onConnect({ ...params }); });
  };
  const currentEdges = () => (rf.props.edges as any[]).map(e => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle }));

  const nodes = [
    wsNode('v1', 'dc_voltage'), wsNode('tm', 'thermal_mass'), wsNode('c1', 'ps_constant'), wsNode('c2', 'ps_constant'),
    wsNode('g1', 'ps_gain'), wsNode('r1', 'resistor'), wsNode('r2', 'resistor'), wsNode('sc', 'scope'),
  ];

  it('rejects a cross-domain drag and shows the structured diagnostic in the status bar', () => {
    mount(nodes);
    connectVia({ source: 'v1', sourceHandle: 'v1-p', target: 'tm', targetHandle: 'tm-a' });
    expect(currentEdges()).toHaveLength(0);
    expect(screen.getByText(/Cannot connect (electrical|thermal) port/)).toBeTruthy();
    expect(screen.getByText(/Use a domain converter block/)).toBeTruthy();
  });

  it('adds a valid wire; A->B and B->A produce the identical normalised edge; the duplicate is ignored', () => {
    mount(nodes);
    connectVia({ source: 'g1', sourceHandle: 'g1-u', target: 'c1', targetHandle: 'c1-y' }); // dragged FROM the input
    expect(currentEdges()).toEqual([
      { id: expect.any(String), source: 'c1', sourceHandle: 'c1-y', target: 'g1', targetHandle: 'g1-u' },
    ]);
    connectVia({ source: 'c1', sourceHandle: 'c1-y', target: 'g1', targetHandle: 'g1-u' });      // same wire, other direction
    expect(currentEdges()).toHaveLength(1);
  });

  it('rejects a second source on a signal input and says which input is already driven', () => {
    mount(nodes);
    connectVia({ source: 'c1', sourceHandle: 'c1-y', target: 'g1', targetHandle: 'g1-u' });
    connectVia({ source: 'c2', sourceHandle: 'c2-y', target: 'g1', targetHandle: 'g1-u' });
    expect(currentEdges()).toHaveLength(1);
    expect(screen.getByText(/already driven by c1\.y/)).toBeTruthy();
  });

  it('allows conserving fan-out and rejects a scope wired to a conserving port', () => {
    mount(nodes);
    connectVia({ source: 'r1', sourceHandle: 'r1-p', target: 'v1', targetHandle: 'v1-p' });
    connectVia({ source: 'r2', sourceHandle: 'r2-p', target: 'v1', targetHandle: 'v1-p' });
    expect(currentEdges()).toHaveLength(2);
    connectVia({ source: 'r1', sourceHandle: 'r1-n', target: 'sc', targetHandle: 'sc-in1' });
    expect(currentEdges()).toHaveLength(2);
    expect(screen.getByText(/Scope inputs accept only a measurable signal output/)).toBeTruthy();
  });

  it('the Run button applies the same rules and required-port check to a loaded model with an old invalid wire', () => {
    const bad = [{ id: 'old1', source: 'v1', sourceHandle: 'v1-p', target: 'tm', targetHandle: 'tm-a' }];
    mount(nodes, bad);
    // the loaded edge is marked invalid on the canvas instead of crashing the load
    expect((rf.props.edges as any[]).find(e => e.id === 'old1')?.className).toBe('edge-error');
    expect(screen.getByText(/1 invalid connection\(s\) detected\..*Cannot connect/)).toBeTruthy();
    fireEvent.click(screen.getByText('RUN SIMULATION'));
    expect(screen.getByText(/CANNOT RUN SIMULATION: Invalid V-Lab topology/)).toBeTruthy();
    expect(screen.getByText(/Required port "u" of "g1" \(ps_gain\) is not connected/)).toBeTruthy();
  });
});
