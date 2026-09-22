import { describe, it, expect, beforeEach } from 'vitest';
import { RequirementAnswerResolver } from './requirementAnswerResolver';
import { ConversationMemoryManager } from '../memory/conversationMemory';
import { StructuredRequestExtractor } from './structuredRequestExtractor';
import { ActiveRequestSession } from '../contracts/structuredEngineeringRequest';

describe('RequirementAnswerResolver', () => {
  let memoryManager: ConversationMemoryManager;
  let resolver: RequirementAnswerResolver;
  let extractor: StructuredRequestExtractor;

  beforeEach(() => {
    memoryManager = new ConversationMemoryManager();
    resolver = new RequirementAnswerResolver(memoryManager);
    extractor = new StructuredRequestExtractor();
  });

  describe('Operand clarification flow', () => {
    it('resolves "10 and 20" into operands for "Create a model adding two numbers"', () => {
      // 1. Initial request requiring clarification
      const initResult = extractor.extract('Create a model adding two numbers');
      expect(initResult.status).toBe('clarification_required');
      if (initResult.status !== 'clarification_required') return;

      const session: ActiveRequestSession = {
        sessionId: 'test_session_1',
        projectId: 'project_alpha',
        request: initResult.request,
        activeSlotId: initResult.blockingRequirement.id,
        answeredSlotIds: [],
        state: 'clarifying',
        revision: 1
      };
      memoryManager.setActiveRequestSession('test_session_1', session);

      // 2. User answers "10 and 20"
      const answerResult = resolver.resolveAnswer('test_session_1', '10 and 20');
      expect(answerResult.status).toBe('resolved');
      if (answerResult.status !== 'resolved') return;

      // Assert session updated atomically
      expect(answerResult.session.revision).toBe(2);
      expect(answerResult.session.answeredSlotIds).toContain(session.activeSlotId);
      expect(answerResult.session.activeSlotId).toBeUndefined();
      expect(answerResult.session.state).toBe('planning');

      // Assert operands added to request
      const values = answerResult.session.request.values;
      expect(values).toHaveLength(2);
      expect(values.map(v => v.normalizedValue)).toEqual([10, 20]);

      // Assert Constant entities created for values
      const constEntities = answerResult.session.request.entities.filter(e => e.semanticType === 'Constant');
      expect(constEntities).toHaveLength(2);

      // Assert resolved slot is marked resolved
      const resolvedSlot = answerResult.session.request.unresolvedRequirements.find(
        r => r.slotName === 'operands'
      );
      expect(resolvedSlot?.status).toBe('resolved');
      expect(resolvedSlot?.resolvedValue).toEqual([10, 20]);
    });

    it('rejects answers that do not satisfy the active slot schema with a replacement question and no revision change', () => {
      const initResult = extractor.extract('Create a model adding two numbers');
      if (initResult.status !== 'clarification_required') return;

      const session: ActiveRequestSession = {
        sessionId: 'test_session_invalid',
        projectId: 'project_alpha',
        request: initResult.request,
        activeSlotId: initResult.blockingRequirement.id,
        answeredSlotIds: [],
        state: 'clarifying',
        revision: 1
      };
      memoryManager.setActiveRequestSession('test_session_invalid', session);

      // User answers gibberish
      const answerResult = resolver.resolveAnswer('test_session_invalid', 'blue skies and green trees');
      expect(answerResult.status).toBe('rejected');
      if (answerResult.status !== 'rejected') return;

      expect(answerResult.session.revision).toBe(1); // Revision did NOT increment
      expect(answerResult.replacementQuestion).toMatch(/numeric values|numbers|operands/i);

      // Verify active slot in memory remains unresolved
      const currentSession = memoryManager.getActiveRequestSession('test_session_invalid');
      expect(currentSession?.revision).toBe(1);
      expect(currentSession?.activeSlotId).toBe(session.activeSlotId);
    });
  });

  describe('Observability clarification flow', () => {
    it('resolves "display output on Scope" into Scope entity and relationship', () => {
      const initResult = extractor.extract('Multiply 10 by 20');
      if (initResult.status !== 'ready') return;

      // Manually add an unresolved observability slot to test observability resolution
      const obsSlot = {
        id: `slot_obs_${initResult.request.requestId}`,
        slotName: 'observability',
        classification: 'OPTIONAL' as const,
        valueSchema: 'string',
        prompt: 'Would you like to observe the output on a Scope?',
        reason: 'Observability routing',
        affectedDecisionIds: ['mul_scope'],
        status: 'unresolved' as const
      };

      const requestWithSlot = {
        ...initResult.request,
        unresolvedRequirements: [obsSlot]
      };

      const session: ActiveRequestSession = {
        sessionId: 'test_session_obs',
        projectId: 'project_alpha',
        request: requestWithSlot,
        activeSlotId: obsSlot.id,
        answeredSlotIds: [],
        state: 'clarifying',
        revision: 1
      };
      memoryManager.setActiveRequestSession('test_session_obs', session);

      const answerResult = resolver.resolveAnswer('test_session_obs', 'Display output on Scope');
      expect(answerResult.status).toBe('resolved');
      if (answerResult.status !== 'resolved') return;

      expect(answerResult.session.request.requestedOutputs).toContain('scope');
      expect(answerResult.session.request.entities.some(e => e.semanticType === 'Scope')).toBe(true);
      expect(answerResult.session.request.relationships.some(r => r.type === 'observes')).toBe(true);
    });
  });

  describe('Session lifecycle controls', () => {
    it('supports explicit "cancel" command', () => {
      const initResult = extractor.extract('Create a model adding two numbers');
      if (initResult.status !== 'clarification_required') return;

      const session: ActiveRequestSession = {
        sessionId: 'test_session_cancel',
        projectId: 'project_alpha',
        request: initResult.request,
        activeSlotId: initResult.blockingRequirement.id,
        answeredSlotIds: [],
        state: 'clarifying',
        revision: 1
      };
      memoryManager.setActiveRequestSession('test_session_cancel', session);

      const result = resolver.resolveAnswer('test_session_cancel', 'cancel');
      expect(result.status).toBe('cancelled');
      expect(result.session?.state).toBe('cancelled');
    });

    it('supports explicit "restart" command', () => {
      const initResult = extractor.extract('Create a model adding two numbers');
      if (initResult.status !== 'clarification_required') return;

      const session: ActiveRequestSession = {
        sessionId: 'test_session_restart',
        projectId: 'project_alpha',
        request: initResult.request,
        activeSlotId: initResult.blockingRequirement.id,
        answeredSlotIds: [],
        state: 'clarifying',
        revision: 1
      };
      memoryManager.setActiveRequestSession('test_session_restart', session);

      const result = resolver.resolveAnswer('test_session_restart', 'restart');
      expect(result.status).toBe('restarted');
    });

    it('never repeats already-resolved questions', () => {
      const initResult = extractor.extract('Create a model adding two numbers');
      if (initResult.status !== 'clarification_required') return;

      const slotId = initResult.blockingRequirement.id;
      const session: ActiveRequestSession = {
        sessionId: 'test_session_repeat',
        projectId: 'project_alpha',
        request: initResult.request,
        activeSlotId: slotId,
        answeredSlotIds: [],
        state: 'clarifying',
        revision: 1
      };
      memoryManager.setActiveRequestSession('test_session_repeat', session);

      // Resolve it
      const firstAnswer = resolver.resolveAnswer('test_session_repeat', '10 and 20');
      expect(firstAnswer.status).toBe('resolved');
      expect(firstAnswer.session?.answeredSlotIds).toContain(slotId);

      // If extractor or caller asks about the slot again, resolver confirms it is already resolved
      expect(resolver.isSlotAnswered('test_session_repeat', slotId)).toBe(true);
    });
  });
});
