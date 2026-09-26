import { describe, expect, it } from 'vitest';
import type { CapabilityKind, ExplorerCapability, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { capabilityToAction, explorerAdapterDomain, filterNonCreatingCapabilities, gateClipboardCapabilities, type CapabilityActionContext } from './AppModelExplorer';

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
