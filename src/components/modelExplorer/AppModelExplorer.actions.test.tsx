// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from '../../engine/sysml/model';
import {
  buildCanonicalSysmlProjectPayload,
  createSysmlGatewayState,
  executeSysmlCommand,
  loadCanonicalSysmlProject,
  type SysmlEditorCommand,
} from '../../services/sysmlCommandGateway';
import type { CapabilityKind, ExplorerCapability, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { buildUnifiedModelProjection } from '../../features/modelExplorer/unifiedModelExplorerProjection';
import { AppModelExplorer, capabilityToAction, explorerAdapterDomain, filterNonCreatingCapabilities, gateClipboardCapabilities, resolveCreationContext, type CapabilityActionContext } from './AppModelExplorer';

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

it('Create New Type resumes a pending Proxy Port without a canonical repository prop', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const initial = createEmptyRepository();
  const owner: BlockDefinition = { id: 'owner', name: 'Owner', kind: 'block', ownerId: 'model', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  initial.definitions[owner.id] = owner;
  let gateway = createSysmlGatewayState(initial);
  const calls: SysmlEditorCommand[] = [];
  const { container } = render(<AppModelExplorer diagramMode="bdd" states={[]} layers={[]} transitions={[]} junctions={[]} blocks={[{ id: owner.id, name: owner.name } as any]} parts={[]} selectedIds={[]} onSelect={vi.fn()} onDoubleClick={vi.fn()} onExecuteSysmlCommand={(cmd) => {
    calls.push(cmd);
    const result = executeSysmlCommand(gateway, cmd);
    if (result.committed) gateway = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
    return result;
  }} />);
  const row = container.querySelector('.model-tree-row[data-node-id="sysml:element:owner"]');
  expect(row).not.toBeNull();
  fireEvent.contextMenu(row!);
  fireEvent.click(screen.getByRole('menuitem', { name: /^Proxy Port$/ }));
  fireEvent.click(screen.getByRole('button', { name: /Create New Type/i }));
  await waitFor(() => expect(calls).toHaveLength(2));
  const interfaces = Object.values(gateway.repository.definitions).filter(definition => definition.kind === 'interface');
  expect(interfaces).toHaveLength(1);
  const ports = (gateway.repository.definitions[owner.id] as BlockDefinition).ports;
  expect(ports).toHaveLength(1);
  expect(ports[0]).toMatchObject({ kind: 'proxy', typeId: interfaces[0].id });
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

  it('tree activation callback receives the exact diagram semantic ID and kind', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const repo = createEmptyRepository();
    repo.diagrams['bdd-powertrain-1'] = {
      id: 'bdd-powertrain-1',
      name: 'Powertrain BDD',
      ownerId: 'model',
      namespace: [],
      kind: 'diagram',
      diagramKind: 'bdd',
    };
    const onDoubleClick = vi.fn();
    const { container } = render(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        canonicalSysmlRepository={repo}
        onSelect={vi.fn()}
        onDoubleClick={onDoubleClick}
      />
    );
    const row = container.querySelector('.model-tree-row[data-node-id="sysml:element:bdd-powertrain-1"]');
    expect(row).not.toBeNull();
    fireEvent.doubleClick(row!);
    expect(onDoubleClick).toHaveBeenCalledWith('bdd-powertrain-1', 'diagram');
  });

  it('uses the pillar owner instead of the virtual pillar ID for a new BDD', () => {
    const structural: ModelTreeNode = {
      nodeId: 'project:pillar:structural',
      semanticId: 'project:pillar:structural',
      domain: 'project',
      kind: 'pillar',
      virtualKind: 'structural',
      label: 'Structural',
      parentNodeId: 'project:model',
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: false,
    };
    const capability: ExplorerCapability = {
      id: 'createDiagram:bdd',
      kind: 'createDiagram',
      label: 'Block Definition Diagram (BDD)',
      enabled: true,
      elementKind: 'bdd',
    };
    expect(capabilityToAction(capability, structural, {})).toMatchObject({
      kind: 'command',
      command: { type: 'createDiagram', ownerId: 'model', diagramKind: 'bdd' },
    });
  });

  it('uses the root owner for a new State Machine Diagram from the Behavior pillar', () => {
    const behavior: ModelTreeNode = {
      nodeId: 'project:pillar:behavior',
      semanticId: 'project:pillar:behavior',
      domain: 'project',
      kind: 'pillar',
      virtualKind: 'behavior',
      label: 'Behavior',
      parentNodeId: 'project:model',
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: false,
    };
    const capability: ExplorerCapability = {
      id: 'createDiagram:stateMachine',
      kind: 'createDiagram',
      label: 'State Machine Diagram',
      enabled: true,
      elementKind: 'stateMachine',
    };
    expect(capabilityToAction(capability, behavior, {})).toMatchObject({
      kind: 'command',
      command: { type: 'createDiagram', ownerId: 'root', diagramKind: 'stateMachine' },
    });
  });

  it('uses the model owner for a new Requirements Diagram from the Requirements pillar', () => {
    const requirements: ModelTreeNode = {
      nodeId: 'project:pillar:requirements',
      semanticId: 'project:pillar:requirements',
      domain: 'project',
      kind: 'pillar',
      virtualKind: 'requirements',
      label: 'Requirements',
      parentNodeId: 'project:model',
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: false,
    };
    const capability: ExplorerCapability = {
      id: 'createDiagram:requirements',
      kind: 'createDiagram',
      label: 'Requirements Diagram',
      enabled: true,
      elementKind: 'requirements',
    };
    expect(capabilityToAction(capability, requirements, {})).toMatchObject({
      kind: 'command',
      command: { type: 'createDiagram', ownerId: 'model', diagramKind: 'requirements' },
    });
  });

  it('uses the element semantic ID as owner for a new diagram from a block node', () => {
    const block: ModelTreeNode = {
      nodeId: 'sysml:element:block-1',
      semanticId: 'block-1',
      domain: 'sysml',
      kind: 'block',
      label: 'Engine',
      parentNodeId: 'project:pillar:structural',
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: false,
    };
    const capability: ExplorerCapability = {
      id: 'createDiagram:bdd',
      kind: 'createDiagram',
      label: 'Block Definition Diagram (BDD)',
      enabled: true,
      elementKind: 'bdd',
    };
    expect(capabilityToAction(capability, block, {})).toMatchObject({
      kind: 'command',
      command: { type: 'createDiagram', ownerId: 'block-1', diagramKind: 'bdd' },
    });
  });

  it('records the owning Block as the context for a new IBD diagram', () => {
    const block: ModelTreeNode = {
      nodeId: 'sysml:element:block-1',
      semanticId: 'block-1',
      domain: 'sysml',
      kind: 'block',
      label: 'Engine',
      parentNodeId: 'project:pillar:structural',
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: false,
    };
    const capability: ExplorerCapability = {
      id: 'createDiagram:ibd',
      kind: 'createDiagram',
      label: 'Internal Block Diagram (IBD)',
      enabled: true,
      elementKind: 'ibd',
    };
    expect(capabilityToAction(capability, block, {})).toMatchObject({
      kind: 'command',
      command: { type: 'createDiagram', ownerId: 'block-1', diagramKind: 'ibd', contextElementId: 'block-1' },
    });
  });

  it('uses the region semantic ID as owner for a new diagram from an SM region node', () => {
    const region: ModelTreeNode = {
      nodeId: 'sm:region:region-1',
      semanticId: 'region-1',
      domain: 'stateMachine',
      kind: 'region',
      label: 'Region 1',
      parentNodeId: 'sm:state:s1',
      childNodeIds: [],
      hasChildren: false,
    };
    const capability: ExplorerCapability = {
      id: 'createDiagram:stateMachine',
      kind: 'createDiagram',
      label: 'State Machine Diagram',
      enabled: true,
      elementKind: 'stateMachine',
    };
    expect(capabilityToAction(capability, region, {})).toMatchObject({
      kind: 'command',
      command: { type: 'createDiagram', ownerId: 'region-1', diagramKind: 'stateMachine' },
    });
  });

  it('routes Behavior pillar State Machine creation to the SM store with owner root', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const repository = createEmptyRepository();
    const onExecute = vi.fn();
    const onCommit = vi.fn();
    const onCommandResult = vi.fn();
    const { container } = render(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[{ id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], junctionIds: [], transitionIds: [] }]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        canonicalSysmlRepository={repository}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onCommitStateMachineSnapshot={onCommit}
        onExecuteSysmlCommand={onExecute}
        onCommandResult={onCommandResult}
      />
    );
    const behaviorRow = container.querySelector('.model-tree-row[data-node-id="project:pillar:behavior"]');
    expect(behaviorRow).not.toBeNull();
    fireEvent.contextMenu(behaviorRow!);
    fireEvent.click(screen.getByRole('menuitem', { name: /^State Machine Diagram$/ }));
    expect(onExecute).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    const created = committed.diagrams[committed.diagrams.length - 1];
    expect(created).toMatchObject({ ownerId: 'root', contextRegionId: 'root' });
    expect(onCommandResult).toHaveBeenCalledWith(
      expect.objectContaining({ committed: true }),
      expect.objectContaining({ type: 'createDiagram', ownerId: 'root' }),
    );
  });
});

