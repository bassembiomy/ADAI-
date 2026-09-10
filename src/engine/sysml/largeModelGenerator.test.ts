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

describe('Synthetic Large Model Generator', () => {
  it('generates deterministic models with specified target element counts', () => {
    const m1 = generate1kModel(42);
    const m2 = generate1kModel(42);

    expect(m1.stats.totalElements).toBe(1000);
    expect(m2.stats.totalElements).toBe(1000);
    expect(Object.keys(m1.repository.definitions)).toEqual(Object.keys(m2.repository.definitions));
    expect(m1.stats.definitionsCount).toBeGreaterThan(0);
    expect(m1.stats.usagesCount).toBeGreaterThan(0);
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
  });
});
