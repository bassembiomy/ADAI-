import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateScalabilityFixture } from '../../src/engine/sysml/largeModelGenerator';
import { fromRepository } from '../../src/engine/sysml/normalizedStore';
import { migrateV3ToV4 } from '../../src/engine/sysml/persistence/migrateV3ToV4';
import { buildDiagramVisualParentIndex } from '../../src/features/modelExplorer/diagramTreeContext';
import { buildUnifiedModelProjection } from '../../src/features/modelExplorer/unifiedModelExplorerProjection';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  projectLegacyDiagram,
} from '../../src/services/sysmlCommandGateway';

const size = Number(process.argv.find(arg => arg.startsWith('--size='))?.split('=')[1] ?? 10_000);
if (!Number.isSafeInteger(size) || size < 1_000) throw new Error('Provide --size=<integer >= 1000>');

const timings: Record<string, number> = {};
const memory: Record<string, { rssMB: number; heapMB: number }> = {};
function measure<T>(name: string, action: () => T): T {
  const start = performance.now();
  const result = action();
  timings[name] = Number((performance.now() - start).toFixed(2));
  const usage = process.memoryUsage();
  memory[name] = {
    rssMB: Number((usage.rss / 1024 / 1024).toFixed(1)),
    heapMB: Number((usage.heapUsed / 1024 / 1024).toFixed(1)),
  };
  return result;
}

const fixture = measure('fixtureGeneration', () => generateScalabilityFixture({
  semanticCount: size, seed: 42, topology: 'distributed',
}));
let state = measure('gatewayInitialization', () => createSysmlGatewayState(
  fixture.repository, fixture.coordinates, fixture.diagramPresentations,
));
const initialRevision = state.repository.revision;
const result = measure('committedGatewayRename', () => executeSysmlCommand(state, {
  type: 'updateElement', elementId: 'blk_1', patch: { name: 'Profiled Block' },
}, 'diagram-ordinary'));
if (!result.committed || result.repository.definitions.blk_1?.name !== 'Profiled Block') {
  throw new Error('Profile rename did not commit');
}
state = { ...state, ...result };
const rebuiltStore = measure('appStoreRebuild', () => fromRepository(
  state.repository, state.coordinates, state.diagramPresentations,
));
if (rebuiltStore.revision !== state.repository.revision) throw new Error('Store revision mismatch');
measure('wholeLegacyProjection', () => projectLegacyDiagram(
  state.repository, state.coordinates, state.diagramPresentations,
));
measure('activeDiagramLegacyProjection', () => projectLegacyDiagram(
  state.repository, state.coordinates, state.diagramPresentations, 'diagram-ordinary',
));
measure('v4InspectorProjection', () => migrateV3ToV4(
  state.repository, state.coordinates, state.diagramPresentations,
));
measure('diagramVisualParentIndex', () => buildDiagramVisualParentIndex({
  sysml: state.repository,
  stateMachine: { ...fixture.stateMachine, revision: 1 } as any,
  diagramPresentations: state.diagramPresentations,
}));
const tree = measure('modelExplorerProjection', () => buildUnifiedModelProjection({
  sysml: state.repository,
  stateMachine: { ...fixture.stateMachine, revision: 1 } as any,
  externalModels: [],
  revision: state.repository.revision,
  diagramPresentations: state.diagramPresentations,
}));
const undo = measure('committedUndo', () => executeSysmlCommand(state, { type: 'undo' }, 'diagram-ordinary'));
if (!undo.committed || undo.repository.definitions.blk_1?.name !== 'Block_1') {
  throw new Error('Profile undo did not restore the block');
}

const output = {
  size,
  seed: 42,
  topology: 'distributed',
  initialRevision,
  committedRevision: result.repository.revision,
  treeNodes: Object.keys(tree.nodes).length,
  timings,
  memory,
  caveat: 'Sequential Node stage timings exclude React rendering; stages model work repeated by App after a committed edit.',
};
const outputDir = resolve('artifacts/scalability');
mkdirSync(outputDir, { recursive: true });
const outputFile = resolve(outputDir, `profile-edit-${size}.json`);
writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
