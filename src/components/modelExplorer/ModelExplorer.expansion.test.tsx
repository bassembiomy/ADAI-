// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ModelExplorer } from './ModelExplorer';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

it('preserves expanded block assignments when toggling an interaction and reopening the block', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const nodes: Record<string, ModelTreeNode> = {};
  for (const [id, kind, parent, children] of [
    ['root', 'package', null, ['block']],
    ['block', 'block', 'root', ['interaction', 'diagram']],
    ['interaction', 'interaction', 'block', ['message']],
    ['diagram', 'diagram', 'block', []],
    ['message', 'message', 'interaction', []],
  ] as const) {
    nodes[id] = { nodeId: id, semanticId: id, domain: 'sysml', kind,
      label: id, parentNodeId: parent, childNodeIds: [...children], hasChildren: children.length > 0 };
  }
  const roots = ['root'];
  function Harness() {
    const [expanded, setExpanded] = useState(new Set(['root']));
    const [selected, setSelected] = useState(new Set<string>());
    return <ModelExplorer nodesById={nodes} rootNodeIds={roots} height={400}
      expandedNodeIds={expanded} onExpandedNodeIdsChange={setExpanded}
      selectedNodeIds={selected} onSelectNode={node => setSelected(new Set([node.nodeId]))} />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const row = (id: string) => host.querySelector(`[data-node-id="${id}"]`);
  const toggle = async (id: string) => {
    const button = row(id)?.querySelector('button');
    expect(button).toBeTruthy();
    await act(async () => { button!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  try {
    await act(async () => { root.render(<Harness />); });
    await toggle('block');
    await act(async () => { row('interaction')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(row('diagram')).toBeTruthy();
    await toggle('interaction');
    expect(row('diagram')).toBeTruthy();
    expect(row('message')).toBeTruthy();
    await toggle('block');
    expect(row('interaction')).toBeNull();
    await toggle('block');
    expect(row('diagram')).toBeTruthy();
    expect(row('message')).toBeTruthy();
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
