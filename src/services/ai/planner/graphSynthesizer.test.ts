import { describe, it, expect } from 'vitest';
import {
  synthesizeGraph,
  synthesizeTopology,
  validateTopologyPorts,
  resolveCatalogTokens,
  resolveBlockToken,
  GRAPH_SYNTHESIZER_VERSION,
} from './graphSynthesizer';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import type { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import type { GeneralEngineeringRequest } from './generalIntent';

const catalog = buildXbridgesCapabilityIndex();

function emptySnapshot(): ModelSnapshot {
  return {
    projectId: 'proj_syn',
    revision: 1,
    nodes: [],
    edges: [],
    stateHash: 'syn_base_hash',
    timestamp: 1700000000000,
  };
}

function requestFor(behaviors: string[], objective: string, inputs: GeneralEngineeringRequest['inputs'] = []): GeneralEngineeringRequest {
  return {
    intent: 'create',
    objective,
    targetBehaviors: behaviors,
    inputs,
    outputs: [],
    constraints: [],
    rawPrompt: objective,
  };
}

describe('graphSynthesizer: catalog-driven composition', () => {
  const behaviorTable: Array<{ behaviors: string[]; requiredTypes: string[] }> = [
    { behaviors: ['closed_loop_control'], requiredTypes: ['Constant', 'Sum', 'PID_CONTROLLER', 'INTEGRATOR_CONTINUOUS', 'Scope'] },
    { behaviors: ['speed_control'], requiredTypes: ['PID_CONTROLLER', 'Sum'] },
    { behaviors: ['low_pass_filter'], requiredTypes: ['Step', 'Sum', 'GAIN', 'Integrator', 'Scope'] },
    { behaviors: ['thermal_alarm_logic'], requiredTypes: ['SWITCH', 'WaveformGen', 'Constant', 'Scope'] },
    { behaviors: ['motor_drive'], requiredTypes: ['DC_VOLTAGE_SOURCE', 'PWM_GENERATOR', 'THREE_PHASE_INVERTER', 'THREE_PHASE_LOAD', 'Scope'] },
    { behaviors: ['thermal_control'], requiredTypes: ['AIR_FRYER_LEARNING_MODEL', 'Constant', 'Scope'] },
    { behaviors: ['logical_sequencing'], requiredTypes: ['DFlipFlop', 'Clock', 'Constant', 'Scope'] },
  ];

  for (const { behaviors, requiredTypes } of behaviorTable) {
    it(`composes ${behaviors[0]} exclusively from advertised catalog capabilities`, () => {
      const outcome = synthesizeTopology({
        request: requestFor(behaviors, `build ${behaviors[0]}`),
        snapshot: emptySnapshot(),
        catalog,
        patterns: [],
      });
      expect(outcome.status).toBe('planned');
      const types = outcome.topology!.blocks.map(b => b.type);
      for (const t of requiredTypes) {
        expect(types).toContain(t);
        expect(catalog.blocks.has(t), `'${t}' must exist in the installed catalog`).toBe(true);
      }
      // Every connection must respect advertised port directionality.
      expect(validateTopologyPorts(outcome.topology!, catalog)).toEqual([]);
    });
  }

  it('composes explicit chains from port semantics, not model-name keywords', () => {
    const outcome = synthesizeTopology({
      request: requestFor([], 'Connect Constant to GAIN to Scope please'),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [],
    });
    expect(outcome.status).toBe('planned');
    const types = outcome.topology!.blocks.map(b => b.type);
    expect(types).toEqual(['Constant', 'GAIN', 'Scope']);
    expect(validateTopologyPorts(outcome.topology!, catalog)).toEqual([]);
  });

  it('applies requested quantities only to real catalog parameters', () => {
    const outcome = synthesizeTopology({
      request: requestFor([], 'Constant into GAIN of 7 into Scope', [{ name: 'gain', value: 7 }]),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [],
    });
    expect(outcome.status).toBe('planned');
    const gain = outcome.topology!.blocks.find(b => b.type === 'GAIN')!;
    expect(gain.params.gain).toBe(7);
  });

  it('refuses when an explicit chain block has no compatible output port', () => {
    const outcome = synthesizeTopology({
      request: requestFor([], 'TERMINATOR into Scope'),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [],
    });
    expect(outcome.status).toBe('refused');
    expect(outcome.diagnostics.some(d => d.code === 'INCOMPATIBLE_PORTS')).toBe(true);
  });

  it('refuses behavior requests the catalog cannot realize (never a meaningless fallback graph)', () => {
    const outcome = synthesizeTopology({
      request: requestFor(['quantum_entanglement_router'], 'route entangled qubits'),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [],
    });
    expect(outcome.status).toBe('refused');
    expect(outcome.diagnostics[0].code).toBe('MISSING_CAPABILITY');
  });

  it('treats knowledge patterns as advisory evidence, never as executable authority', () => {
    const bogusPattern = {
      id: 'pat_bogus',
      name: 'Bogus pattern with invented blocks',
      topology: { blocks: [{ blockId: 'INVENTED_BLOCK', role: 'src' }] },
    };
    const outcome = synthesizeTopology({
      request: requestFor(['feed_forward'], 'Step into Gain into Scope'),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [bogusPattern],
    });
    // Plan must still be built strictly from catalog capabilities.
    expect(outcome.status).toBe('planned');
    for (const b of outcome.topology!.blocks) {
      expect(catalog.blocks.has(b.type)).toBe(true);
      expect(b.type).not.toBe('INVENTED_BLOCK');
    }
  });
});

describe('graphSynthesizer: token resolution', () => {
  it('resolves ids, aliases, and id segments; rejects unknown tokens', () => {
    expect(resolveBlockToken('GAIN', catalog)?.id).toBe('GAIN');
    expect(resolveBlockToken('gain', catalog)?.id).toBe('GAIN');
    // 'PID' is an acronym segment shared by PID_BASIC and PID_CONTROLLER;
    // resolution must be deterministic (prefix bucket, then shortest id).
    expect(resolveBlockToken('PID', catalog)?.id).toBe('PID_BASIC');
    expect(resolveBlockToken('Scope', catalog)?.id).toBe('Scope');
    expect(resolveBlockToken('FLUX_CAPACITOR', catalog)).toBeUndefined();
  });

  it('resolves ordered catalog tokens from text with stopwords filtered', () => {
    const caps = resolveCatalogTokens('Create a model with Step and GAIN into Scope', catalog);
    expect(caps.map(c => c.id)).toEqual(['Step', 'GAIN', 'Scope']);
  });
});

describe('graphSynthesizer: determinism and plan contract', () => {
  it('produces identical plan hashes for identical normalized inputs', () => {
    const input = {
      request: requestFor(['closed_loop_control'], 'PID loop', [{ name: 'setpoint', value: 42 }]),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [],
      knowledgeHash: 'kh_test',
      projectId: 'proj_h',
      baseRevision: 3,
    };
    const a = synthesizeGraph(input);
    const b = synthesizeGraph({ ...input, request: { ...input.request } });
    expect(a.status).toBe('planned');
    expect(a.plan!.planHash).toBe(b.plan!.planHash);
    expect(a.plan!.planHash).toHaveLength(64);
    expect((a.plan as unknown as { synthesizer: { version: string } }).synthesizer.version).toBe(GRAPH_SYNTHESIZER_VERSION);
  });

  it('orders actions deterministically (blocks before connections, stable ids)', () => {
    const result = synthesizeGraph({
      request: requestFor([], 'Constant into GAIN into Scope'),
      snapshot: emptySnapshot(),
      catalog,
      patterns: [],
      projectId: 'proj_order',
      baseRevision: 1,
    });
    expect(result.status).toBe('planned');
    const kinds = result.plan!.actions.map(a => a.kind);
    const firstConnect = kinds.indexOf('connect_ports');
    const lastAdd = kinds.lastIndexOf('add_block');
    expect(lastAdd).toBeLessThan(firstConnect);
  });

  it('binds the plan to the snapshot hash and catalog fingerprint', () => {
    const snapshot = emptySnapshot();
    const result = synthesizeGraph({
      request: requestFor([], 'Constant into Scope'),
      snapshot,
      catalog,
      patterns: [],
      projectId: 'proj_bind',
      baseRevision: 1,
    });
    expect(result.plan!.expectedBeforeHash).toBe(snapshot.stateHash);
    expect(result.plan!.catalogFingerprint).toBe(catalog.catalogFingerprint);
  });
});
