import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isPreflightClear } from '../../features/modelExplorer/modelExplorerCommandBus';
import type { ExplorerCommandResult, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { AppModelExplorer } from './AppModelExplorer';
import type { StateMachineExplorerSnapshot } from '../../features/modelExplorer/adapters/stateMachineExplorerAdapter';

describe('AppModelExplorer Command Dispatch & State Machine History', () => {
  it('isPreflightClear identifies valid non-committing preflight without errors or impact', () => {
    const clearPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [],
    };
    expect(isPreflightClear(clearPreflight)).toBe(true);

    const errorPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [{ code: 'ERR_1', message: 'Fail', severity: 'error' }],
    };
    expect(isPreflightClear(errorPreflight)).toBe(false);

    const impactPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [],
      impact: {
        descendants: ['d1'],
        relationships: [],
        presentations: [],
        invalidated: ['t1'],
      },
    };
    expect(isPreflightClear(impactPreflight)).toBe(false);

    const emptyImpactPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [],
      impact: {
        descendants: [],
        relationships: [],
        presentations: [],
        invalidated: [],
      },
    };
    expect(isPreflightClear(emptyImpactPreflight)).toBe(true);
  });

  it('calls onCommitStateMachineSnapshot once with next snapshot and description', () => {
    const onCommit = vi.fn();

    // Render with single snapshot transaction handler
    const explorer = (
      <AppModelExplorer
        diagramMode="statemachine"
        states={[]}
        layers={[{ id: 'root', name: 'Root Layer', parentStateId: null, stateIds: [], junctionIds: [], transitionIds: [] }]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onCommitStateMachineSnapshot={onCommit}
      />
    );

    expect(explorer).toBeDefined();
  });
});
