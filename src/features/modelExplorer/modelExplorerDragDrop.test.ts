import { describe, expect, it } from 'vitest';
import {
  classifyTreeDropTarget,
  createModelExplorerDragPayload,
  parseModelExplorerDragData,
  MIME_TYPE_MODEL_ELEMENT,
} from './modelExplorerDragDrop';
import type { ModelTreeNode } from './modelExplorerTypes';

describe('modelExplorerDragDrop', () => {
  const nodes: Record<string, ModelTreeNode> = {
    root: {
      nodeId: 'root',
      semanticId: 'pkg-root',
      domain: 'sysml',
      kind: 'package',
      label: 'Root',
      parentNodeId: null,
      childNodeIds: ['subpkg', 'engine'],
      hasChildren: true,
    },
    subpkg: {
      nodeId: 'subpkg',
      semanticId: 'pkg-sub',
      domain: 'sysml',
      kind: 'package',
      label: 'SubPackage',
      parentNodeId: 'root',
      childNodeIds: ['part-a'],
      hasChildren: true,
    },
    part_a: {
      nodeId: 'part-a',
      semanticId: 'part-1',
      domain: 'sysml',
      kind: 'part',
      label: 'PartA',
      parentNodeId: 'subpkg',
      childNodeIds: [],
      hasChildren: false,
    },
    engine: {
      nodeId: 'engine',
      semanticId: 'blk-engine',
      domain: 'sysml',
      kind: 'block',
      label: 'Engine',
      parentNodeId: 'root',
      childNodeIds: [],
      hasChildren: false,
    },
  };

  it('classifies valid reparent target correctly', () => {
    const classification = classifyTreeDropTarget({
      draggedNode: nodes.part_a,
      targetNode: nodes.engine,
      nodesById: nodes,
    });

    expect(classification.allowed).toBe(true);
    expect(classification.type).toBe('reparent');
  });

  it('rejects dropping onto self or descendant cycles', () => {
    const ontoSelf = classifyTreeDropTarget({
      draggedNode: nodes.root,
      targetNode: nodes.root,
      nodesById: nodes,
    });
    expect(ontoSelf.allowed).toBe(false);
    expect(ontoSelf.reason).toMatch(/cycle|self/i);

    const ontoDescendant = classifyTreeDropTarget({
      draggedNode: nodes.root,
      targetNode: nodes.subpkg,
      nodesById: nodes,
    });
    expect(ontoDescendant.allowed).toBe(false);
    expect(ontoDescendant.reason).toMatch(/cycle|descendant/i);
  });

  it('rejects dropping into incompatible metatypes', () => {
    // Cannot drop package into part
    const incompatible = classifyTreeDropTarget({
      draggedNode: nodes.subpkg,
      targetNode: nodes.part_a,
      nodesById: nodes,
    });
    expect(incompatible.allowed).toBe(false);
  });

  it('creates and parses drag-and-drop presentation payloads for canvas drops', () => {
    const payload = createModelExplorerDragPayload(nodes.engine);
    expect(payload.semanticId).toBe('blk-engine');
    expect(payload.domain).toBe('sysml');
    expect(payload.kind).toBe('block');

    const fakeDataTransfer = {
      getData: (format: string) => {
        if (format === MIME_TYPE_MODEL_ELEMENT) {
          return JSON.stringify(payload);
        }
        return '';
      },
    };

    const parsed = parseModelExplorerDragData(fakeDataTransfer);
    expect(parsed).toEqual(payload);
  });
});
