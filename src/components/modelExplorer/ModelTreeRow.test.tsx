import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModelTreeRow, getNodeKindIcon, nodeKindToPresentationRole } from './ModelTreeRow';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

describe('ModelTreeRow', () => {
  const nodeWithChildren: ModelTreeNode = {
    nodeId: 'node-1',
    semanticId: 'block-1',
    domain: 'sysml',
    kind: 'block',
    label: 'EngineBlock',
    secondaryLabel: ': Block',
    parentNodeId: null,
    childNodeIds: ['part-1'],
    hasChildren: true,
    badges: [{ label: '«block»', kind: 'info' }],
  };

  const leafNode: ModelTreeNode = {
    nodeId: 'node-2',
    semanticId: 'state-1',
    domain: 'stateMachine',
    kind: 'state',
    label: 'IdleState',
    parentNodeId: 'node-1',
    childNodeIds: [],
    hasChildren: false,
  };

  it('renders row label, secondaryLabel, badges, and chevron for nodes with children', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={nodeWithChildren}
        depth={0}
        index={0}
        isExpanded={false}
        isSelected={false}
        isFocused={true}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('EngineBlock');
    expect(html).toContain(': Block');
    expect(html).toContain('«block»');
    expect(html).toContain('aria-label="Expand"');
  });

  it('renders Collapse chevron when node is expanded', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={nodeWithChildren}
        depth={0}
        index={0}
        isExpanded={true}
        isSelected={true}
        isFocused={true}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Collapse"');
    expect(html).toContain('border-[var(--focus-ring)]'); // Selected styling
  });

  it('renders leaf node without expand button', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={leafNode}
        depth={1}
        index={1}
        isExpanded={false}
        isSelected={false}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('IdleState');
    expect(html).not.toContain('aria-label="Expand"');
    expect(html).not.toContain('aria-label="Collapse"');
  });

  it('renders input element when isRenaming is true', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={nodeWithChildren}
        depth={0}
        index={0}
        isExpanded={false}
        isSelected={true}
        isFocused={true}
        isRenaming={true}
        renameValue="NewEngineName"
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('<input');
    expect(html).toContain('value="NewEngineName"');
  });

  it('provides icons for domain metatypes', () => {
    const blockIconHtml = renderToStaticMarkup(getNodeKindIcon('block', 'sysml'));
    const stateIconHtml = renderToStaticMarkup(getNodeKindIcon('state', 'state_machine'));
    const diagramIconHtml = renderToStaticMarkup(getNodeKindIcon('diagram', 'sysml'));

    expect(blockIconHtml).toContain('<svg');
    expect(stateIconHtml).toContain('<svg');
    expect(diagramIconHtml).toContain('<svg');
  });

  it('backs tree glyph colors with centralized semantic tokens, never hard-coded Tailwind palette colors', () => {
    const cases: Array<[string, string]> = [
      ['block', 'var(--sysml-sem-block)'],
      ['part', 'var(--sysml-sem-block)'],
      ['requirement', 'var(--sysml-sem-requirement)'],
      ['testCase', 'var(--sysml-sem-requirement)'],
      ['state', 'var(--sysml-sem-state)'],
      ['state_machine', 'var(--sysml-sem-state)'],
      ['region', 'var(--sysml-sem-state)'],
      ['pseudostate', 'var(--sysml-sem-state)'],
      ['junction', 'var(--sysml-sem-state)'],
      ['transition', 'var(--sysml-sem-state)'],
      ['port', 'var(--sysml-sem-standard-port)'],
      ['standard', 'var(--sysml-sem-standard-port)'],
      ['proxyPort', 'var(--sysml-sem-proxy-port)'],
      ['proxy', 'var(--sysml-sem-proxy-port)'],
      ['fullPort', 'var(--sysml-sem-full-port)'],
      ['full', 'var(--sysml-sem-full-port)'],
      ['flowPort', 'var(--sysml-sem-flow-port)'],
      ['flow', 'var(--sysml-sem-flow-port)'],
    ];
    for (const [kind, token] of cases) {
      const html = renderToStaticMarkup(getNodeKindIcon(kind, 'sysml'));
      expect(html, `${kind} glyph resolves to ${token}`).toContain(token);
    }

    // Kinds without a dedicated semantic role fall back to the neutral
    // requirement token through the same resolver.
    for (const kind of ['package', 'diagram', 'model', 'constraint', 'group', 'unknown-kind']) {
      expect(nodeKindToPresentationRole(kind)).toBe('requirement');
      expect(renderToStaticMarkup(getNodeKindIcon(kind, 'sysml'))).toContain('var(--sysml-sem-requirement)');
    }

    // No hard-coded Tailwind palette colors remain on any glyph.
    const hardCoded = [
      'text-pink-400', 'text-purple-400', 'text-emerald-400', 'text-cyan-400',
      'text-yellow-400', 'text-sky-400', 'text-indigo-400', 'text-violet-400',
      'text-teal-400', 'text-amber-400', 'text-orange-400', 'text-red-400', 'text-lime-400',
    ];
    const allKinds = ['model', 'package', 'block', 'part', 'port', 'proxyPort', 'fullPort', 'flowPort',
      'constraint', 'requirement', 'diagram', 'state_machine', 'region', 'state',
      'xbridgesModel', 'vlabModel', 'pseudostate', 'junction', 'transition', 'other'];
    for (const kind of allKinds) {
      const html = renderToStaticMarkup(getNodeKindIcon(kind, 'sysml'));
      for (const cls of hardCoded) {
        expect(html, `${kind} glyph must not use ${cls}`).not.toContain(cls);
      }
    }
  });

  it('keeps distinct non-color icon shapes per kind (color is never the sole indicator)', () => {
    const shapeOf = (kind: string) =>
      renderToStaticMarkup(getNodeKindIcon(kind, 'sysml')).replace(/\sstyle="[^"]*"/, '');
    const shapes = new Map<string, string>();
    for (const kind of ['block', 'part', 'port', 'proxyPort', 'requirement', 'state', 'diagram']) {
      const html = renderToStaticMarkup(getNodeKindIcon(kind, 'sysml'));
      expect(html).toContain('<svg');
      shapes.set(kind, shapeOf(kind));
    }
    // Port sub-kinds share the CircleDot shape (color carries the sub-kind);
    // block/part keep their own shapes.
    expect(shapes.get('port')).toBe(shapes.get('proxyPort'));
    expect(shapes.get('block')).not.toBe(shapes.get('part'));
    expect(shapes.get('block')).not.toBe(shapes.get('requirement'));
  });
});
