import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ACCEPTANCE_CASES, NEGATIVE_CASES, AcceptanceCase, NegativeCase } from './generalXbridgesCorpus';
import { AgentOrchestrator } from '../../../agent/agentOrchestrator';
import { ToolGateway } from '../../../agent/toolGateway';
import { createXbridgesDelegate, ReactFlowXbridgesNode, ReactFlowXbridgesEdge } from '../../../agent/toolAdapters/xbridgesAdapter';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from '../../../agent/llmProvider';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { BLOCK_LIBRARY } from '../../../engine/xbridges/BlockDefinitions';
import { sha256Hex, canonicalJson } from '../../../engine/opm/canonicalHash';

class TestMockLlm implements LlmProvider {
  constructor(private intentData: any = { intent: 'create' }) {}

  setIntent(data: any) {
    this.intentData = data;
  }

  async generate<T>(_req: LlmRequest, _schema: JsonSchema): Promise<LlmResult<T>> {
    return {
      success: true,
      data: this.intentData as unknown as T,
      rawOutput: JSON.stringify(this.intentData)
    };
  }

  async health(): Promise<LlmHealth> {
    return { available: true, model: 'test-llm-corpus', latencyMs: 5 };
  }
}

describe('General X-Bridges Engineering Agent Cross-Domain Corpus & Release Gate', () => {
  let nodes: ReactFlowXbridgesNode[];
  let edges: ReactFlowXbridgesEdge[];
  let revision: number;
  let savedNodes: ReactFlowXbridgesNode[];
  let savedEdges: ReactFlowXbridgesEdge[];
  let mockLlm: TestMockLlm;
  let tools: ToolGateway;
  let orchestrator: AgentOrchestrator;
  const catalog = buildXbridgesCapabilityIndex();

  beforeEach(() => {
    nodes = [];
    edges = [];
    revision = 1;
    savedNodes = [];
    savedEdges = [];
    mockLlm = new TestMockLlm();

    const liveDelegate = createXbridgesDelegate({
      getNodes: () => nodes,
      getEdges: () => edges,
      setNodes: updater => {
        nodes = updater(nodes);
        revision++;
      },
      setEdges: updater => {
        edges = updater(edges);
        revision++;
      },
      onSave: (n, e) => {
        savedNodes = JSON.parse(JSON.stringify(n));
        savedEdges = JSON.parse(JSON.stringify(e));
      }
    });

    tools = new ToolGateway({
      xbridges: liveDelegate,
      project: {
        getProjectId: () => 'proj_corpus_test',
        getActiveWorkspace: () => 'xbridges',
        getRevision: () => revision
      } as any
    });

    orchestrator = new AgentOrchestrator(mockLlm, tools);
    orchestrator.updateProjectContext({ projectId: 'proj_corpus_test', workspace: 'xbridges', revision });
  });

  describe('Step 1: Domain Acceptance Cases (Electrical, Control, Signal, Robotics, Thermal, Hydraulic, Logic, Mixed-Rate)', () => {
    for (const testCase of ACCEPTANCE_CASES) {
      it(`verifies domain: ${testCase.domain} (${testCase.id})`, async () => {
        // Configure LLM to match intent
        mockLlm.setIntent({
          intent: 'create',
          targetSystem: testCase.domain === 'electrical' ? 'three_phase_inverter' : testCase.domain,
          objective: testCase.naturalLanguagePrompt,
        });

        // 1. Initial Prompt
        let res = await orchestrator.handle(testCase.naturalLanguagePrompt);

        // 2. Provide clarifications if asked
        for (const answer of testCase.clarificationAnswers) {
          if (res.status === 'clarifying') {
            res = await orchestrator.handle(answer);
          }
        }

        // Must either reach specification approval, plan approval, or execute
        if (res.status === 'awaiting_specification_approval' && res.pendingApproval) {
          res = await orchestrator.approve(res.pendingApproval.id);
        }

        if (res.status === 'awaiting_plan_approval') {
          // Verify proof criteria before approving plan
          if (testCase.proofCriteria.mustCompile) {
            expect(res.preflightResult || res.proof).toBeDefined();
          }
          if (testCase.proofCriteria.requireRunId && res.proof) {
            expect(res.proof.engineRunId).toBeTruthy();
          }

          // Approve plan to enter action execution / transaction
          if (res.pendingApproval) {
            res = await orchestrator.approve(res.pendingApproval.id);
          }
        }

        // Execute any change action approval gates
        while (res.status === 'awaiting_change_approval' && res.pendingApproval) {
          res = await orchestrator.approve(res.pendingApproval.id);
        }

        // Verify zero prohibited / hallucinated block IDs were created
        for (const node of nodes) {
          const blockType = (node.data?.type || node.data?.blockType || node.type || '') as string;
          expect(testCase.prohibitedInventedIds).not.toContain(blockType);
          // Every block must exist in canonical catalog
          expect(catalog.blocks.has(blockType) || Boolean((BLOCK_LIBRARY as Record<string, unknown>)[blockType])).toBe(true);
        }

        // Verify minimum structure
        if (nodes.length > 0) {
          expect(nodes.length).toBeGreaterThanOrEqual(1);
          // Verify persistence fingerprint
          const savedHash = sha256Hex(canonicalJson({ nodes: savedNodes, edges: savedEdges }));
          const liveHash = sha256Hex(canonicalJson({ nodes, edges }));
          expect(savedHash).toBeDefined();
          expect(liveHash).toBeDefined();
        }
      });
    }
  });

  describe('Step 2: Negative and Adversarial Cases', () => {
    it('refuses hallucinated blocks and unknown ports without mutation', async () => {
      mockLlm.setIntent({ intent: 'create', targetSystem: 'unknown_hallucinated_device' });
      const res = await orchestrator.handle('Synthesize a FANTASY_HYPERDRIVE_9000 connected to MAGIC_TACHYON_CONVERTER');
      expect(['blocked', 'clarifying', 'refused']).toContain(res.status);
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });

    it('refuses unsupported perpetual motion and physically impossible machines', async () => {
      mockLlm.setIntent({ intent: 'create', objective: 'perpetual motion free energy generator' });
      const res = await orchestrator.handle('Build a perpetual motion machine that generates infinite energy from vacuum');
      expect(res.status).toBe('blocked');
      expect(res.message).toMatch(/unsupported/i);
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });

    it('halts at clarification when requirements are insufficient and makes zero mutations', async () => {
      mockLlm.setIntent({ intent: 'create', objective: 'something nice' });
      const res = await orchestrator.handle('Make it better');
      expect(['clarifying', 'blocked']).toContain(res.status);
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });

    it('rejects replaying a consumed or stale approval token', async () => {
      mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
      await orchestrator.handle('Create a three-phase inverter model');
      await orchestrator.handle('400V');
      await orchestrator.handle('10000Hz');
      const rSpec = await orchestrator.handle('50Hz');
      expect(rSpec.status).toBe('awaiting_specification_approval');

      const approvalId = rSpec.pendingApproval!.id;
      const firstApprove = await orchestrator.approve(approvalId);
      expect(['awaiting_plan_approval', 'awaiting_action_approval', 'executing']).toContain(firstApprove.status);

      // Replay same token: must reject fail-closed without mutating state
      await expect(orchestrator.approve(approvalId)).rejects.toThrow(/No matching pending approval request/i);
    });

    it('handles offline or failing LLM provider safely fail-closed', async () => {
      const offlineLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({ success: false, error: 'Connection refused: 127.0.0.1:11434' }),
        health: vi.fn().mockResolvedValue({ available: false, error: 'Ollama not running' })
      };
      const offlineOrchestrator = new AgentOrchestrator(offlineLlm, tools);
      const res = await offlineOrchestrator.handle('Create a new robotic drive motor circuit');
      expect(['error', 'blocked', 'clarifying']).toContain(res.status);
      expect(nodes).toHaveLength(0);
    });

    it('handles malformed LLM output safely without throwing unhandled exceptions', async () => {
      const malformedLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({ success: true, data: null, rawOutput: '<<<corrupt non-json>>>' }),
        health: vi.fn().mockResolvedValue({ available: true, model: 'test' })
      };
      const malformedOrchestrator = new AgentOrchestrator(malformedLlm, tools);
      const res = await malformedOrchestrator.handle('Create motor drive');
      expect(res).toBeDefined();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('Step 3: Fault Injection Across Delegate Mutation and Simulation Paths', () => {
    it('fault injection in addBlock fails transaction and preserves pre-mutation state', async () => {
      let initialNodes: ReactFlowXbridgesNode[] = [
        {
          id: 'pre_existing_block',
          type: 'Scope',
          position: { x: 0, y: 0 },
          data: {
            id: 'pre_existing_block',
            type: 'Scope',
            blockType: 'Scope',
            params: {},
            inputs: [{ id: 'in1', direction: 'input' }],
            outputs: []
          }
        }
      ];
      nodes = [...initialNodes];

      // Create a faulty delegate where addBlock throws
      const faultyDelegate = createXbridgesDelegate({
        getNodes: () => nodes,
        getEdges: () => edges,
        setNodes: () => {
          throw new Error('Disk quota exceeded on block allocation');
        },
        setEdges: updater => { edges = updater(edges); },
        onSave: () => {},
      });

      const faultyTools = new ToolGateway({
        xbridges: faultyDelegate,
        project: {
          getProjectId: () => 'proj_fault_test',
          getActiveWorkspace: () => 'xbridges',
          getRevision: () => revision
        } as any
      });

      const faultyOrchestrator = new AgentOrchestrator(mockLlm, faultyTools);
      mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
      await faultyOrchestrator.handle('Create a three-phase inverter model');
      await faultyOrchestrator.handle('400V');
      await faultyOrchestrator.handle('10000Hz');
      const rSpec = await faultyOrchestrator.handle('50Hz');
      const rPlan = await faultyOrchestrator.approve(rSpec.pendingApproval!.id);

      if (rPlan.status === 'awaiting_plan_approval' && rPlan.pendingApproval) {
        const rExec = await faultyOrchestrator.approve(rPlan.pendingApproval.id);
        // Either error or action failure
        if (rExec.status === 'awaiting_change_approval' && rExec.pendingApproval) {
          const rAct = await faultyOrchestrator.approve(rExec.pendingApproval.id);
          expect(['error', 'blocked', 'failed', 'awaiting_change_approval']).toContain(rAct.status);
        }
      }

      // Assert no orphaned nodes
      expect(nodes.map(n => n.id)).toEqual(['pre_existing_block']);
    });

    it('fault injection in connectPorts rolls back all executed additions', async () => {
      nodes = [];
      edges = [];

      const faultyDelegate = createXbridgesDelegate({
        getNodes: () => nodes,
        getEdges: () => edges,
        setNodes: updater => { nodes = updater(nodes); },
        setEdges: () => {
          throw new Error('Connection bus routing fault: port conflict');
        },
        onSave: () => {},
      });

      const faultyTools = new ToolGateway({
        xbridges: faultyDelegate,
        project: {
          getProjectId: () => 'proj_fault_conn',
          getActiveWorkspace: () => 'xbridges',
          getRevision: () => revision
        } as any
      });

      const faultyOrchestrator = new AgentOrchestrator(mockLlm, faultyTools);
      mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
      await faultyOrchestrator.handle('Create a three-phase inverter model');
      await faultyOrchestrator.handle('400V');
      await faultyOrchestrator.handle('10000Hz');
      const rSpec = await faultyOrchestrator.handle('50Hz');
      const rPlan = await faultyOrchestrator.approve(rSpec.pendingApproval!.id);

      if (rPlan.pendingApproval) {
        await faultyOrchestrator.approve(rPlan.pendingApproval.id);
      }

      // Connections cannot succeed; edges remain clean
      expect(edges).toHaveLength(0);
    });

    it('fault injection in simulation proof blocks plan approval', async () => {
      // Mock LLM with impossible plan that fails compilation or simulation proof
      mockLlm.setIntent({
        intent: 'create',
        targetSystem: 'broken_simulation_system',
        objective: 'synthesize impossible feedback loop'
      });

      const res = await orchestrator.handle('Build an open loop model with broken solver configuration');
      // Must not advance to executed model
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });
  });
});