function explorerDiagramNode(id: string, domain: 'sysml' | 'stateMachine' = 'sysml'): ModelTreeNode {
  return {
    nodeId: domain === 'sysml' ? `sysml:element:${id}` : `sm:diagram:${id}`,
    semanticId: id,
    domain,
    kind: 'diagram',
    label: id,
    parentNodeId: domain === 'sysml' ? 'project:pillar:structural' : 'project:pillar:behavior',
    childNodeIds: [],
    hasChildren: false,
  };
}

function repositoryWithDiagrams(): SysmlRepository {
  const repository = createEmptyRepository();
  repository.definitions['block-1'] = {
    id: 'block-1', name: 'Engine', namespace: ['model'], ownerId: 'model', kind: 'block',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  repository.diagrams['bdd-1'] = {
    id: 'bdd-1', name: 'Engine BDD', namespace: ['model'], ownerId: 'model', kind: 'diagram', diagramKind: 'bdd',
  };
  repository.diagrams['req-diagram-1'] = {
    id: 'req-diagram-1', name: 'Safety Requirements', namespace: ['model'], ownerId: 'model',
    kind: 'diagram', diagramKind: 'requirements',
  };
  // The canonical SysML domain accepts a parametric DiagramKind; the legacy V3
  // record type is narrower than the domain it serializes.
  repository.diagrams['parametric-1'] = {
    id: 'parametric-1', name: 'Engine Parametric', namespace: ['model'], ownerId: 'block-1',
    kind: 'diagram', diagramKind: 'parametric',
  } as unknown as SysmlRepository['diagrams'][string];
  return repository;
}

function stateMachineWithDiagram() {
  return {
    states: [],
    layers: [{ id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }],
    transitions: [],
    junctions: [],
    diagrams: [{ id: 'nested-sm-1', name: 'Nested SM', ownerId: 'region-1', contextRegionId: 'region-1' }],
    revision: 1,
  };
}

describe('AppModelExplorer diagram-context creation', () => {
  const diagramNode = explorerDiagramNode;

  it('resolves diagram rows to a legal semantic owner plus the initiating diagram', () => {
    const repository = repositoryWithDiagrams();
    const stateMachine = stateMachineWithDiagram();

    expect(resolveCreationContext(diagramNode('bdd-1'), repository, stateMachine))
      .toEqual({ ownerId: 'model', diagramId: 'bdd-1' });
    expect(resolveCreationContext(diagramNode('req-diagram-1'), repository, stateMachine))
      .toEqual({ ownerId: 'model', diagramId: 'req-diagram-1' });
    expect(resolveCreationContext(diagramNode('parametric-1'), repository, stateMachine))
      .toEqual({ ownerId: 'block-1', diagramId: 'parametric-1' });
    expect(resolveCreationContext(diagramNode('nested-sm-1', 'stateMachine'), repository, stateMachine))
      .toEqual({ ownerId: 'region-1', diagramId: 'nested-sm-1' });
    // Non-diagram rows keep their own semantic identity and initiate no presentation.
    expect(resolveCreationContext({ ...diagramNode('block-1'), kind: 'block' }, repository, stateMachine))
      .toEqual({ ownerId: 'block-1' });
  });

  it('creates a model-owned Block from a BDD diagram row and presents it on that diagram', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const repository = repositoryWithDiagrams();
    const calls: SysmlEditorCommand[] = [];
    let gateway = createSysmlGatewayState(repository);
    const { container } = render(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        canonicalSysmlRepository={repository}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onExecuteSysmlCommand={(cmd) => {
          calls.push(cmd);
          const result = executeSysmlCommand(gateway, cmd);
          if (result.committed) {
            gateway = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
          }
          return result;
        }}
      />
    );

    const row = container.querySelector('.model-tree-row[data-node-id="sysml:element:bdd-1"]');
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getAllByRole('menuitem', { name: /^Block$/ })[0]);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      type: 'createElement',
      element: { kind: 'block', ownerId: 'model' },
    });
    expect(calls[1]).toMatchObject({
      type: 'addToDiagram',
      diagramId: 'bdd-1',
      elementIds: [expect.any(String)],
    });
    const createdBlockId = (calls[1] as Extract<SysmlEditorCommand, { type: 'addToDiagram' }>).elementIds[0];
    expect(gateway.repository.definitions[createdBlockId]).toMatchObject({ kind: 'block', ownerId: 'model' });
    expect(gateway.diagramPresentations?.['bdd-1']?.elementIds ?? []).toContain(createdBlockId);
  });

  it('creates a model-owned Requirement from a requirements diagram row and presents it', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const repository = repositoryWithDiagrams();
    const calls: SysmlEditorCommand[] = [];
    let gateway = createSysmlGatewayState(repository);
    const { container } = render(
      <AppModelExplorer
        diagramMode="requirements"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        canonicalSysmlRepository={repository}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onExecuteSysmlCommand={(cmd) => {
          calls.push(cmd);
          const result = executeSysmlCommand(gateway, cmd);
          if (result.committed) {
            gateway = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
          }
          return result;
        }}
      />
    );

    const row = container.querySelector('.model-tree-row[data-node-id="sysml:element:req-diagram-1"]');
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getAllByRole('menuitem', { name: /^Requirement$/ })[0]);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      type: 'createElement',
      element: { kind: 'requirement', ownerId: 'model' },
    });
    expect(calls[1]).toMatchObject({
      type: 'addToDiagram',
      diagramId: 'req-diagram-1',
      elementIds: [expect.any(String)],
    });
  });

  it('creates a state from a state-machine diagram row inside the region that diagram renders', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const onCommit = vi.fn();
    const onExecute = vi.fn();
    const { container } = render(
      <AppModelExplorer
        diagramMode="statemachine"
        states={[
          {
            id: 's1', name: 'S1', x: 0, y: 0, width: 1, height: 1, entry: '', during: '', exit: '',
            isActive: false, color: '#000', parentId: 'root', children: ['region-1'], priority: 0,
            isParallel: false, regionId: 'root', autostart: false,
          },
        ]}
        layers={[
          { id: 'root', name: 'Root Region', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] },
          { id: 'region-1', name: 'Region 1', parentStateId: 's1', stateIds: [], transitionIds: [], junctionIds: [] },
        ]}
        transitions={[]}
        junctions={[]}
        diagrams={[{ id: 'nested-sm-1', name: 'Nested SM', ownerId: 'region-1', contextRegionId: 'region-1' }]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onCommitStateMachineSnapshot={onCommit}
        onExecuteSysmlCommand={onExecute}
      />
    );

    // Expand the composite state so its region (expanded by default) reveals the
    // nested diagram row.
    fireEvent.doubleClick(container.querySelector('.model-tree-row[data-node-id="sm:state:s1"]')!);
    const row = container.querySelector('.model-tree-row[data-node-id="sm:diagram:nested-sm-1"]');
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole('menuitem', { name: /^State$/ }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    const created = committed.states.find((state: { id: string }) => state.id !== 's1');
    expect(created).toMatchObject({ parentId: 'region-1', regionId: 'region-1' });
    expect(committed.layers.find((layer: { id: string }) => layer.id === 'region-1').stateIds).toContain(created.id);
    // State-machine diagram membership is derived from the region, so no
    // SysML presentation command may be issued.
    expect(onExecute).not.toHaveBeenCalled();
  });
});

