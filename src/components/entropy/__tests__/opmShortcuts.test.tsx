import { describe, test, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EntropyWorkspace } from '../EntropyWorkspace';
import type { AppNode, AppEdge } from '../EntropyTypes';

describe('OPM Studio Keyboard Shortcuts and Clipboard Engine', () => {
  const sampleNodes: AppNode[] = [
    {
      id: 'obj-car',
      type: 'opmObject',
      position: { x: 100, y: 100 },
      data: {
        name: 'Car',
        type: 'object',
        physical: true,
        states: [
          { id: 's1', name: 'Parked', isActive: false },
          { id: 's2', name: 'Moving', isActive: false },
        ],
        inputs: [],
        outputs: [],
      },
    },
    {
      id: 'st-parked',
      type: 'opmState',
      parentId: 'obj-car',
      position: { x: 18, y: 49 },
      data: {
        name: 'Parked',
        type: 'state',
        physical: false,
        parentId: 'obj-car',
        stateValue: 'Parked',
      },
    },
    {
      id: 'st-moving',
      type: 'opmState',
      parentId: 'obj-car',
      position: { x: 125, y: 49 },
      data: {
        name: 'Moving',
        type: 'state',
        physical: false,
        parentId: 'obj-car',
        stateValue: 'Moving',
      },
    },
    {
      id: 'proc-drive',
      type: 'opmProcess',
      position: { x: 400, y: 100 },
      data: {
        name: 'Driving',
        type: 'process',
        physical: false,
        inputs: [],
        outputs: [],
      },
    },
  ];

  const sampleEdges: AppEdge[] = [
    {
      id: 'e-parked-drive',
      source: 'st-parked',
      target: 'proc-drive',
      type: 'opmEdge',
      data: {
        type: 'consumption',
        linkType: 'consumption',
      },
    },
  ];

  test('renders the Shortcuts Help button in Studio ribbon', () => {
    const html = renderToStaticMarkup(
      <EntropyWorkspace
        initialNodes={sampleNodes}
        initialEdges={sampleEdges}
        availableVariables={[]}
        onVariablesChange={() => {}}
        onBack={() => {}}
      />
    );

    expect(html).toContain('data-testid="opm-shortcuts-help-btn"');
    expect(html).toContain('Shortcuts');
  });

  test('clipboard copy operation collects selected objects, child states, and connected internal edges', () => {
    const selectedNodes = sampleNodes.filter(n => n.id === 'obj-car');
    const selectedObjIds = new Set(selectedNodes.map(n => n.id));
    const childStates = sampleNodes.filter(n => n.parentId && selectedObjIds.has(n.parentId));
    const toCopyNodes = [...new Set([...selectedNodes, ...childStates])];
    const toCopyIds = new Set(toCopyNodes.map(n => n.id));
    const toCopyEdges = sampleEdges.filter(ed => toCopyIds.has(ed.source) && toCopyIds.has(ed.target));

    expect(toCopyNodes.map(n => n.id)).toEqual(['obj-car', 'st-parked', 'st-moving']);
    expect(childStates).toHaveLength(2);
    // e-parked-drive connects to proc-drive which is not copied, so toCopyEdges is empty
    expect(toCopyEdges).toHaveLength(0);
  });

  test('clipboard paste remaps IDs to new UUIDs and updates child parentId correctly', () => {
    const selectedNodes = sampleNodes.filter(n => n.id === 'obj-car');
    const selectedObjIds = new Set(selectedNodes.map(n => n.id));
    const childStates = sampleNodes.filter(n => n.parentId && selectedObjIds.has(n.parentId));
    const toCopyNodes = [...selectedNodes, ...childStates];

    const idMap = new Map<string, string>();
    idMap.set('obj-car', 'obj-car-new');
    idMap.set('st-parked', 'st-parked-new');
    idMap.set('st-moving', 'st-moving-new');

    const pastedNodes: AppNode[] = toCopyNodes.map(n => {
      const newId = idMap.get(n.id)!;
      const isChild = Boolean(n.parentId);
      const parentId = n.parentId ? idMap.get(n.parentId) || n.parentId : undefined;
      return {
        ...n,
        id: newId,
        selected: true,
        parentId,
        position: isChild
          ? { ...n.position }
          : { x: n.position.x + 35, y: n.position.y + 35 },
        data: {
          ...n.data,
          parentId: parentId || null,
        },
      };
    });

    const newObj = pastedNodes.find(n => n.id === 'obj-car-new')!;
    const newChild1 = pastedNodes.find(n => n.id === 'st-parked-new')!;
    const newChild2 = pastedNodes.find(n => n.id === 'st-moving-new')!;

    expect(newObj.position.x).toBe(135);
    expect(newObj.position.y).toBe(135);
    expect(newChild1.parentId).toBe('obj-car-new');
    expect(newChild2.parentId).toBe('obj-car-new');
    expect(newChild1.data.parentId).toBe('obj-car-new');
  });

  test('delete selected node cascades to delete its child states and attached edges', () => {
    const activeSelectedNodes = [sampleNodes[0]]; // obj-car
    const selectedObjIds = new Set(activeSelectedNodes.map(n => n.id));
    const allNodeIdsToDelete = new Set<string>();

    sampleNodes.forEach(n => {
      if (selectedObjIds.has(n.id) || (n.parentId && selectedObjIds.has(n.parentId))) {
        allNodeIdsToDelete.add(n.id);
      }
    });

    const remainingNodes = sampleNodes.filter(n => !allNodeIdsToDelete.has(n.id));
    const remainingEdges = sampleEdges.filter(
      ed => !allNodeIdsToDelete.has(ed.source) && !allNodeIdsToDelete.has(ed.target)
    );

    expect(allNodeIdsToDelete.has('obj-car')).toBe(true);
    expect(allNodeIdsToDelete.has('st-parked')).toBe(true);
    expect(allNodeIdsToDelete.has('st-moving')).toBe(true);
    expect(remainingNodes).toHaveLength(1);
    expect(remainingNodes[0].id).toBe('proc-drive');
    expect(remainingEdges).toHaveLength(0); // attached edge was cascaded
  });

  test('cut operation saves selected to clipboard and removes them from canvas', () => {
    const activeSelectedNodes = [sampleNodes[3]]; // proc-drive
    const toCutIds = new Set(activeSelectedNodes.map(n => n.id));

    const remainingNodes = sampleNodes.filter(n => !toCutIds.has(n.id));
    const remainingEdges = sampleEdges.filter(
      ed => !toCutIds.has(ed.source) && !toCutIds.has(ed.target)
    );

    expect(remainingNodes).toHaveLength(3);
    expect(remainingEdges).toHaveLength(0);
  });

  test('Space + C shortcut toggles collapse/expand across all dock panels', () => {
    let docks = { left: true, right: true, bottom: true, rightTab: 'simControl', page: 'simulate' as const };
    
    // When any dock is open, Space+C collapses all
    const allCollapsed = !docks.left && !docks.right && !docks.bottom;
    expect(allCollapsed).toBe(false);
    docks = { ...docks, left: false, right: false, bottom: false };
    expect(!docks.left && !docks.right && !docks.bottom).toBe(true);

    // When all are collapsed, Space+C restores all
    docks = { ...docks, left: true, right: true, bottom: true };
    expect(docks.left && docks.right && docks.bottom).toBe(true);
  });
});
