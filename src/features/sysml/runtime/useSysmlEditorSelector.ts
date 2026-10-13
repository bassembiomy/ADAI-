import { useSyncExternalStore, useRef, useCallback } from 'react';
import type { SysmlEditorStore, SysmlEditorState } from './sysmlEditorStore';

/**
 * Subscribes a React component to a specific slice of SysmlEditorState.
 * Prevents re-renders if the selected slice is equal according to `isEqual` (defaults to Object.is).
 */
export function useSysmlEditorSelector<T>(
  store: SysmlEditorStore,
  selector: (state: SysmlEditorState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const lastSelectedRef = useRef<T | undefined>(undefined);
  const lastStateRef = useRef<SysmlEditorState | undefined>(undefined);

  const getSnapshot = useCallback(() => {
    const currentState = store.getState();
    if (lastStateRef.current === currentState && lastSelectedRef.current !== undefined) {
      return lastSelectedRef.current;
    }

    const nextSelected = selector(currentState);
    if (lastSelectedRef.current !== undefined && isEqual(lastSelectedRef.current, nextSelected)) {
      lastStateRef.current = currentState;
      return lastSelectedRef.current;
    }

    lastStateRef.current = currentState;
    lastSelectedRef.current = nextSelected;
    return nextSelected;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
