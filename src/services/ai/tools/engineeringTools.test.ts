import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EngineeringToolDispatcher,
  ProjectExecutionContext,
  ApprovalTokenBinding
} from './engineeringTools';
import {
  createXbridgesDelegate,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge
} from '../../../agent/toolAdapters/xbridgesAdapter';

function createMockLiveState() {
  let nodes: ReactFlowXbridgesNode[] = [];
  let edges: ReactFlowXbridgesEdge[] = [];
  let saveCount = 0;

  const delegate = createXbridgesDelegate({
    getNodes: () => nodes,
    getEdges: () => edges,
    setNodes: (updater) => {
      nodes = typeof updater === 'function' ? updater(nodes) : updater;
    },
    setEdges: (updater) => {
      edges = typeof updater === 'function' ? updater(edges) : updater;
    },
    onSave: () => {
      saveCount++;
    }
  });

  return {
    delegate,
    getRawNodes: () => nodes,
    getRawEdges: () => edges,
    getSaveCount: () => saveCount
  };
}

describe('Engineering Tools Boundary with Live State and Token Binding', () => {
  let liveState: ReturnType<typeof createMockLiveState>;
  let validTokens: Map<string, ApprovalTokenBinding>;
  let currentRevision: number;

  beforeEach(() => {
    liveState = createMockLiveState();
    currentRevision = 3;
    validTokens = new Map([
      [
        'token_add_b1',
        {
          token: 'token_add_b1',
          projectId: 'proj_test',
          baseRevision: 3,
          toolName: 'add_block'
        }
      ],
      [
        'token_set_p1',
        {
          token: 'token_set_p1',
          projectId: 'proj_test',
          baseRevision: 3,
          toolName: 'set_parameter'
        }
      ],
      [
        'token_conn_1',
        {
          token: 'token_conn_1',
          projectId: 'proj_test',
          baseRevision: 3,
          toolName: 'connect_ports'
        }
      ]
    ]);
  });

  function makeDispatcher(connected = true): EngineeringToolDispatcher {
    const contextProvider = (): ProjectExecutionContext => ({
      projectId: 'proj_test',
      currentRevision,
      validTokens,
      xbridgesDelegate: connected ? liveState.delegate : undefined,
      diagnostics: []
    });
    return new EngineeringToolDispatcher(contextProvider);
  }

  describe('Context Provider Requirement', () => {
    it('throws when initialized without a valid context provider', () => {
      expect(() => new (EngineeringToolDispatcher as any)()).toThrow(
        /context provider is required/i
      );
    });
  });

  describe('Read Tools and Project Scoping', () => {
    it('search_blocks returns catalog results deterministically', async () => {
      const dispatcher = makeDispatcher();
      const result = await dispatcher.execute('search_blocks', {
        query: 'THREE_PHASE_INVERTER'
      });
      expect(result.status).toBe('SUCCESS');
      if (result.status === 'SUCCESS') {
        expect((result.data as any).matches.length).toBeGreaterThan(0);
        expect((result.data as any).matches[0].block.id).toBe('THREE_PHASE_INVERTER');
      }
    });

    it('rejects read operations when requested projectId does not match active project', async () => {
      const dispatcher = makeDispatcher();
      const result = await dispatcher.execute('inspect_model', {
        projectId: 'foreign_unauthorized_project'
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).error).toMatch(/access denied/i);
    });

    it('inspect_model and get_model_summary reflect real live delegate state', async () => {
      const dispatcher = makeDispatcher();

      // Empty live state initially
      const initialInspect = await dispatcher.execute('inspect_model', {
        projectId: 'proj_test'
      });
      expect(initialInspect.status).toBe('SUCCESS');
      expect((initialInspect as any).data.blocks).toHaveLength(0);

      // Mutate live delegate directly
      await liveState.delegate.addBlock('THREE_PHASE_INVERTER', { id: 'inv_1' });

      // Next inspect MUST reflect the real node created!
      const afterInspect = await dispatcher.execute('inspect_model', {
        projectId: 'proj_test'
      });
      expect(afterInspect.status).toBe('SUCCESS');
      expect((afterInspect as any).data.blocks).toHaveLength(1);
      expect((afterInspect as any).data.blocks[0].id).toBe('inv_1');

      // Summary also reflects real count
      const summary = await dispatcher.execute('get_model_summary', {
        projectId: 'proj_test'
      });
      expect(summary.status).toBe('SUCCESS');
      expect((summary as any).data.blockCount).toBe(1);
    });

    it('returns DELEGATE_UNAVAILABLE when delegate is not connected for inspect_model', async () => {
      const disconnectedDispatcher = makeDispatcher(false);
      const result = await disconnectedDispatcher.execute('inspect_model', {
        projectId: 'proj_test'
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).diagnostics?.[0]?.code).toBe('DELEGATE_UNAVAILABLE');
    });
  });

  describe('Live Mutations and Token Binding', () => {
    it('executes add_block on the real delegate and verifies state change', async () => {
      const dispatcher = makeDispatcher();

      const result = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_add_b1',
        blockId: 'dc_1',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        name: 'DC Source 1',
        domain: 'xbridges'
      });

      expect(result.status).toBe('SUCCESS');
      expect(liveState.getRawNodes()).toHaveLength(1);
      expect(liveState.getSaveCount()).toBe(1);

      // Re-inspection confirms mutation is visible
      const inspect = await dispatcher.execute('inspect_model', {
        projectId: 'proj_test'
      });
      expect((inspect as any).data.blocks).toHaveLength(1);
    });

    it('prevents approval token reuse (token consumed on use)', async () => {
      const dispatcher = makeDispatcher();

      // First use succeeds
      const first = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_add_b1',
        blockId: 'dc_1',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        name: 'DC Source 1',
        domain: 'xbridges'
      });
      expect(first.status).toBe('SUCCESS');

      // Second use with the same token MUST fail!
      const second = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_add_b1',
        blockId: 'dc_2',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        name: 'DC Source 2',
        domain: 'xbridges'
      });
      expect(second.status).toBe('FAILURE');
      expect((second as any).error).toMatch(/invalid, expired, or mismatched/i);
    });

    it('rejects token bound to another tool or wrong revision', async () => {
      const dispatcher = makeDispatcher();

      // Try to use 'token_add_b1' (bound to add_block) for set_parameter
      const result = await dispatcher.execute('set_parameter', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_add_b1',
        blockId: 'dc_1',
        parameterName: 'voltage',
        value: 500
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).error).toMatch(/invalid, expired, or mismatched/i);
    });

    it('returns DELEGATE_UNAVAILABLE and leaves state unchanged when delegate is missing', async () => {
      const disconnectedDispatcher = makeDispatcher(false);

      const result = await disconnectedDispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_add_b1',
        blockId: 'dc_1',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        name: 'DC Source 1',
        domain: 'xbridges'
      });

      expect(result.status).toBe('FAILURE');
      expect((result as any).diagnostics?.[0]?.code).toBe('DELEGATE_UNAVAILABLE');
      expect(liveState.getRawNodes()).toHaveLength(0);
    });
  });
});
