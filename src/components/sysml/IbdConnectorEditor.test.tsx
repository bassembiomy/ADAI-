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

describe('IbdConnectorEditor Task 5 typed semantics', () => {
  const baseConnector: ConnectorUsage = {
    id: 'c2',
    kind: 'delegation',
    ownerId: 'sys',
    sourcePortId: 'part1::outPort',
    targetPortId: 'part2::inPort',
  };
  const ports = [
    { id: 'part1::outPort', name: 'outPort', ownerName: 'part1' },
    { id: 'part2::inPort', name: 'inPort', ownerName: 'part2' },
  ];
  const portDetails = [
    { id: 'part1::outPort', name: 'outPort', ownerName: 'part1', direction: 'out' as const, isConjugated: false, typeName: 'SignalIF' },
    { id: 'part2::inPort', name: 'inPort', ownerName: 'part2', direction: 'in' as const, isConjugated: true, typeName: 'SignalIF' },
  ];
  const renderEditor = (connector: ConnectorUsage, diagnostics: SysmlDiagnostic[]) =>
    renderToStaticMarkup(
      <IbdConnectorEditor
        connector={connector}
        availablePorts={ports}
        definitions={{}}
        diagnostics={diagnostics}
        portDetails={portDetails}
        ownerName="sys"
        onChange={vi.fn()}
      />,
    );

  it('shows the owning context and per-kind connector notation', () => {
    const html = renderEditor(baseConnector, []);
    expect(html).toContain('sys');
    expect(html).toContain('delegation-solid');
  });

  it('shows assembly notation for assembly connectors', () => {
    const html = renderEditor({ ...baseConnector, kind: 'assembly' }, []);
    expect(html).toContain('assembly-solid');
  });

  it('shows binding notation for binding connectors', () => {
    const html = renderEditor({ ...baseConnector, kind: 'binding' }, []);
    expect(html).toContain('binding-dashed');
  });

  it('surfaces effective direction and conjugation per endpoint', () => {
    const html = renderEditor(baseConnector, []);
    expect(html).toContain('out');
    expect(html).toContain('conjugated');
  });

  it('surfaces typed rejection diagnostics for direction, context, delegation, duplicates, and item flow', () => {
    const diagnostics: SysmlDiagnostic[] = [
      { code: 'INCOMPATIBLE_DIRECTION', severity: 'error', elementId: 'c2', message: 'out cannot connect to out' },
      { code: 'INVALID_CONNECTOR_CONTEXT', severity: 'error', elementId: 'c2', message: 'cross-context edge' },
      { code: 'INVALID_DELEGATION_ENDPOINTS', severity: 'error', elementId: 'c2', message: 'needs boundary port' },
      { code: 'DUPLICATE_CONNECTOR', severity: 'error', elementId: 'c2', message: 'duplicates c1' },
      { code: 'MISSING_ITEM_FLOW_TYPE', severity: 'error', elementId: 'c2', message: 'conveyed type missing' },
      { code: 'INVALID_ITEM_FLOW_DIRECTION', severity: 'error', elementId: 'c2', message: 'flow contradicts direction' },
      { code: 'INCOMPATIBLE_INTERFACE', severity: 'error', elementId: 'c2', message: 'interfaces differ' },
      { code: 'UNRESOLVED_IMPORT', severity: 'error', elementId: 'c2', message: 'import unresolved' },
    ];
    const html = renderEditor(baseConnector, diagnostics);
    for (const d of diagnostics) {
      expect(html).toContain(d.code);
      expect(html).toContain(d.message);
    }
  });
});
