import { describe, it, expect, beforeEach } from 'vitest';
import { EngineeringToolDispatcher } from './engineeringTools';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';

describe('Engineering Tools Boundary', () => {
  let dispatcher: EngineeringToolDispatcher;
  const mockContext = {
    projectId: 'proj_test',
    currentRevision: 3,
    validTokens: new Set(['token_approved_123']),
    models: new Map<string, any>()
  };

  beforeEach(() => {
    dispatcher = new EngineeringToolDispatcher(() => mockContext);
  });

  describe('Read Tools', () => {
    it('search_blocks returns catalog results deterministically', async () => {
      const result = await dispatcher.execute('search_blocks', {
        query: 'THREE_PHASE_INVERTER'
      });
      expect(result.status).toBe('SUCCESS');
      if (result.status === 'SUCCESS') {
        expect((result.data as any).matches.length).toBeGreaterThan(0);
        expect((result.data as any).matches[0].block.id).toBe('THREE_PHASE_INVERTER');
      }
    });

    it('get_block_definition returns exact source library details or fails if nonexistent', async () => {
      const result = await dispatcher.execute('get_block_definition', {
        blockDefinitionId: 'resistor'
      });
      expect(result.status).toBe('SUCCESS');
      if (result.status === 'SUCCESS') {
        expect((result.data as any).block.id).toBe('resistor');
        expect((result.data as any).block.sourceLibrary).toBe('vlab');
      }

      const ghostResult = await dispatcher.execute('get_block_definition', {
        blockDefinitionId: 'ghost_block_999'
      });
      expect(ghostResult.status).toBe('FAILURE');
      expect((ghostResult as any).error).toMatch(/Block definition 'ghost_block_999' not found/);
    });

    it('inspect_model returns project summary and structure', async () => {
      const result = await dispatcher.execute('inspect_model', {
        projectId: 'proj_test'
      });
      expect(result.status).toBe('SUCCESS');
    });

    it('get_model_summary returns high-level block/connection counts', async () => {
      const result = await dispatcher.execute('get_model_summary', {
        projectId: 'proj_test'
      });
      expect(result.status).toBe('SUCCESS');
    });
  });

  describe('Mutation Intents Security & Validation', () => {
    it('rejects mutation with invalid or missing approval token', async () => {
      const result = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'invalid_token',
        blockId: 'b1',
        blockDefinitionId: 'resistor',
        name: 'Resistor 1',
        domain: 'vlab'
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).error).toMatch(/approval token/i);
    });

    it('rejects mutation when baseRevision does not match current project revision', async () => {
      const result = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 1, // Stale! Current is 3
        approvalToken: 'token_approved_123',
        blockId: 'b1',
        blockDefinitionId: 'resistor',
        name: 'Resistor 1',
        domain: 'vlab'
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).error).toMatch(/revision/i);
    });

    it('rejects mutation referencing a nonexistent blockDefinitionId', async () => {
      const result = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_approved_123',
        blockId: 'b1',
        blockDefinitionId: 'hallucinated_block_type_xyz',
        name: 'Hallucinated',
        domain: 'xbridges'
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).error).toMatch(/not found in catalog/i);
    });

    it('rejects arbitrary code or unknown fields fail-closed (strict schema)', async () => {
      const result = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_approved_123',
        blockId: 'b1',
        blockDefinitionId: 'resistor',
        name: 'Resistor 1',
        domain: 'vlab',
        arbitraryScript: 'process.exit(1)', // Forbidden!
        rawJsonReplacement: {} // Forbidden!
      });
      expect(result.status).toBe('FAILURE');
      expect((result as any).error).toMatch(/Validation failed|Unrecognized key/i);
    });

    it('executes valid add_block, set_parameter, and connect_ports mutations', async () => {
      const addResult = await dispatcher.execute('add_block', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_approved_123',
        blockId: 'inv1',
        blockDefinitionId: 'THREE_PHASE_INVERTER',
        name: 'Inverter Bridge',
        domain: 'xbridges'
      });
      expect(addResult.status).toBe('SUCCESS');

      const paramResult = await dispatcher.execute('set_parameter', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_approved_123',
        blockId: 'inv1',
        parameterName: 'Ron',
        value: 0.02
      });
      expect(paramResult.status).toBe('SUCCESS');

      const connectResult = await dispatcher.execute('connect_ports', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_approved_123',
        connectionId: 'c1',
        fromBlockId: 'src1',
        fromPortId: 'pos',
        toBlockId: 'inv1',
        toPortId: 'vdc_p',
        domain: 'xbridges'
      });
      expect(connectResult.status).toBe('SUCCESS');
    });

    it('supports undo_transaction with valid approval token', async () => {
      const undoResult = await dispatcher.execute('undo_transaction', {
        projectId: 'proj_test',
        projectRevision: 3,
        approvalToken: 'token_approved_123',
        transactionId: 'tx_123'
      });
      expect(undoResult.status).toBe('SUCCESS');
    });
  });
});
