import { describe, it, expect } from 'vitest';
import { renderRequirementsDiagram, renderBddDiagram } from './reportDiagrams';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';
import type { BlockData, RelationshipData } from '../../types/sysml_types';

describe('User scenario reproduction', () => {
  const req1: BlockData = {
    id: 'req-1',
    name: 'Power Requirement',
    stereotype: 'requirement',
    reqId: 'REQ-01',
    x: 100, y: 100, width: 160, height: 80,
    ports: [], properties: [], operations: [], constraints: [], classes: [],
  };

  const req2: BlockData = {
    id: 'req-2',
    name: 'Battery Life Requirement',
    stereotype: 'requirement',
    reqId: 'REQ-02',
    x: 300, y: 100, width: 160, height: 80,
    ports: [], properties: [], operations: [], constraints: [], classes: [],
  };

  const block1: BlockData = {
    id: 'block-1',
    name: 'PowerSubsystem',
    stereotype: 'block',
    x: 100, y: 300, width: 140, height: 70,
    ports: [], properties: [], operations: [], constraints: [], classes: [],
  };

  const block2: BlockData = {
    id: 'block-2',
    name: 'BatteryModule',
    stereotype: 'block',
    x: 300, y: 300, width: 140, height: 70,
    ports: [], properties: [], operations: [], constraints: [], classes: [],
  };

  const reqRel: RelationshipData = {
    id: 'rel-req-1-2',
    sourceId: 'req-1',
    targetId: 'req-2',
    type: 'deriveReqt',
    label: '',
  };

  it('Case A: BDD relation is default association', () => {
    const bddRelDefault: RelationshipData = {
      id: 'rel-bdd-1-2',
      sourceId: 'block-1',
      targetId: 'block-2',
      type: 'association',
      label: '',
    };

    const snapshot = createReportSnapshot({
      blocks: [req1, req2, block1, block2],
      relationships: [reqRel, bddRelDefault],
      parts: [],
      connectors: [],
    });
    const source = toHierarchySource(snapshot);

    const reqSvg = renderRequirementsDiagram({ blocks: source.blocks, relationships: source.relationships });
    const bddSvg = renderBddDiagram({ blocks: source.blocks, relationships: source.relationships });

    console.log('--- Case A: reqSvg ---');
    console.log(reqSvg);
    console.log('--- Case A: bddSvg ---');
    console.log(bddSvg);

    // Requirement diagram should have reqRel
    expect(reqSvg).toContain('edge-rel-req-1-2');
    // BDD diagram should have bddRel
    expect(bddSvg).toContain('edge-rel-bdd-1-2');
  });

  it('Case B: BDD relation has type composition', () => {
    const bddRelComposition: RelationshipData = {
      id: 'rel-bdd-1-2',
      sourceId: 'block-1',
      targetId: 'block-2',
      type: 'composition',
      label: '',
    };

    const snapshot = createReportSnapshot({
      blocks: [req1, req2, block1, block2],
      relationships: [reqRel, bddRelComposition],
      parts: [],
      connectors: [],
    });
    const source = toHierarchySource(snapshot);

    const reqSvg = renderRequirementsDiagram({ blocks: source.blocks, relationships: source.relationships });
    const bddSvg = renderBddDiagram({ blocks: source.blocks, relationships: source.relationships });

    console.log('--- Case B: reqSvg ---');
    console.log(reqSvg);
    console.log('--- Case B: bddSvg ---');
    console.log(bddSvg);

    expect(reqSvg).toContain('edge-rel-req-1-2');
    expect(bddSvg).toContain('edge-rel-bdd-1-2');
  });
});
