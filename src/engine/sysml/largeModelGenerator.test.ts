import { describe, it, expect } from 'vitest';
import {
  generateSysmlModel,
  generate1kModel,
  generate10kModel,
  generate50kModel,
  generate100kModel,
} from './largeModelGenerator';
import { measureSync, formatBytes, formatDuration } from '../../services/sysmlPerformance';
import { projectLegacyDiagram, executeSysmlCommand, createSysmlGatewayState } from '../../services/sysmlCommandGateway';
import { serializeRepository, loadRepository } from './persistence';
import { analyzeMutation } from './mutations';
import { validateSysmlRepository } from './validation';
import {
  generateScalabilityFixture,
  type ScalabilityFixtureOptions,
  type ScalabilityFixtureResult,
} from './largeModelGenerator';

describe('Synthetic Large Model Generator', () => {
  it('generates deterministic models with specified target element counts', () => {
    const m1 = generate1kModel(42);
    const m2 = generate1kModel(42);

    expect(m1.stats.totalElements).toBe(1000);
    expect(m2.stats.totalElements).toBe(1000);
    expect(Object.keys(m1.repository.definitions)).toEqual(Object.keys(m2.repository.definitions));
    expect(m1.stats.definitionsCount).toBeGreaterThan(0);
    expect(m1.stats.partsCount).toBeGreaterThan(0);
    expect(m1.repository.usages).toEqual({}); // parts are Block properties; no usage records
    expect(m1.stats.relationshipsCount).toBeGreaterThan(0);
    expect(m1.stats.requirementsCount).toBeGreaterThan(0);
    expect(m1.stats.verificationCasesCount).toBeGreaterThan(0);
  });

  it('generates 10k, 50k, and 100k fixtures with bounded structure', () => {
    const m10k = generate10kModel(123);
    expect(m10k.stats.totalElements).toBe(10000);
    expect(m10k.stats.diagramCount).toBeGreaterThan(1);

    // Fast generation check for 50k
    const m50k = generate50kModel(456);
    expect(m50k.stats.totalElements).toBe(50000);

    // Fast generation check for 100k
    const m100k = generate100kModel(789);
    expect(m100k.stats.totalElements).toBe(100000);
    expect(Object.keys(m100k.repository.definitions).length).toBe(m100k.stats.definitionsCount);
  });
});

