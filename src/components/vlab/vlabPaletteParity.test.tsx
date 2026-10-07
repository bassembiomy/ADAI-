// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { VLAB_LIBRARY, type VLabBlock } from '../../utils/vlabLibrary';
import { VLabNode } from './VLabNode';
import { SymbolRenderer } from './VLabSymbols';
import { VLabWorkspace } from './VLabWorkspace';
import { computeNodeLayout, handlesOverlap, HANDLE_SIZE } from './vlabPortLayout';
import { widthOf } from '../../engine/vlab/vlabVectorPorts';

afterEach(cleanup);
const ALL: { block: VLabBlock; domain: string }[] = VLAB_LIBRARY.flatMap(d => d.blocks.map(block => ({ block, domain: d.type })));

// the data a palette drop gives a node (VLabWorkspace.onDrop / addBlockToCenter)
const nodeDataOf = (block: VLabBlock, domain: string) => ({
  label: block.name, type: block.id, icon: block.icon, color: block.color, rotation: 0, domain,
  params: JSON.parse(JSON.stringify(block.params || {})), ports: JSON.parse(JSON.stringify(block.ports || [])),
});

describe('palette <-> node parity', () => {
  it('lists every VLAB_LIBRARY block in the palette with a symbol', async () => {
    (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    const { container } = render(<VLabWorkspace nodes={[]} edges={[]} onNodesChange={() => undefined} onEdgesChange={() => undefined} onResult={() => undefined} onSendToDOE={() => undefined} onBack={() => undefined} />);
    const tiles = [...container.querySelectorAll('[data-block-id]')];
    expect(tiles.map(t => t.getAttribute('data-block-id')).sort()).toEqual(ALL.map(a => a.block.id).sort());
    for (const tile of tiles) expect(tile.querySelector('.vlab-symbol svg, .vlab-symbol *'), `symbol of ${tile.getAttribute('data-block-id')}`).not.toBeNull();
  });

  it('palette icon and node type draw the same symbol for every block', () => {
    const mismatched = ALL.filter(({ block, domain }) => {
      const tile = render(<SymbolRenderer type={block.icon} color={block.color} />); const tileSvg = tile.container.querySelector('svg')!.outerHTML; tile.unmount();
      const node = render(<ReactFlowProvider><VLabNode id="n" data={nodeDataOf(block, domain)} selected={false} /></ReactFlowProvider>);
      const nodeSvg = node.container.querySelector('.vlab-symbol svg')!.outerHTML; node.unmount();
      return tileSvg !== nodeSvg;
    }).map(({ block }) => `${block.id} (icon ${block.icon})`);
    expect(mismatched).toEqual([]);
  });

  it('every block renders handles whose ids are exactly its port ids, at non-overlapping positions per blockDimensions', () => {
    const problems: string[] = [];
    for (const { block, domain } of ALL) {
      const data = nodeDataOf(block, domain);
      const { container, unmount } = render(<ReactFlowProvider><VLabNode id="n" data={data} selected={false} /></ReactFlowProvider>);
      const portIds = block.ports.map(p => p.id);
      if (new Set(portIds).size !== portIds.length) problems.push(`${block.id}: duplicate port ids`);

      // handle ids == port ids (both the source and the target handle of every port)
      for (const type of ['source', 'target']) {
        const ids = [...container.querySelectorAll(`.react-flow__handle.${type}`)].map(h => h.getAttribute('data-handleid')).sort();
        const expected = portIds.map(id => `n-${id}`).sort();
        if (JSON.stringify(ids) !== JSON.stringify(expected)) problems.push(`${block.id}: ${type} handles ${ids} != ports ${expected}`);
      }

      // handle placement follows `pos`, positions never overlap
      const layout = computeNodeLayout(block.id, block.ports);
      const slots = block.ports.map(p => layout.slots.get(p.id)!);
      slots.forEach((s, i) => { if (s.side !== block.ports[i].pos) problems.push(`${block.id}.${block.ports[i].id}: placed ${s.side}, pos ${block.ports[i].pos}`); });
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++)
        if (handlesOverlap(slots[i], slots[j])) problems.push(`${block.id}: ${slots[i].id} overlaps ${slots[j].id}`);
      for (const s of slots) if (s.x < 0 || s.y < 0 || s.x > layout.width || s.y > layout.height) problems.push(`${block.id}.${s.id}: outside the block box`);

      // the rendered wrappers carry the same layout (px offsets are in the wrapper style)
      for (const p of block.ports) {
        const wrapper = container.querySelector(`[data-port-id="${p.id}"]`) as HTMLElement | null;
        if (!wrapper) { problems.push(`${block.id}.${p.id}: no wrapper`); continue; }
        const offset = layout.slots.get(p.id)!.offset;
        const styleProp = (p.pos === 'left' || p.pos === 'right') ? wrapper.style.top : wrapper.style.left;
        // `calc(50% + <offset>px - 6px)`, which the DOM normalises to `calc(50% + <offset - 6>px)`
        const m = styleProp.match(/calc\(50% ([+-]) ([\d.]+)px\)/);
        const px = m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) : (styleProp === '50%' ? 0 : NaN);
        if (px !== offset - HANDLE_SIZE / 2) problems.push(`${block.id}.${p.id}: style ${styleProp} != offset ${offset}`);
      }
      unmount();
    }
    expect(problems).toEqual([]);
  });

  it('draws composite / vector ports with a thick ring and a tooltip with width and channel names; tooltips carry domain / direction / quantity / unit', () => {
    let vectors = 0; let quantities = 0;
    for (const { block, domain } of ALL) {
      const { container, unmount } = render(<ReactFlowProvider><VLabNode id="n" data={nodeDataOf(block, domain)} selected={false} /></ReactFlowProvider>);
      for (const p of block.ports) {
        const handle = container.querySelector(`.react-flow__handle.source[data-handleid="n-${p.id}"]`)!;
        const title = handle.getAttribute('title') ?? '';
        expect(title, `${block.id}.${p.id} domain`).toMatch(/domain: /);
        expect(title, `${block.id}.${p.id} direction`).toMatch(/direction: /);
        const isVector = widthOf(p) > 1 || !!p.composite;
        expect(handle.classList.contains('vlab-handle-vector'), `${block.id}.${p.id} vector ring`).toBe(isVector);
        if (isVector) {
          vectors++;
          expect(title).toContain(`[${widthOf(p)}`);
          const names = p.composite ? ['a', 'b', 'c'] : (p.channelNames ?? []);
          for (const n of names) expect(title).toContain(n);
        }
        if (p.quantity) {
          quantities++;
          expect(title).toContain(`quantity: ${p.quantity}`);
          if (p.unit && p.unit !== '*') expect(title).toContain(`[${p.unit}]`);
        }
      }
      unmount();
    }
    expect(vectors).toBeGreaterThan(0);
    expect(quantities).toBeGreaterThan(0);
  });
});
