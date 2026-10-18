import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCanonicalSysmlProject } from '../../services/sysmlCommandGateway';
import { buildUnifiedModelProjection } from './unifiedModelExplorerProjection';
import { expandedIdsToReveal, isRevealed } from './revealInTree';

// The MR-PLD project presents ~330 tree elements on 77 diagrams: a broad, real fixture.
const project = JSON.parse(readFileSync(resolve(__dirname, '../../../MR_PLD_A5414465340.adia'), 'utf8'));
const loaded = loadCanonicalSysmlProject(project);
const diagramPresentations = Object.fromEntries(loaded.store.diagramPresentations.entries());
const input = {
  sysml: loaded.repository,
  sysmlStore: loaded.store,
  stateMachine: { states: project.states, layers: project.layers, transitions: project.transitions, junctions: project.junctions ?? [], diagrams: [] },
  externalModels: [],
  revision: 1,
  diagramPresentations,
} as unknown as Parameters<typeof buildUnifiedModelProjection>[0];
const collapsed = new Set(['project:model', 'project:pillar:structural', 'project:pillar:behavior', 'project:pillar:parametric', 'project:pillar:requirements']);

describe('expandedIdsToReveal', () => {
  const full = buildUnifiedModelProjection({ ...input, sysmlStore: undefined, expandedNodeIds: undefined });
  const inTree = new Set(Object.values(full.nodes).map(node => node.semanticId));
  // every symbol on every diagram, plus every relationship line a diagram draws (both ends presented there)
  const drawn = Object.values(loaded.repository.relationships).filter(r => Object.values(diagramPresentations)
    .some(p => (p.elementIds ?? []).includes(r.sourceId) && (p.elementIds ?? []).includes(r.targetId))).map(r => r.id);
  const presented = [...new Set([...Object.values(diagramPresentations).flatMap(p => p.elementIds ?? []), ...drawn])].filter(id => inTree.has(id));

  it('reveals every diagram element and relationship that has a tree row, starting from a collapsed tree', () => {
    expect(presented.length).toBeGreaterThan(550);
    const hidden = presented.filter(id => {
      const expanded = expandedIdsToReveal(input, [id], collapsed);
      const projection = buildUnifiedModelProjection({ ...input, expandedNodeIds: expanded as Set<string> });
      return !isRevealed(projection, expanded, id);
    });
    expect(hidden).toEqual([]);
  }, 300_000);

  it('changes nothing when the selection is already visible or has no tree row', () => {
    const expanded = expandedIdsToReveal(input, ['blk_ComputeCore'], collapsed);
    expect(expandedIdsToReveal(input, ['blk_ComputeCore'], expanded)).toBe(expanded);
    expect(expandedIdsToReveal(input, ['c_sys_canBusLink'], collapsed)).toBe(collapsed);
  });
});
