import { describe, test, expect } from 'vitest';
import { generateOpl, parseOpl } from '../OplParser';
import { Node, Edge } from 'reactflow';
import { OPMNodeData, OPMEdgeData } from '../EntropyTypes';

describe('ENTROPY OPM Bimodal Syncer Tests', () => {
  // Test OPL Generation
  test('generateOpl should generate correct sentences from OPM nodes and edges', () => {
    const nodes: Node<OPMNodeData>[] = [
      {
        id: 'obj-1',
        position: { x: 0, y: 0 },
        data: { name: 'Home_System', type: 'object', physical: false }
      },
      {
        id: 'obj-2',
        position: { x: 0, y: 0 },
        data: { name: 'Sensor', type: 'object', physical: true }
      },
      {
        id: 'proc-1',
        position: { x: 0, y: 0 },
        data: { name: 'Monitor', type: 'process', physical: false }
      }
    ];

    const edges: Edge<OPMEdgeData>[] = [
      {
        id: 'e-1',
        source: 'obj-1',
        target: 'obj-2',
        data: { type: 'aggregation' }
      },
      {
        id: 'e-2',
        source: 'obj-2',
        target: 'proc-1',
        data: { type: 'agent' }
      }
    ];

    const oplText = generateOpl(nodes, edges);
    
    expect(oplText).toContain('Object Sensor is physical.');
    expect(oplText).toContain('Home_System consists of Sensor.');
    expect(oplText).toContain('Sensor executes Monitor.');
  });

  // Test OPL Parsing
  test('parseOpl should parse Object declarations and physical properties', () => {
    const oplText = `
      Object Home_System consists of Temperature_Sensor.
      Object Temperature_Sensor is physical.
      Process Monitor_Temperature.
    `;

    const { nodes, edges, errors } = parseOpl(oplText);

    expect(errors).toHaveLength(0);
    
    const homeNode = nodes.find(n => n.data.name === 'Home_System');
    const sensorNode = nodes.find(n => n.data.name === 'Temperature_Sensor');
    const monitorNode = nodes.find(n => n.data.name === 'Monitor_Temperature');

    expect(homeNode).toBeDefined();
    expect(homeNode?.data.type).toBe('object');
    
    expect(sensorNode).toBeDefined();
    expect(sensorNode?.data.type).toBe('object');
    expect(sensorNode?.data.physical).toBe(true);

    expect(monitorNode).toBeDefined();
    expect(monitorNode?.data.type).toBe('process');

    const aggEdge = edges.find(e => e.data?.type === 'aggregation');
    expect(aggEdge).toBeDefined();
    expect(aggEdge?.source).toBe(homeNode?.id);
    expect(aggEdge?.target).toBe(sensorNode?.id);
  });

  test('parseOpl should parse Object States and Procedural Links', () => {
    const oplText = `
      Object Kettle has states Empty, Boiling, Hot.
      Process Boil_Water.
      Heater executes Boil_Water.
      Kettle in state Empty triggers Boil_Water.
      Boil_Water changes Kettle from Empty to Hot.
    `;

    const { nodes, edges, errors } = parseOpl(oplText);

    expect(errors).toHaveLength(0);

    const kettleNode = nodes.find(n => n.data.name === 'Kettle');
    expect(kettleNode).toBeDefined();
    expect(kettleNode?.data.states).toHaveLength(3);
    expect(kettleNode?.data.states?.[0].name).toBe('Empty');

    const emptyStateNode = nodes.find(n => n.data.name === 'Empty' && n.data.type === 'state');
    expect(emptyStateNode).toBeDefined();
    expect(emptyStateNode?.parentNode).toBe(kettleNode?.id);

    const boilProc = nodes.find(n => n.data.name === 'Boil_Water');
    expect(boilProc).toBeDefined();

    const triggerEdge = edges.find(e => e.data?.type === 'trigger');
    expect(triggerEdge).toBeDefined();
    expect(triggerEdge?.source).toBe(emptyStateNode?.id);
    expect(triggerEdge?.target).toBe(boilProc?.id);
  });

  // Test Syntax Checking / Error Reporting
  test('parseOpl should report syntax errors for invalid sentences', () => {
    const oplText = `
      Object Home_System consists of.
      This is an invalid sentence.
    `;

    const { errors } = parseOpl(oplText);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Syntax Error');
  });
});