describe('Scalability Mixed-Model Benchmark Fixture', () => {
  it('generates deterministic IDs, exact count accounting, valid references, and clean validation at 1k', () => {
    const f1 = generateScalabilityFixture({ semanticCount: 1_000, seed: 42, topology: 'distributed' });
    const f2 = generateScalabilityFixture({ semanticCount: 1_000, seed: 42, topology: 'distributed' });

    // 1. Exact count accounting
    expect(f1.counts.totalSemanticElements).toBe(1_000);
    const sumCategories =
      f1.counts.packages +
      f1.counts.blocks +
      f1.counts.valueTypes +
      f1.counts.interfaces +
      f1.counts.properties +
      f1.counts.ports +
      f1.counts.connectors +
      f1.counts.relationships +
      f1.counts.requirements +
      f1.counts.verificationCases +
      f1.counts.stateMachineEntities +
      f1.counts.diagrams;
    expect(sumCategories).toBe(1_000);

    // Collect all semantic IDs across categories and verify uniqueness
    const allIds = new Set<string>();
    const duplicateIds: string[] = [];
    const recordId = (id: string) => {
      if (allIds.has(id)) duplicateIds.push(id);
      allIds.add(id);
    };

    Object.keys(f1.repository.packages).forEach(recordId);
    Object.keys(f1.repository.definitions).forEach(recordId);
    Object.values(f1.repository.definitions).forEach(d => {
      if (d.kind === 'block') {
        d.properties.forEach(p => recordId(p.id));
        d.ports.forEach(pt => recordId(pt.id));
      }
    });
    Object.keys(f1.repository.connectors).forEach(recordId);
    Object.keys(f1.repository.relationships).forEach(recordId);
    Object.keys(f1.repository.requirements).forEach(recordId);
    Object.keys(f1.repository.verificationCases).forEach(recordId);
    Object.keys(f1.repository.diagrams).forEach(recordId);

    // State machine entities
    f1.stateMachine.states.forEach(s => recordId(s.id));
    f1.stateMachine.transitions.forEach(t => recordId(t.id));
    f1.stateMachine.junctions.forEach(j => recordId(j.id));
    f1.stateMachine.layers.forEach(l => recordId(l.id));

    expect(duplicateIds).toEqual([]);
    expect(allIds.size).toBe(1_000);

    // 2. Determinism
    expect(f1.counts).toEqual(f2.counts);
    expect(Object.keys(f1.repository.definitions)).toEqual(Object.keys(f2.repository.definitions));
    expect(f1.stateMachine.states.map(s => s.id)).toEqual(f2.stateMachine.states.map(s => s.id));

    // 3. Semantic validation of SysML repository
    const validationReport = validateSysmlRepository(f1.repository);
    const errors = validationReport.diagnostics.filter(d => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(validationReport.valid).toBe(true);

    // 4. Diagram membership and density
    expect(f1.diagramPresentations['diagram-ordinary']).toBeDefined();
    expect(f1.diagramPresentations['diagram-ordinary'].elementIds.length).toBeGreaterThanOrEqual(100);
    expect(f1.diagramPresentations['diagram-ordinary'].elementIds.length).toBeLessThanOrEqual(500);
    expect(f1.diagramPresentations['diagram-stress']).toBeDefined();
    expect(f1.diagramPresentations['diagram-stress'].elementIds.length).toBeGreaterThan(
      f1.diagramPresentations['diagram-ordinary'].elementIds.length
    );
  });

  it('supports broad, deep, and dense topologies with valid semantic models', () => {
    for (const topology of ['broad', 'deep', 'dense'] as const) {
      const fix = generateScalabilityFixture({ semanticCount: 1_000, seed: 100, topology });
      expect(fix.counts.totalSemanticElements).toBe(1_000);
      const validation = validateSysmlRepository(fix.repository);
      const errors = validation.diagnostics.filter(d => d.severity === 'error');
      expect(errors).toEqual([]);
      expect(validation.valid).toBe(true);
    }
  });

  it('generates a valid 10k mixed-model fixture with exact counting', () => {
    const f10k = generateScalabilityFixture({ semanticCount: 10_000, seed: 123, topology: 'distributed' });
    expect(f10k.counts.totalSemanticElements).toBe(10_000);

    const sumCategories =
      f10k.counts.packages +
      f10k.counts.blocks +
      f10k.counts.valueTypes +
      f10k.counts.interfaces +
      f10k.counts.properties +
      f10k.counts.ports +
      f10k.counts.connectors +
      f10k.counts.relationships +
      f10k.counts.requirements +
      f10k.counts.verificationCases +
      f10k.counts.stateMachineEntities +
      f10k.counts.diagrams;
    expect(sumCategories).toBe(10_000);

    const validation = validateSysmlRepository(f10k.repository);
    const errors = validation.diagnostics.filter(d => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(f10k.diagramPresentations['diagram-ordinary'].elementIds.length).toBeLessThanOrEqual(500);
    expect(f10k.diagramPresentations['diagram-stress'].elementIds.length).toBeGreaterThan(1000);
  });
});

describe('Baseline Performance Measurements', () => {
  it('measures baseline performance for 1k and 10k models', () => {
    // 1. Generation
    const gen1k = measureSync('Generate 1k model', () => generate1kModel(42));
    const model1k = gen1k.result;

    const gen10k = measureSync('Generate 10k model', () => generate10kModel(42));
    const model10k = gen10k.result;

    // 2. Serialization & Deserialization
    const ser1k = measureSync('Serialize 1k model', () => serializeRepository(model1k.repository));
    const des1k = measureSync('Deserialize 1k model', () => loadRepository(ser1k.result));
    expect(des1k.result.repository.revision).toBe(model1k.repository.revision);

    const ser10k = measureSync('Serialize 10k model', () => serializeRepository(model10k.repository));
    const des10k = measureSync('Deserialize 10k model', () => loadRepository(ser10k.result));
    expect(des10k.result.repository.revision).toBe(model10k.repository.revision);

    // 3. Project Legacy Diagram: Full vs Diagram-Scoped
    const projFull1k = measureSync('Project full 1k model', () =>
      projectLegacyDiagram(model1k.repository, model1k.coordinates, model1k.diagramPresentations)
    );
    const projDiagram1k = measureSync('Project single diagram (1k model)', () =>
      projectLegacyDiagram(model1k.repository, model1k.coordinates, model1k.diagramPresentations, 'diagram-root')
    );
    expect(projDiagram1k.result.blocks.length).toBeLessThan(projFull1k.result.blocks.length);

    const projFull10k = measureSync('Project full 10k model', () =>
      projectLegacyDiagram(model10k.repository, model10k.coordinates, model10k.diagramPresentations)
    );
    const projDiagram10k = measureSync('Project single diagram (10k model)', () =>
      projectLegacyDiagram(model10k.repository, model10k.coordinates, model10k.diagramPresentations, 'diagram-root')
    );
    expect(projDiagram10k.result.blocks.length).toBeLessThan(projFull10k.result.blocks.length);

    // 4. Update Element (Command Gateway)
    const gateway1k = createSysmlGatewayState(model1k.repository, model1k.coordinates, model1k.diagramPresentations);
    const update1k = measureSync('Update single element (1k model)', () =>
      executeSysmlCommand(gateway1k, {
        type: 'updateElement',
        elementId: 'blk_1',
        patch: { name: 'Block_1_Updated' },
      })
    );
    expect(update1k.result.repository.definitions['blk_1'].name).toBe('Block_1_Updated');

    const gateway10k = createSysmlGatewayState(model10k.repository, model10k.coordinates, model10k.diagramPresentations);
    const update10k = measureSync('Update single element (10k model)', () =>
      executeSysmlCommand(gateway10k, {
        type: 'updateElement',
        elementId: 'blk_1',
        patch: { name: 'Block_1_Updated' },
      })
    );
    expect(update10k.result.repository.definitions['blk_1'].name).toBe('Block_1_Updated');

    // 5. Delete-Impact Analysis
    const impact1k = measureSync('Delete-impact analysis (1k model)', () =>
      analyzeMutation(model1k.repository, { kind: 'deleteElements', elementIds: ['blk_1'] })
    );
    expect(impact1k.result.deletedElementIds.length).toBeGreaterThan(0);

    const impact10k = measureSync('Delete-impact analysis (10k model)', () =>
      analyzeMutation(model10k.repository, { kind: 'deleteElements', elementIds: ['blk_1'] })
    );
    expect(impact10k.result.deletedElementIds.length).toBeGreaterThan(0);

    // Log benchmark summary for baseline documentation
    const summary = [
      `\n--- SYSML PERFORMANCE BASELINE ---`,
      `Generate 1k: ${formatDuration(gen1k.durationMs)} (heap delta: ${formatBytes(gen1k.heapDeltaBytes)})`,
      `Generate 10k: ${formatDuration(gen10k.durationMs)} (heap delta: ${formatBytes(gen10k.heapDeltaBytes)})`,
      `Serialize 1k: ${formatDuration(ser1k.durationMs)} (${ser1k.result.length} chars)`,
      `Serialize 10k: ${formatDuration(ser10k.durationMs)} (${ser10k.result.length} chars)`,
      `Deserialize 1k: ${formatDuration(des1k.durationMs)}`,
      `Deserialize 10k: ${formatDuration(des10k.durationMs)}`,
      `Project Full 1k: ${formatDuration(projFull1k.durationMs)} (${projFull1k.result.blocks.length} blocks)`,
      `Project Single Diagram 1k: ${formatDuration(projDiagram1k.durationMs)} (${projDiagram1k.result.blocks.length} blocks)`,
      `Project Full 10k: ${formatDuration(projFull10k.durationMs)} (${projFull10k.result.blocks.length} blocks)`,
      `Project Single Diagram 10k: ${formatDuration(projDiagram10k.durationMs)} (${projDiagram10k.result.blocks.length} blocks)`,
      `Update Element 1k: ${formatDuration(update1k.durationMs)}`,
      `Update Element 10k: ${formatDuration(update10k.durationMs)}`,
      `Delete Impact 1k: ${formatDuration(impact1k.durationMs)}`,
      `Delete Impact 10k: ${formatDuration(impact10k.durationMs)}`,
      `----------------------------------`,
    ].join('\n');

    console.log(summary);
  }, 30000);
});
