import { describe, it, expect } from 'vitest';
import { ConversationMemoryManager } from './conversationMemory';
import { ProjectMemoryManager } from './projectMemory';
import { ModelMemoryManager } from './modelMemory';
import {
  AgentPersistence,
  AGENT_PERSISTENCE_SCHEMA_VERSION
} from '../../../../agent/agentPersistence';

describe('Separated Memory Layers (Conversation, Project, Model)', () => {
  describe('ConversationMemoryManager - Isolation', () => {
    it('isolates conversation turns per session and does not leak into new chats', () => {
      const convManager = new ConversationMemoryManager();
      const session1 = convManager.createSession('session_1');

      convManager.recordTurn('session_1', {
        role: 'user',
        content: 'Design a 24V BLDC motor'
      });
      convManager.recordTurn('session_1', {
        role: 'assistant',
        content: 'I will create a 24V BLDC motor architecture'
      });

      expect(convManager.getTurns('session_1')).toHaveLength(2);

      // Create a brand new session (new chat)
      const session2 = convManager.createSession('session_2');
      expect(convManager.getTurns('session_2')).toHaveLength(0);

      // Verify session 1 is unaffected
      expect(convManager.getTurns('session_1')).toHaveLength(2);
    });
  });

  describe('ProjectMemoryManager - Scoped Decisions & Supersession', () => {
    it('records decisions with provenance, timestamp, and supersession metadata', () => {
      const projManager = new ProjectMemoryManager();
      const projectId = 'proj.robot.arm';

      const d1 = projManager.recordDecision(projectId, {
        decisionKey: 'commutation_strategy',
        title: 'Commutation Strategy',
        value: 'six_step',
        rationale: 'Initial baseline for trapezoidal drive',
        approvedBy: 'lead.engineer',
        provenance: { source: 'user_approval' }
      });

      expect(d1.id).toBeDefined();
      expect(d1.status).toBe('active');
      expect(d1.approvedAt).toBeGreaterThan(0);

      const active1 = projManager.listActiveDecisions(projectId);
      expect(active1).toHaveLength(1);
      expect(active1[0].value).toBe('six_step');

      // Now supersede with FOC
      const d2 = projManager.recordDecision(projectId, {
        decisionKey: 'commutation_strategy',
        title: 'Commutation Strategy',
        value: 'foc',
        rationale: 'Upgraded to field oriented control for reduced torque ripple',
        approvedBy: 'lead.engineer',
        supersedes: d1.id,
        provenance: { source: 'user_approval' }
      });

      expect(d2.status).toBe('active');
      expect(d2.supersedes).toBe(d1.id);

      const active2 = projManager.listActiveDecisions(projectId);
      expect(active2).toHaveLength(1);
      expect(active2[0].value).toBe('foc');

      // Old decision d1 is now superseded
      const history = projManager.getDecisionHistory(projectId, 'commutation_strategy');
      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('superseded');
      expect(history[1].status).toBe('active');
    });
  });

  describe('ModelMemoryManager - Revisions & Snapshots', () => {
    it('stores monotonic revisions and fingerprints for a model', () => {
      const modelManager = new ModelMemoryManager();
      const modelId = 'model.bldc.001';

      modelManager.recordSnapshot({
        modelId,
        projectId: 'proj.robot.arm',
        revision: 0,
        name: 'Initial BLDC Architecture',
        targetDomain: 'xbridges',
        timestamp: 1000,
        modelIrHash: 'hash_rev_0'
      });

      modelManager.recordSnapshot({
        modelId,
        projectId: 'proj.robot.arm',
        revision: 1,
        name: 'Sensorless BLDC Architecture',
        targetDomain: 'xbridges',
        timestamp: 2000,
        modelIrHash: 'hash_rev_1'
      });

      const rev0 = modelManager.getRevision(modelId, 0);
      expect(rev0?.modelIrHash).toBe('hash_rev_0');

      const latest = modelManager.getLatest(modelId);
      expect(latest?.revision).toBe(1);
      expect(latest?.modelIrHash).toBe('hash_rev_1');
    });
  });

  describe('AgentPersistence - Version 2 Migration & Fail-Safe Restoration', () => {
    it('deserializes Version 1 payload and migrates safely to Version 2 without data loss', () => {
      const legacyV1Payload = {
        version: 1,
        requirementState: {
          id: 'req-1',
          objective: 'Test legacy model',
          targetSystem: 'motor',
          inputs: {},
          constraints: [],
          assumptions: [],
          conflicts: [],
          status: 'clarified'
        },
        taskState: {
          id: 'task-1',
          status: 'executing', // Was interrupted!
          objective: 'Test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          clarificationRound: 0,
          pendingApprovals: [],
          history: [],
          auditHistory: []
        },
        pendingApprovals: [
          {
            id: 'app-1',
            type: 'plan',
            title: 'Plan Approval',
            description: 'desc',
            status: 'pending',
            createdAt: new Date().toISOString(),
            payload: {}
          }
        ],
        auditTrail: [],
        lastSavedAt: new Date().toISOString()
      };

      const json = JSON.stringify(legacyV1Payload);
      const deserialized = AgentPersistence.deserialize(json);
      expect(deserialized.version).toBe(AGENT_PERSISTENCE_SCHEMA_VERSION);
      expect(deserialized.requirementState.objective).toBe('Test legacy model');

      // Fail-safe restore invalidates approvals and marks executing as blocked requires_review
      const restored = AgentPersistence.restoreSafely(deserialized);
      expect(restored.taskState.status).toBe('blocked');
      expect(restored.taskState.blockedReason).toContain('Approval tokens cannot cross application restart boundaries');
      expect(restored.pendingApprovals[0].status).toBe('cancelled');
    });
  });
});
