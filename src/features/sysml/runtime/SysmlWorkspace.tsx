import React, { createContext, useContext, useMemo } from 'react';
import type { SysmlEditorStore, SysmlEditorState } from './sysmlEditorStore';
import { useSysmlEditorSelector } from './useSysmlEditorSelector';

export const SysmlEditorContext = createContext<SysmlEditorStore | null>(null);

export interface SysmlEditorProviderProps {
  store: SysmlEditorStore;
  children: React.ReactNode;
}

export const SysmlEditorProvider: React.FC<SysmlEditorProviderProps> = ({ store, children }) => {
  return (
    <SysmlEditorContext.Provider value={store}>
      {children}
    </SysmlEditorContext.Provider>
  );
};

export function useSysmlEditorStore(): SysmlEditorStore {
  const store = useContext(SysmlEditorContext);
  if (!store) {
    throw new Error('useSysmlEditorStore must be used within a SysmlEditorProvider');
  }
  return store;
}

export function useSysmlSlice<T>(
  selector: (state: SysmlEditorState) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const store = useSysmlEditorStore();
  return useSysmlEditorSelector(store, selector, isEqual);
}

export interface SysmlWorkspaceProps {
  store: SysmlEditorStore;
  renderExplorer?: (props: {
    repository: SysmlEditorState['repository'];
    store: SysmlEditorState['store'];
    selectedIds: SysmlEditorState['selectedIds'];
  }) => React.ReactNode;
  renderCanvas?: (props: {
    repository: SysmlEditorState['repository'];
    activeDiagramId: SysmlEditorState['activeDiagramId'];
    selectedIds: SysmlEditorState['selectedIds'];
    coordinates: SysmlEditorState['coordinates'];
  }) => React.ReactNode;
  renderInspector?: (props: {
    repository: SysmlEditorState['repository'];
    selectedIds: SysmlEditorState['selectedIds'];
  }) => React.ReactNode;
}

const MemoizedExplorerPanel: React.FC<{
  renderExplorer?: SysmlWorkspaceProps['renderExplorer'];
}> = React.memo(({ renderExplorer }) => {
  const repository = useSysmlSlice(state => state.repository);
  const store = useSysmlSlice(state => state.store);
  const selectedIds = useSysmlSlice(state => state.selectedIds);

  return <>{renderExplorer?.({ repository, store, selectedIds })}</>;
});

const MemoizedCanvasPanel: React.FC<{
  renderCanvas?: SysmlWorkspaceProps['renderCanvas'];
}> = React.memo(({ renderCanvas }) => {
  const repository = useSysmlSlice(state => state.repository);
  const activeDiagramId = useSysmlSlice(state => state.activeDiagramId);
  const selectedIds = useSysmlSlice(state => state.selectedIds);
  const coordinates = useSysmlSlice(state => state.coordinates);

  return <>{renderCanvas?.({ repository, activeDiagramId, selectedIds, coordinates })}</>;
});

const MemoizedInspectorPanel: React.FC<{
  renderInspector?: SysmlWorkspaceProps['renderInspector'];
}> = React.memo(({ renderInspector }) => {
  const repository = useSysmlSlice(state => state.repository);
  const selectedIds = useSysmlSlice(state => state.selectedIds);

  return <>{renderInspector?.({ repository, selectedIds })}</>;
});

export const SysmlWorkspace: React.FC<SysmlWorkspaceProps> = ({
  store,
  renderExplorer,
  renderCanvas,
  renderInspector,
}) => {
  return (
    <SysmlEditorProvider store={store}>
      <div className="sysml-workspace flex flex-row h-full w-full">
        {renderExplorer && <MemoizedExplorerPanel renderExplorer={renderExplorer} />}
        {renderCanvas && <MemoizedCanvasPanel renderCanvas={renderCanvas} />}
        {renderInspector && <MemoizedInspectorPanel renderInspector={renderInspector} />}
      </div>
    </SysmlEditorProvider>
  );
};