describe('Model Explorer diagram grouping lifecycle', () => {
  it('keeps diagram membership undoable, redoable, and persistent across a project round trip', () => {
    const repository = repositoryWithDiagrams();
    const created: BlockDefinition = {
      id: 'blk-created', name: 'Created Block', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };

    const afterCreate = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'createElement',
      element: created,
    });
    expect(afterCreate.committed).toBe(true);
    expect(afterCreate.repository.definitions[created.id]).toBeDefined();

    const afterPresent = executeSysmlCommand(afterCreate, {
      type: 'addToDiagram',
      diagramId: 'bdd-1',
      elementIds: [created.id],
    });
    expect(afterPresent.committed).toBe(true);
    expect(afterPresent.diagramPresentations['bdd-1'].elementIds).toContain(created.id);

    // Undo removes the presentation only: the element stays in the model.
    const afterUndo = executeSysmlCommand(afterPresent, { type: 'undo' });
    expect(afterUndo.diagramPresentations['bdd-1']?.elementIds ?? []).not.toContain(created.id);
    expect(afterUndo.repository.definitions[created.id]).toBeDefined();

    const afterRedo = executeSysmlCommand(afterUndo, { type: 'redo' });
    expect(afterRedo.diagramPresentations['bdd-1'].elementIds).toContain(created.id);

    // The presentation survives the project persistence path and still drives
    // the containment grouping after a reload.
    const payload = JSON.parse(JSON.stringify(
      buildCanonicalSysmlProjectPayload(afterRedo, { version: '1.0', projectName: 'Grouping' }),
    ));
    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.valid).toBe(true);
    const projection = buildUnifiedModelProjection({
      sysml: loaded.repository,
      stateMachine: stateMachineWithDiagram(),
      externalModels: [],
      revision: loaded.repository.revision,
      diagramPresentations: loaded.diagramPresentations,
    });

    expect(projection.nodes[`sysml:element:${created.id}`]).toMatchObject({
      parentNodeId: 'sysml:element:bdd-1',
      ownerSemanticId: 'model',
    });
  });
});
