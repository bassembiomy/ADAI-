import { describe, expect, it } from 'vitest';
import type { CapabilityKind, ExplorerCapability, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { capabilityToAction, explorerAdapterDomain, type CapabilityActionContext } from './AppModelExplorer';

describe('AppModelExplorer Capability Coverage', () => {
  it('routes a State Machine node by its domain even in a SysML editor', () => {
    expect(explorerAdapterDomain({ ...selectedNode, domain: 'stateMachine' })).toBe('stateMachine');
    expect(explorerAdapterDomain({ ...selectedNode, domain: 'sysml' })).toBe('sysml');
  });
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
    'createDiagram',
    'createRelationship',
    'rename',
    'move',
    'copy',
    'paste',
    'duplicate',
    'delete',
    'addToDiagram',
    'openSpecification',
    'reveal',
  ] as const)('handles enabled %s capabilities', capabilityKind => {
    const result = capabilityToAction(enabledCapability(capabilityKind), selectedNode, context);
    expect(result.kind).not.toBe('unhandled');
  });
});
