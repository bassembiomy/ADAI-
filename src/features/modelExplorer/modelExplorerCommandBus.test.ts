import { describe, expect, it, vi } from 'vitest';
import { createModelExplorerCommandBus } from './modelExplorerCommandBus';
import type { ModelExplorerAdapter, ModelExplorerCommand } from './modelExplorerTypes';

describe('modelExplorerCommandBus', () => {
  it('does not execute when preflight returns errors', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml',
      getRevision: () => 1,
      project: vi.fn(),
      capabilities: vi.fn(),
      preflight: vi.fn().mockReturnValue({
        committed: false,
        revision: 1,
        diagnostics: [{ code: 'EMPTY_NAME', severity: 'error', message: 'Name cannot be empty' }],
      }),
      execute: vi.fn(),
      relationshipTargets: vi.fn(),
    };

    const bus = createModelExplorerCommandBus(adapter);
    const result = bus.dispatch({ type: 'rename', elementId: 'a', name: '' });

    expect(result.committed).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it('does not execute without confirmation when preflight returns impact', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml',
      getRevision: () => 1,
      project: vi.fn(),
      capabilities: vi.fn(),
      preflight: vi.fn().mockReturnValue({
        committed: false,
        revision: 1,
        diagnostics: [],
        impact: {
          descendants: ['child-1'],
          relationships: ['r1'],
          presentations: [],
          invalidated: [],
        },
      }),
      execute: vi.fn(),
      relationshipTargets: vi.fn(),
    };

    const bus = createModelExplorerCommandBus(adapter);
    const command: ModelExplorerCommand = { type: 'delete', elementIds: ['parent'] };
    const result = bus.dispatch(command);

    expect(result.committed).toBe(false);
    expect(result.impact).toBeDefined();
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it('executes when preflight contains an empty impact report', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml',
      getRevision: () => 1,
      project: vi.fn(),
      capabilities: vi.fn(),
      preflight: vi.fn().mockReturnValue({
        committed: false,
        revision: 1,
        diagnostics: [],
        impact: { descendants: [], relationships: [], presentations: [], invalidated: [] },
      }),
      execute: vi.fn().mockReturnValue({
        committed: true,
        revision: 2,
        diagnostics: [],
      }),
      relationshipTargets: vi.fn(),
    };
    createModelExplorerCommandBus(adapter).dispatch({ type: 'delete', elementIds: ['block-1'] });
    expect(adapter.execute).toHaveBeenCalledOnce();
  });

  it('executes when preflight passes cleanly', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml',
      getRevision: () => 1,
      project: vi.fn(),
      capabilities: vi.fn(),
      preflight: vi.fn().mockReturnValue({
        committed: false,
        revision: 1,
        diagnostics: [],
      }),
      execute: vi.fn().mockReturnValue({
        committed: true,
        revision: 2,
        diagnostics: [],
        selectedIds: ['a'],
      }),
      relationshipTargets: vi.fn(),
    };

    const bus = createModelExplorerCommandBus(adapter);
    const result = bus.dispatch({ type: 'rename', elementId: 'a', name: 'ValidName' });

    expect(result.committed).toBe(true);
    expect(adapter.execute).toHaveBeenCalled();
  });

  it('passes confirmedImpactHash on confirm', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml',
      getRevision: () => 1,
      project: vi.fn(),
      capabilities: vi.fn(),
      preflight: vi.fn(),
      execute: vi.fn().mockReturnValue({
        committed: true,
        revision: 2,
        diagnostics: [],
      }),
      relationshipTargets: vi.fn(),
    };

    const bus = createModelExplorerCommandBus(adapter);
    const result = bus.confirm({ type: 'delete', elementIds: ['a'] }, 'hash123');

    expect(result.committed).toBe(true);
    expect(adapter.execute).toHaveBeenCalledWith({
      type: 'delete',
      elementIds: ['a'],
      confirmedImpactHash: 'hash123',
    });
  });
});
