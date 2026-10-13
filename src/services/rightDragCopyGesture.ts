export const RIGHT_DRAG_COPY_THRESHOLD_PX = 6;

export type RightDragCopyState = {
  sourceIds: string[];
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  phase: 'pending' | 'dragging';
};

export function beginRightDragCopy(input: {
  sourceIds: string[];
  clientX: number;
  clientY: number;
}): RightDragCopyState {
  return {
    sourceIds: input.sourceIds,
    startClientX: input.clientX,
    startClientY: input.clientY,
    clientX: input.clientX,
    clientY: input.clientY,
    phase: 'pending',
  };
}

export function moveRightDragCopy(
  state: RightDragCopyState,
  point: { clientX: number; clientY: number },
): RightDragCopyState {
  const distance = Math.hypot(
    point.clientX - state.startClientX,
    point.clientY - state.startClientY,
  );

  return {
    ...state,
    ...point,
    phase: state.phase === 'dragging' || distance >= RIGHT_DRAG_COPY_THRESHOLD_PX
      ? 'dragging'
      : 'pending',
  };
}

export function endRightDragCopy(
  state: RightDragCopyState,
): { kind: 'contextMenu' } | ({ kind: 'copy' } & Pick<RightDragCopyState, 'sourceIds' | 'clientX' | 'clientY'>) {
  if (state.phase === 'pending') return { kind: 'contextMenu' };

  return {
    kind: 'copy',
    sourceIds: state.sourceIds,
    clientX: state.clientX,
    clientY: state.clientY,
  };
}

export function cancelRightDragCopy(): null {
  return null;
}
