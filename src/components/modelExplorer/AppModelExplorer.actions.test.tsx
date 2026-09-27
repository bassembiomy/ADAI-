// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlEditorCommand } from '../../services/sysmlCommandGateway';
import type { CapabilityKind, ExplorerCapability, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { AppModelExplorer, capabilityToAction, explorerAdapterDomain, filterNonCreatingCapabilities, gateClipboardCapabilities, type CapabilityActionContext } from './AppModelExplorer';

afterEach(cleanup);

it('tree Proxy Port waits for a selected Interface Block and cancellation creates nothing', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const repo = createEmptyRepository();
  const owner: BlockDefinition = { id: 'block-owner', name: 'Owner', kind: 'block', ownerId: 'model', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.definitions[owner.id] = owner;
  repo.definitions['if-signal'] = { id: 'if-signal', name: 'Signal', kind: 'interface', namespace: [], ownerId: 'model', features: [] };
  let gateway = createSysmlGatewayState(repo);
  const onExecute = vi.fn((cmd: SysmlEditorCommand) => {
    const result = executeSysmlCommand(gateway, cmd);
    if (result.committed) gateway = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
    return result;
  });
  const { container } = render(<AppModelExplorer diagramMode="bdd" states={[]} layers={[]} transitions={[]} junctions={[]} blocks={[]} parts={[]} selectedIds={[]} canonicalSysmlRepository={repo} onSelect={vi.fn()} onDoubleClick={vi.fn()} onExecuteSysmlCommand={onExecute} />);
  const row = container.querySelector('.model-tree-row[data-node-id="sysml:element:block-owner"]');
  expect(row).not.toBeNull();
  fireEvent.contextMenu(row!);
  fireEvent.click(screen.getByRole('menuitem', { name: /^Proxy Port$/ }));
  expect(screen.getByRole('dialog', { name: /Select Type for Proxy Port/i })).toBeTruthy();
  expect(onExecute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog', { name: /Select Type/i })).toBeNull();
  expect(onExecute).not.toHaveBeenCalled();
  fireEvent.contextMenu(row!);
  fireEvent.click(screen.getByRole('menuitem', { name: /^Proxy Port$/ }));
  fireEvent.click(screen.getByRole('button', { name: /Signal/ }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
  expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ type: 'createOwnedFeature', intent: expect.objectContaining({ ownerBlockId: owner.id, portKind: 'proxyPort', typeId: 'if-signal' }) }));
});

it('tree Create New Type commits a canonical Interface Block before resuming Proxy Port creation', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const initial = createEmptyRepository();
  initial.definitions.owner = { id: 'owner', name: 'Owner', kind: 'block', ownerId: 'model', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  const calls: SysmlEditorCommand[] = [];
  function Harness() {
    const [repo, setRepo] = React.useState(initial);
    const gateway = React.useRef(createSysmlGatewayState(initial));
    return <AppModelExplorer diagramMode="bdd" states={[]} layers={[]} transitions={[]} junctions={[]} blocks={[]} parts={[]} selectedIds={[]} canonicalSysmlRepository={repo} onSelect={vi.fn()} onDoubleClick={vi.fn()} onExecuteSysmlCommand={(cmd) => {
      calls.push(cmd);
      const result = executeSysmlCommand(gateway.current, cmd);
      if (result.committed) {
        gateway.current = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
        setRepo(result.repository);
      }
      return result;
    }} />;
  }
  const { container } = render(<Harness />);
  const row = container.querySelector('.model-tree-row[data-node-id="sysml:element:owner"]');
  expect(row).not.toBeNull();
  fireEvent.contextMenu(row!);
  fireEvent.click(screen.getByRole('menuitem', { name: /^Proxy Port$/ }));
  expect(screen.getByText(/No compatible existing types/i)).toBeTruthy();
  expect(calls).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: /Create New Type/i }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0]).toMatchObject({ type: 'createElement', element: { kind: 'interface' } });
  expect(calls[1]).toMatchObject({ type: 'createOwnedFeature', intent: { portKind: 'proxyPort', typeId: expect.any(String) } });
});

