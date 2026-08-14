import { describe, expect, it } from 'vitest';
import { BlockData, RelationshipData } from '../../types/sysml_types';
import { renderBddDiagram, renderRequirementsDiagram } from './reportDiagrams';

function block(partial: Partial<BlockData> & { id: string }): BlockData {
  return {
    name: partial.id, stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [], ports: [],
    ...partial,
  } as BlockData;
}

function rel(partial: Partial<RelationshipData> & { id: string; sourceId: string; targetId: string }): RelationshipData {
  return { type: 'association', label: '', ...partial } as RelationshipData;
}

const reqBlocks = [
  block({ id: 'r1', name: 'Limit <temperature>', stereotype: 'requirement', reqId: 'REQ-001', status: 'verified' }),
  block({ id: 'r2', name: 'Control fan', stereotype: 'requirement', reqId: 'REQ-002', status: 'open' }),
];
const reqRels = [rel({ id: 'e1', sourceId: 'r1', targetId: 'r2', type: 'deriveReqt' })];

describe('renderRequirementsDiagram', () => {
  it('renders escaped requirement identities and relationship stereotypes', () => {
    const html = renderRequirementsDiagram({ blocks: reqBlocks, relationships: reqRels });
    expect(html).toContain('REQ-001');
    expect(html).toContain('Limit &lt;temperature&gt;');
    expect(html).toContain('report-figure-caption');
    expect(html).toContain('2 requirements');
    expect(html).not.toContain('<temperature>');
  });

  it('renders a formal empty figure when no requirements exist', () => {
    expect(renderRequirementsDiagram({ blocks: [], relationships: [] }))
      .toContain('No requirements defined');
  });

  it('splits large requirement sets into multiple captioned figures', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      block({ id: `rq${i}`, name: `Requirement ${i}`, stereotype: 'requirement', reqId: `REQ-${i}` }));
    const html = renderRequirementsDiagram({ blocks: many, relationships: [] });
    expect(html).toContain('view 1 of 2');
    expect(html).toContain('view 2 of 2');
  });
});

describe('renderBddDiagram', () => {
  const bddBlocks = [
    block({ id: 'root', name: 'ThermalSystem' }),
    block({ id: 'ctrl', name: 'Controller', properties: [{ id: 'p1', name: 'gain', type: 'Real', defaultValue: '1.2' }] as never }),
  ];
  const bddRels = [
    rel({ id: 'c1', sourceId: 'root', targetId: 'ctrl', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' }),
  ];

  it('renders stereotypes, composition diamonds, and multiplicities', () => {
    const html = renderBddDiagram({ blocks: bddBlocks, relationships: bddRels });
    expect(html).toContain('«block»');
    expect(html).toContain('ThermalSystem');
    expect(html).toContain('rf-diamond-filled');
    expect(html).toContain('1..*');
    expect(html).toContain('2 blocks');
  });

  it('renders generalization with a hollow triangle', () => {
    const html = renderBddDiagram({
      blocks: bddBlocks,
      relationships: [rel({ id: 'g1', sourceId: 'ctrl', targetId: 'root', type: 'generalization' })],
    });
    expect(html).toContain('rf-triangle-hollow');
  });

  it('renders a formal empty figure when no blocks exist', () => {
    expect(renderBddDiagram({ blocks: [], relationships: [] })).toContain('No blocks defined');
  });
});
