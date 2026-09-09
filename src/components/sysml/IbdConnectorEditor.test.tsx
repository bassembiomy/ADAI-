import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { IbdConnectorEditor } from './IbdConnectorEditor';
import type { ConnectorUsage, SysmlRepository } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';
import { createEmptyRepository } from '../../engine/sysml/model';

describe('IbdConnectorEditor', () => {
  const repo: SysmlRepository = createEmptyRepository();
  repo.definitions.Pressure = { id: 'Pressure', name: 'Pressure', namespace: [], kind: 'valueType', unit: 'Pa', dimension: 'pressure' };
  repo.definitions.SignalIF = { id: 'SignalIF', name: 'SignalIF', namespace: [], kind: 'interface', features: ['v'] };

  const connector: ConnectorUsage = {
    id: 'c1',
    kind: 'assembly',
    ownerId: 'sys',
    sourcePortId: 'part1::outPort',
    targetPortId: 'part2::inPort',
    itemFlowId: 'Pressure',
    itemProperty: 'fuelPressure',
    itemUnit: 'Pa',
  };

  const availablePorts = [
    { id: 'part1::outPort', name: 'outPort', ownerName: 'part1' },
    { id: 'part2::inPort', name: 'inPort', ownerName: 'part2' },
  ];

  it('renders connector kinds, endpoints, item flow fields, and diagnostics', () => {
    const diagnostics: SysmlDiagnostic[] = [
      { code: 'INCOMPATIBLE_PORT_DIRECTION', severity: 'error', elementId: 'c1', message: 'out cannot connect to out' },
    ];

    const html = renderToStaticMarkup(
      <IbdConnectorEditor
        connector={connector}
        availablePorts={availablePorts}
        definitions={repo.definitions}
        diagnostics={diagnostics}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('Connector kind');
    expect(html).toContain('assembly');
    expect(html).toContain('delegation');
    expect(html).toContain('binding');
    expect(html).toContain('fuelPressure');
    expect(html).toContain('Pressure «valueType»');
    expect(html).toContain('out cannot connect to out');
  });
});