describe('AppModelExplorer Capability Coverage', () => {
  it('routes a State Machine node by its domain even in a SysML editor', () => {
    expect(explorerAdapterDomain({ ...selectedNode, domain: 'stateMachine' })).toBe('stateMachine');
    expect(explorerAdapterDomain({ ...selectedNode, domain: 'sysml' })).toBe('sysml');
  });

  it('keeps repository creation actions in the context menu', () => {
    const capabilities: ExplorerCapability[] = [
      enabledCapability('createElement'),
      enabledCapability('createOwnedFeature'),
      enabledCapability('createDiagram'),
      enabledCapability('rename'),
      enabledCapability('addToDiagram'),
    ];
    expect(filterNonCreatingCapabilities(capabilities).map(capability => capability.kind)).toEqual([
      'createElement',
      'createOwnedFeature',
      'createDiagram',
      'rename',
      'addToDiagram',
    ]);
  });

  it('disables Paste until a same-domain clipboard payload exists', () => {
    const paste = enabledCapability('paste');
    expect(gateClipboardCapabilities([paste], null, 'sysml')[0]).toMatchObject({
      enabled: false,
      reason: 'Copy an element first to enable Paste.',
    });

    const sysmlClipboard = {
      domain: 'sysml' as const,
      rootIds: ['block-1'],
      snapshots: { 'block-1': {} },
      copiedAtRevision: 1,
    };
    expect(gateClipboardCapabilities([paste], sysmlClipboard, 'sysml')[0].enabled).toBe(true);
    expect(gateClipboardCapabilities([paste], sysmlClipboard, 'stateMachine')[0]).toMatchObject({
      enabled: false,
      reason: 'Cannot paste sysml elements into a stateMachine model.',
    });
  });

  it.each(['move', 'duplicate'] as const)(
    'targets semantic owner for %s instead of the parent projection node ID',
    capabilityKind => {
      const projectedNode: ModelTreeNode = {
        ...selectedNode,
        parentNodeId: 'sysml:element:model',
        ownerSemanticId: 'model',
      };
      const result = capabilityToAction(enabledCapability(capabilityKind), projectedNode, context);
      expect(result).toMatchObject({ kind: capabilityKind, targetOwnerId: 'model' });
    },
  );
  const selectedNode: ModelTreeNode = {
    nodeId: 'block-1',
    semanticId: 'block-1',
    domain: 'sysml',
    kind: 'block',
    label: 'Engine',
    parentNodeId: 'model',
    childNodeIds: [],
    hasChildren: false,
  };

  const context: CapabilityActionContext = {
    activeDiagramId: 'diag-bdd-1',
    selectedSemanticIds: ['block-1'],
    hasClipboard: true,
  };

  function enabledCapability(kind: CapabilityKind): ExplorerCapability {
    return {
      id: `cap-${kind}`,
      kind,
      label: `Test ${kind}`,
      enabled: true,
      elementKind: kind === 'createElement' ? 'part' : kind === 'createDiagram' ? 'ibd' : undefined,
      relationshipKind: kind === 'createRelationship' ? 'composition' : undefined,
      direction: 'outgoing',
    };
  }

  it.each([
    'createElement',
    'createOwnedFeature',
    'createDiagram',
    'createRelationship',
    'rename',
    'move',
    'copy',
    'paste',
    'duplicate',
    'delete',
    'addToDiagram',
    'removeFromDiagram',
    'openSpecification',
    'reveal',
  ] as const)('handles enabled %s capabilities', capabilityKind => {
    const result = capabilityToAction(enabledCapability(capabilityKind), selectedNode, context);
    expect(result.kind).not.toBe('unhandled');
  });
});
