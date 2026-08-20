import { describe, it, expect } from 'vitest';
import { createPersistedAppSimulationModel } from './stateMachine/smAppAdapter';
import { createUnifiedProjectPayload } from './adiaProjectPersistence';

describe('Startup Defaults Invariants', () => {
  it('serializes a clean empty model when initial states and variables are empty', () => {
    const emptyModel = createPersistedAppSimulationModel({
      tickMs: 500,
      states: [],
      junctions: [],
      transitions: [],
      variables: [],
      layers: [{
        id: 'root',
        name: 'Root',
        parentStateId: null,
        stateIds: [],
        transitionIds: [],
        junctionIds: [],
      }],
      safetyMode: false,
      hilConfig: {
        enabled: false,
        target: 'Generic',
        clockSpeed: 16,
        channels: [],
        mappings: [],
        commPort: '',
        baudRate: 115200,
      },
    });

    expect(emptyModel.states).toEqual([]);
    expect(emptyModel.transitions).toEqual([]);
    expect(emptyModel.variables).toEqual([]);
    expect(emptyModel.layers[0].stateIds).toEqual([]);
  });

  it('creates an empty project payload when all workspaces are empty', () => {
    const project = createUnifiedProjectPayload({
      version: '1.0.0',
      projectName: 'Main Project',
      activeModule: 'statemachine',
      stateMachine: {
        tickMs: 500,
        states: [],
        junctions: [],
        transitions: [],
        layers: [{
          id: 'root',
          name: 'Root',
          parentStateId: null,
          stateIds: [],
          transitionIds: [],
          junctionIds: [],
        }],
        variables: [],
        safetyMode: false,
      },
      sysml: {
        blocks: [],
        relationships: [],
        parts: [],
        connectors: [],
        interfaceRealizations: [],
      },
      xbridges: {
        globalXBridgesNodes: [],
        globalXBridgesEdges: [],
      },
      vlab: {
        vlabNodes: [],
        vlabEdges: [],
      },
    });

    const sm = project.stateMachine as Record<string, unknown>;
    const xb = project.xbridges as Record<string, unknown>;

    expect(sm.variables).toEqual([]);
    expect(sm.states).toEqual([]);
    expect(xb.globalXBridgesNodes).toEqual([]);
  });
});
