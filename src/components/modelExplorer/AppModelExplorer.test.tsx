import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppModelExplorer } from './AppModelExplorer';
import type { StateData, Layer } from '../../types/sm_types';
import type { BlockData, PartData } from '../../types/sysml_types';

describe('AppModelExplorer', () => {
  const sampleStates: StateData[] = [
    {
      id: 'state-idle',
      name: 'Idle',
      color: '#3b82f6',
      x: 100,
      y: 100,
      width: 120,
      height: 60,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      parentId: null,
      children: [],
      priority: 1,
      isParallel: false,
      regionId: null,
      autostart: false,
    },
  ];

  const sampleLayers: Layer[] = [
    {
      id: 'root',
      name: 'Root Layer',
      parentStateId: null,
      stateIds: ['state-idle'],
      junctionIds: [],
      transitionIds: [],
    },
  ];

  const sampleBlocks: BlockData[] = [
    {
      id: 'block-motor',
      name: 'ElectricMotor',
      x: 100,
      y: 100,
      width: 150,
      height: 100,
      stereotype: 'block',
      ports: [],
      properties: [],
      constraints: [],
      operations: [],
      classes: [],
    },
  ];

  it('renders State Machine model explorer when diagramMode is statemachine', () => {
    const html = renderToStaticMarkup(
      <AppModelExplorer
        diagramMode="statemachine"
        states={sampleStates}
        layers={sampleLayers}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={['state-idle']}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
      />
    );

    expect(html).toContain('Idle');
    expect(html).toContain('role="tree"');
  });

  it('renders SysML model explorer when diagramMode is bdd', () => {
    const html = renderToStaticMarkup(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={sampleBlocks}
        parts={[]}
        selectedIds={['block-motor']}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
      />
    );

    expect(html).toContain('ElectricMotor');
    expect(html).toContain('role="tree"');
  });
});
