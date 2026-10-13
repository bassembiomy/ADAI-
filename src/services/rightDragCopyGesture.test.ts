import { describe, expect, it } from 'vitest';
import {
  RIGHT_DRAG_COPY_THRESHOLD_PX,
  beginRightDragCopy,
  cancelRightDragCopy,
  endRightDragCopy,
  moveRightDragCopy,
} from './rightDragCopyGesture';

describe('right-drag copy gesture', () => {
  it('treats movement below the threshold as a context click', () => {
    const state = beginRightDragCopy({ sourceIds: ['source-1'], clientX: 10, clientY: 20 });
    const moved = moveRightDragCopy(state, { clientX: 13, clientY: 24 });

    expect(RIGHT_DRAG_COPY_THRESHOLD_PX).toBe(6);
    expect(moved).not.toBe(state);
    expect(moved.phase).toBe('pending');
    expect(endRightDragCopy(moved)).toEqual({ kind: 'contextMenu' });
  });

  it('starts dragging at exactly six pixels of Euclidean movement', () => {
    const state = beginRightDragCopy({ sourceIds: ['source-1'], clientX: 10, clientY: 20 });
    const moved = moveRightDragCopy(state, { clientX: 16, clientY: 20 });

    expect(moved.phase).toBe('dragging');
  });

  it('returns the latest endpoint coordinates when copying', () => {
    const state = beginRightDragCopy({ sourceIds: ['source-1'], clientX: 10, clientY: 20 });
    const moved = moveRightDragCopy(state, { clientX: 17, clientY: 29 });

    expect(endRightDragCopy(moved)).toEqual({
      kind: 'copy',
      sourceIds: ['source-1'],
      clientX: 17,
      clientY: 29,
    });
  });

  it('preserves all source IDs in a copy result', () => {
    const sourceIds = ['source-1', 'source-2'];
    const state = beginRightDragCopy({ sourceIds, clientX: 0, clientY: 0 });
    const moved = moveRightDragCopy(state, { clientX: 3, clientY: 6 });

    expect(endRightDragCopy(moved)).toMatchObject({ kind: 'copy', sourceIds });
  });

  it('cancels to null', () => {
    expect(cancelRightDragCopy()).toBeNull();
  });
});
