import { describe, test, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import { OPM_EXAMPLES } from '../EntropyExamples';
import { parseOpl } from '../OplParser';
import { layoutOpmGraph } from '../OpmAutoLayout';
import { initializeSimulation, stepSimulation, applySimResultToNodes } from '../OpmSimulationEngine';
import { OPMObjectNode, OPMStateNode } from '../OPMNodeComponents';
import type { AppNode } from '../EntropyTypes';

describe('ISO 19450 OPM Templates and State Area Standards', () => {
  test('smartHome template adheres to standard OPM: Heating_Unit owns states Off and Heating', () => {
    const { nodes, edges, errors } = parseOpl(OPM_EXAMPLES.smartHome.oplText);
    expect(errors).toHaveLength(0);

    const heatingUnit = nodes.find(n => n.data.name === 'Heating_Unit');
    expect(heatingUnit).toBeDefined();
    expect(heatingUnit!.data.physical).toBe(true);

    const states = nodes.filter(n => n.data.type === 'state' && n.parentId === heatingUnit!.id);
    expect(states).toHaveLength(2);

    const offState = states.find(s => s.data.name === 'Off');
    const heatingState = states.find(s => s.data.name === 'Heating');
    expect(offState).toBeDefined();
    expect(heatingState).toBeDefined();

    // Verify coordinates inside the object state tray area
    expect(offState!.position.y).toBe(49);
    expect(offState!.position.x).toBe(18);
    expect(heatingState!.position.y).toBe(49);
    expect(heatingState!.position.x).toBe(18 + 107);
    expect(offState!.extent).toBe('parent');
  });

  test('cruiseControl template adheres to standard OPM: Engine_Controller owns states Inactive and Active', () => {
    const { nodes, edges, errors } = parseOpl(OPM_EXAMPLES.cruiseControl.oplText);
    expect(errors).toHaveLength(0);

    const engineCtrl = nodes.find(n => n.data.name === 'Engine_Controller');
    expect(engineCtrl).toBeDefined();
    expect(engineCtrl!.data.physical).toBe(true);

    const states = nodes.filter(n => n.data.type === 'state' && n.parentId === engineCtrl!.id);
    expect(states).toHaveLength(2);

    const inactiveState = states.find(s => s.data.name === 'Inactive');
    const activeState = states.find(s => s.data.name === 'Active');
    expect(inactiveState).toBeDefined();
    expect(activeState).toBeDefined();

    // Verify internal state coordinates
    expect(inactiveState!.position.y).toBe(49);
    expect(activeState!.position.y).toBe(49);
  });

  test('smartAirFryer template decomposes cleanly and allocates multi-state trays', () => {
    const { nodes, edges, errors } = parseOpl(OPM_EXAMPLES.smartAirFryer.oplText);
    expect(errors).toHaveLength(0);

    const chamberDisplay = nodes.find(n => n.data.name === 'Chamber_Display');
    expect(chamberDisplay).toBeDefined();

    const displayStates = nodes.filter(n => n.data.type === 'state' && n.parentId === chamberDisplay!.id);
    expect(displayStates).toHaveLength(5);

    // Verify all 5 states sit at exact state tray Y level
    displayStates.forEach((st, idx) => {
      expect(st.position.y).toBe(49);
      expect(st.position.x).toBe(18 + idx * 107);
    });

    // Auto-layout arranges them with zero overlap
    const layouted = layoutOpmGraph(nodes, edges);
    const layoutedStates = layouted.filter(n => n.data.type === 'state' && n.parentId === chamberDisplay!.id);
    expect(layoutedStates).toHaveLength(5);
    for (let i = 0; i < layoutedStates.length - 1; i++) {
      expect(layoutedStates[i + 1].position.x - layoutedStates[i].position.x).toBe(107);
      expect(layoutedStates[i].position.y).toBe(49);
    }
  });

  test('OPMObjectNode renders reserved state tray with dynamic expansion', () => {
    const objectNodeWithStates: any = {
      id: 'obj_chamber',
      selected: false,
      data: {
        name: 'Chamber_Display',
        type: 'object',
        physical: true,
        parentId: null,
        states: [
          { id: 's1', name: 'Disp_Off', isActive: true, isInitial: true },
          { id: 's2', name: 'Disp_Ready', isActive: false },
          { id: 's3', name: 'Disp_Heat', isActive: false },
          { id: 's4', name: 'Disp_Steam', isActive: false },
          { id: 's5', name: 'Disp_Done', isActive: false },
        ],
        attributes: [],
      }
    };

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <OPMObjectNode {...objectNodeWithStates} />
      </ReactFlowProvider>
    );

    expect(html).toContain('data-testid="object-state-tray"');
    expect(html).toContain('states (5)');
    // 5 states require 18*2 + 5*95 + 4*12 = 559px minimum width
    expect(html).toContain('min-width:559px');
  });

  test('simulation executes transitions for redesigned Heating_Unit states', () => {
    const { nodes, edges } = parseOpl(OPM_EXAMPLES.smartHome.oplText);
    const sim = initializeSimulation(nodes);

    const heatingUnit = nodes.find(n => n.data.name === 'Heating_Unit')!;
    const offState = nodes.find(s => s.data.name === 'Off' && s.parentId === heatingUnit.id)!;
    const heatingState = nodes.find(s => s.data.name === 'Heating' && s.parentId === heatingUnit.id)!;

    // Initial state is Off
    expect(sim.objectActiveState[heatingUnit.id]).toBe(offState.id);

    const nodesWithActive = applySimResultToNodes(nodes, sim, []);
    const initialOffNode = nodesWithActive.find(n => n.id === offState.id)!;
    expect((initialOffNode.data as any).isActive).toBe(true);

    // Step simulation: Monitor_Temperature fires then Toggle_Heating transitions Heating_Unit
    let currentSim = sim;
    let currentNodes = nodesWithActive;
    for (let i = 0; i < 3; i++) {
      const stepResult = stepSimulation(currentNodes, edges, currentSim);
      currentSim = stepResult.state;
      currentNodes = applySimResultToNodes(currentNodes, currentSim, stepResult.firingProcessIds);
      if (currentSim.objectActiveState[heatingUnit.id] === heatingState.id) {
        break;
      }
    }
    expect(currentSim.objectActiveState[heatingUnit.id]).toBe(heatingState.id);
  });
});
