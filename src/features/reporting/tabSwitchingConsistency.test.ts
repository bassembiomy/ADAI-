import { describe, it, expect } from 'vitest';
import type { BlockData, RelationshipData } from '../../types/sysml_types';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';
import { renderRequirementsDiagram, renderBddDiagram } from './reportDiagrams';

describe('Tab switching relationship preservation', () => {
  it('reproduces relationship loss if loadStateForFile overwrites relationships without merging', () => {
    // Initial state: User creates 2 requirements and a deriveReqt link in Requirements tab
    const req1: BlockData = {
      id: 'req-1',
      name: 'Req 1',
      stereotype: 'requirement',
      reqId: 'REQ-01',
      x: 0, y: 0, width: 160, height: 80,
      ports: [], properties: [], operations: [], constraints: [], classes: [],
    };
    const req2: BlockData = {
      id: 'req-2',
      name: 'Req 2',
      stereotype: 'requirement',
      reqId: 'REQ-02',
      x: 200, y: 0, width: 160, height: 80,
      ports: [], properties: [], operations: [], constraints: [], classes: [],
    };
    const reqRel: RelationshipData = {
      id: 'rel-req-1-2',
      sourceId: 'req-1',
      targetId: 'req-2',
      type: 'deriveReqt',
      label: '',
    };

    let currentBlocks: BlockData[] = [req1, req2];
    let currentRelationships: RelationshipData[] = [reqRel];

    // User switches to BDD tab.
    // In current App.tsx loadStateForFile('bdd'):
    const bddFileData = {
      blocks: [] as BlockData[],
      relationships: [] as RelationshipData[],
    };

    // Current buggy behavior in App.tsx:
    // setBlocks(prev => [...prev.filter(b => b.stereotype === 'requirement'), ...(d.blocks || [])]);
    currentBlocks = [
      ...currentBlocks.filter(b => b.stereotype === 'requirement'),
      ...(bddFileData.blocks || []),
    ];
    // if (d.relationships) setRelationships(d.relationships);
    // Notice: bddFileData.relationships is empty [], so currentRelationships became []!
    const buggyRelationships = bddFileData.relationships;

    // In BDD tab, user adds 2 blocks and connects them
    const block1: BlockData = {
      id: 'b-1',
      name: 'Block 1',
      stereotype: 'block',
      x: 0, y: 200, width: 140, height: 70,
      ports: [], properties: [], operations: [], constraints: [], classes: [],
    };
    const block2: BlockData = {
      id: 'b-2',
      name: 'Block 2',
      stereotype: 'block',
      x: 200, y: 200, width: 140, height: 70,
      ports: [], properties: [], operations: [], constraints: [], classes: [],
    };
    const bddRel: RelationshipData = {
      id: 'rel-bdd-1-2',
      sourceId: 'b-1',
      targetId: 'b-2',
      type: 'composition',
      label: '',
    };

    currentBlocks = [...currentBlocks, block1, block2];
    // With bug: currentRelationships was reset to [], so now it only has bddRel
    const buggyCurrentRelationships = [...buggyRelationships, bddRel];

    // If report is generated now from BDD tab:
    const buggySnapshot = createReportSnapshot({
      blocks: currentBlocks,
      relationships: buggyCurrentRelationships,
      parts: [],
      connectors: [],
    });
    const buggySource = toHierarchySource(buggySnapshot);

    const buggyReqSvg = renderRequirementsDiagram({ blocks: buggySource.blocks, relationships: buggySource.relationships });
    const buggyBddSvg = renderBddDiagram({ blocks: buggySource.blocks, relationships: buggySource.relationships });

    // With the bug, reqRel vanished from requirements diagram!
    expect(buggyReqSvg).not.toContain('edge-rel-req-1-2');
    // And bddRel appears in BDD diagram!
    expect(buggyBddSvg).toContain('edge-rel-bdd-1-2');

    // EXPECTED FIXED BEHAVIOR:
    // When switching tabs, relationships from other diagram types must be preserved by merging!
    const mergedRelationshipsMap = new Map<string, RelationshipData>();
    currentRelationships.forEach(r => mergedRelationshipsMap.set(r.id, r));
    bddFileData.relationships.forEach(r => mergedRelationshipsMap.set(r.id, r));
    const mergedCurrentRelationships = Array.from(mergedRelationshipsMap.values());
    mergedCurrentRelationships.push(bddRel);

    const fixedSnapshot = createReportSnapshot({
      blocks: currentBlocks,
      relationships: mergedCurrentRelationships,
      parts: [],
      connectors: [],
    });
    const fixedSource = toHierarchySource(fixedSnapshot);

    const fixedReqSvg = renderRequirementsDiagram({ blocks: fixedSource.blocks, relationships: fixedSource.relationships });
    const fixedBddSvg = renderBddDiagram({ blocks: fixedSource.blocks, relationships: fixedSource.relationships });

    // In fixed behavior, BOTH requirement links and BDD links appear!
    expect(fixedReqSvg).toContain('edge-rel-req-1-2');
    expect(fixedBddSvg).toContain('edge-rel-bdd-1-2');
  });
});
