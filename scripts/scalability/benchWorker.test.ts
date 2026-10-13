import { describe, it, expect } from 'vitest';
import { generateScalabilityFixture } from '../../src/engine/sysml/largeModelGenerator';
import { createSysmlGatewayState } from '../../src/services/sysmlCommandGateway';
import {
  executeVerifiedEditSequence,
  type VerifiedEditResult,
} from './benchWorker';

describe('Scalability Benchmark Worker Harness', () => {
  const getFixture = () => {
    const fixture = generateScalabilityFixture({
      semanticCount: 1_000,
      seed: 42,
      topology: 'distributed',
    });
    const state = createSysmlGatewayState(
      fixture.repository,
      fixture.coordinates,
      fixture.diagramPresentations
    );
    return { fixture, state };
  };

  it('accepts a valid state-advancing edit and undo/redo sequence', () => {
    const { state } = getFixture();
    const result: VerifiedEditResult = executeVerifiedEditSequence(state, 'blk_1', [
      'Renamed_Block_A',
      'Renamed_Block_B',
      'Renamed_Block_C',
    ]);

    expect(result.success).toBe(true);
    expect(result.finalState.repository.definitions.blk_1?.name).toBe('Renamed_Block_C');
    expect(result.finalState.repository.revision).toBe(state.repository.revision + 3);
    expect(result.undoRestoredName).toBe('Renamed_Block_B');
    expect(result.redoReappliedName).toBe('Renamed_Block_C');
  });

  it('rejects a sequence where commands do not advance state or have stale names', () => {
    const { state } = getFixture();

    // Calling with empty or invalid patch sequence should fail
    expect(() => {
      executeVerifiedEditSequence(state, 'non_existent_block_999', ['New_Name']);
    }).toThrow(/Edit command failed to commit or find target element/);
  });

  it('rejects if an undo does not restore the expected prior name', () => {
    const { state } = getFixture();

    expect(() => {
      executeVerifiedEditSequence(state, 'blk_1', ['Renamed_Block_X'], undefined, {
        corruptUndoBeforeCommit: true,
      });
    }).toThrow(/Undo failed to commit or restore previous state/);
  });
});
