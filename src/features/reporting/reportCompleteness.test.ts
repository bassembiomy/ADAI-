import { expect, it } from 'vitest';
import { renderBddDiagram, renderRequirementsDiagram } from './reportDiagrams';
import { createReportSnapshot } from './reportSnapshot';
import { renderInteractiveDiagramHierarchy } from './reportHierarchyEngine';
import type { BlockData } from '../../types/sysml_types';

const block = (id: string, stereotype = 'block'): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'port', name: 'signal', type: 'Real' }] });

it('preserves every relationship across figure boundaries', () => {
  for (const stereotype of ['block', 'requirement']) {
    const blocks = Array.from({ length: 25 }, (_, i) => block(`b${i}`, stereotype));
    const relationships = blocks.slice(1).map((b, i) => ({ id: `r${i}`, sourceId: blocks[i].id, targetId: b.id, type: 'composition' as const, label: '' }));
    const html = (stereotype === 'block' ? renderBddDiagram : renderRequirementsDiagram)({ blocks, relationships });
    for (const r of relationships) expect(html).toContain(`id="edge-${r.id}"`);
  }
});

it('preserves valid boundary connectors and exposes all IBD layers', () => {
  const snapshot = createReportSnapshot({ blocks: [block('system'), block('type')], relationships: [], parts: [{ id: 'part', name: 'part', blockId: 'system', typeId: 'type', x: 0, y: 0, width: 100, height: 80 }], connectors: [{ id: 'boundary', sourcePartId: 'system', sourcePortId: 'port', targetPartId: 'part', targetPortId: 'port' }] });
  expect(snapshot.connectors.map(c => c.id)).toEqual(['boundary']);
  const html = renderInteractiveDiagramHierarchy({ ...snapshot, states: [], layers: [], transitions: [], junctions: [] });
  expect(html).toContain('edge-boundary');
  expect(html).not.toContain('style="display:none"');
});
