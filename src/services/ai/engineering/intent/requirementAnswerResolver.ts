import { sha256Hex } from '../../../../engine/opm/canonicalHash';
import {
  ActiveRequestSession,
  ExtractedValue,
  RequestEntity,
  RequestRelationship,
  UnresolvedRequirement
} from '../contracts/structuredEngineeringRequest';
import { ConversationMemoryManager } from '../memory/conversationMemory';
import { normalizeEngineeringRequest } from './requestNormalizer';

export type RequirementAnswerResolutionResult =
  | {
      status: 'resolved';
      session: ActiveRequestSession;
    }
  | {
      status: 'clarification_required';
      session: ActiveRequestSession;
      nextQuestion: string;
    }
  | {
      status: 'rejected';
      session: ActiveRequestSession;
      reason: string;
      replacementQuestion: string;
    }
  | {
      status: 'cancelled';
      session: ActiveRequestSession;
    }
  | {
      status: 'restarted';
      session?: ActiveRequestSession;
    };

export function deriveSlotId(
  requestId: string,
  slotName: string,
  affectedDecisionIds: readonly string[]
): string {
  const sorted = [...affectedDecisionIds].sort().join('_');
  const payload = `${requestId}:${slotName}:${sorted}`;
  return `slot_${sha256Hex(payload).slice(0, 16)}`;
}

export class RequirementAnswerResolver {
  constructor(private readonly memoryManager: ConversationMemoryManager) {}

  public isSlotAnswered(sessionId: string, slotId: string): boolean {
    const session = this.memoryManager.getActiveRequestSession(sessionId);
    return session ? session.answeredSlotIds.includes(slotId) : false;
  }

  public resolveAnswer(
    sessionId: string,
    answerText: string
  ): RequirementAnswerResolutionResult {
    const session = this.memoryManager.getActiveRequestSession(sessionId);
    if (!session) {
      throw new Error(`No active request session found for session ID '${sessionId}'`);
    }

    const trimmed = answerText.trim();
    const lower = trimmed.toLowerCase();

    // 1. Explicit lifecycle control commands
    if (lower === 'cancel') {
      const updatedSession: ActiveRequestSession = {
        ...session,
        state: 'cancelled',
        activeSlotId: undefined,
        revision: session.revision + 1
      };
      this.memoryManager.setActiveRequestSession(sessionId, updatedSession);
      return { status: 'cancelled', session: updatedSession };
    }

    if (lower === 'restart' || lower === 'start new request') {
      this.memoryManager.clearActiveRequestSession(sessionId);
      return { status: 'restarted' };
    }

    if (!session.activeSlotId) {
      return {
        status: 'resolved',
        session
      };
    }

    const activeSlot = session.request.unresolvedRequirements.find(
      r => r.id === session.activeSlotId
    );

    if (!activeSlot) {
      return {
        status: 'resolved',
        session
      };
    }

    // 2. Resolve against active slot
    const slotName = activeSlot.slotName;

    if (slotName === 'operands' || activeSlot.valueSchema === 'number[]') {
      return this.resolveOperandsSlot(sessionId, session, activeSlot, trimmed);
    }

    if (slotName === 'observability' || slotName === 'requestedOutputs') {
      return this.resolveObservabilitySlot(sessionId, session, activeSlot, trimmed);
    }

    if (slotName === 'control_strategy' || slotName === 'algorithm') {
      return this.resolveControlStrategySlot(sessionId, session, activeSlot, trimmed);
    }

    // Default generic slot resolution
    return this.resolveGenericSlot(sessionId, session, activeSlot, trimmed);
  }

  private resolveOperandsSlot(
    sessionId: string,
    session: ActiveRequestSession,
    slot: UnresolvedRequirement,
    answerText: string
  ): RequirementAnswerResolutionResult {
    const norm = normalizeEngineeringRequest(answerText);
    const numRegex = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/g;
    const matches = norm.normalizedText.match(numRegex);

    if (!matches || matches.length < 2) {
      return {
        status: 'rejected',
        session,
        reason: 'Input does not provide the required numeric operands.',
        replacementQuestion: `Please provide valid numeric values for the operands (e.g., "10 and 20").`
      };
    }

    const numbers = matches.slice(0, 2).map(m => parseFloat(m));

    // Clone request & session for atomic update
    const updatedRequest = { ...session.request };
    const updatedValues: ExtractedValue[] = [...updatedRequest.values];
    const updatedEntities: RequestEntity[] = [...updatedRequest.entities];
    const updatedRelationships: RequestRelationship[] = [...updatedRequest.relationships];

    numbers.forEach((num, idx) => {
      const valId = `operand_${idx + 1}`;
      updatedValues.push({
        id: valId,
        kind: 'number',
        sourceText: String(num),
        normalizedValue: num,
        confidence: 1.0
      });

      const constId = `const_${idx + 1}`;
      if (!updatedEntities.some(e => e.id === constId)) {
        updatedEntities.push({
          id: constId,
          semanticType: 'Constant',
          sourceText: String(num),
          catalogBlockId: 'Constant',
          confidence: 1.0
        });
      }
    });

    const targetOp = updatedEntities.find(e => e.semanticType === 'Sum' || e.semanticType === 'VectorMul');
    if (targetOp) {
      const constEntities = updatedEntities.filter(e => e.semanticType === 'Constant');
      constEntities.forEach((c, idx) => {
        const relId = `rel_feed_${idx + 1}`;
        if (!updatedRelationships.some(r => r.sourceEntityId === c.id && r.targetEntityId === targetOp.id)) {
          updatedRelationships.push({
            id: relId,
            type: 'feeds',
            sourceEntityId: c.id,
            targetEntityId: targetOp.id,
            sourceText: `${c.sourceText} feeds ${targetOp.semanticType}`
          });
        }
      });
    }

    const updatedSlots = updatedRequest.unresolvedRequirements.map(r =>
      r.id === slot.id ? { ...r, status: 'resolved' as const, resolvedValue: numbers } : r
    );

    updatedRequest.values = updatedValues;
    updatedRequest.entities = updatedEntities;
    updatedRequest.relationships = updatedRelationships;
    updatedRequest.unresolvedRequirements = updatedSlots;

    const remainingRequired = updatedSlots.find(
      r => r.classification === 'REQUIRED' && r.status === 'unresolved'
    );

    const answeredSlotIds = [...session.answeredSlotIds, slot.id];
    const updatedSession: ActiveRequestSession = {
      ...session,
      request: updatedRequest,
      answeredSlotIds,
      activeSlotId: remainingRequired?.id,
      state: remainingRequired ? 'clarifying' : 'planning',
      revision: session.revision + 1
    };

    this.memoryManager.setActiveRequestSession(sessionId, updatedSession);

    if (remainingRequired) {
      return {
        status: 'clarification_required',
        session: updatedSession,
        nextQuestion: remainingRequired.prompt
      };
    }

    return {
      status: 'resolved',
      session: updatedSession
    };
  }

  private resolveObservabilitySlot(
    sessionId: string,
    session: ActiveRequestSession,
    slot: UnresolvedRequirement,
    answerText: string
  ): RequirementAnswerResolutionResult {
    const lower = answerText.toLowerCase();
    const updatedRequest = { ...session.request };
    const updatedOutputs = [...updatedRequest.requestedOutputs];
    const updatedEntities = [...updatedRequest.entities];
    const updatedRelationships = [...updatedRequest.relationships];

    if (/\b(?:scope|display|show|plot|yes)\b/i.test(lower)) {
      if (!updatedOutputs.includes('scope')) {
        updatedOutputs.push('scope');
      }
      if (!updatedEntities.some(e => e.semanticType === 'Scope')) {
        updatedEntities.push({
          id: 'scope_1',
          semanticType: 'Scope',
          sourceText: answerText,
          catalogBlockId: 'Scope',
          confidence: 1.0
        });
      }

      const producer = updatedEntities.find(
        e => e.semanticType === 'VectorMul' || e.semanticType === 'Sum' || e.semanticType === 'TRANSFER_FUNCTION'
      );
      if (producer && !updatedRelationships.some(r => r.type === 'observes')) {
        updatedRelationships.push({
          id: `rel_obs_${Date.now()}`,
          type: 'observes',
          sourceEntityId: 'scope_1',
          targetEntityId: producer.id,
          sourceText: answerText
        });
      }
    }

    const updatedSlots = updatedRequest.unresolvedRequirements.map(r =>
      r.id === slot.id ? { ...r, status: 'resolved' as const, resolvedValue: answerText } : r
    );

    updatedRequest.requestedOutputs = updatedOutputs;
    updatedRequest.entities = updatedEntities;
    updatedRequest.relationships = updatedRelationships;
    updatedRequest.unresolvedRequirements = updatedSlots;

    const remainingRequired = updatedSlots.find(
      r => r.classification === 'REQUIRED' && r.status === 'unresolved'
    );

    const answeredSlotIds = [...session.answeredSlotIds, slot.id];
    const updatedSession: ActiveRequestSession = {
      ...session,
      request: updatedRequest,
      answeredSlotIds,
      activeSlotId: remainingRequired?.id,
      state: remainingRequired ? 'clarifying' : 'planning',
      revision: session.revision + 1
    };

    this.memoryManager.setActiveRequestSession(sessionId, updatedSession);

    return {
      status: 'resolved',
      session: updatedSession
    };
  }

  private resolveControlStrategySlot(
    sessionId: string,
    session: ActiveRequestSession,
    slot: UnresolvedRequirement,
    answerText: string
  ): RequirementAnswerResolutionResult {
    const updatedRequest = { ...session.request };
    const updatedSlots = updatedRequest.unresolvedRequirements.map(r =>
      r.id === slot.id ? { ...r, status: 'resolved' as const, resolvedValue: answerText } : r
    );

    updatedRequest.unresolvedRequirements = updatedSlots;
    const answeredSlotIds = [...session.answeredSlotIds, slot.id];
    const updatedSession: ActiveRequestSession = {
      ...session,
      request: updatedRequest,
      answeredSlotIds,
      activeSlotId: undefined,
      state: 'planning',
      revision: session.revision + 1
    };

    this.memoryManager.setActiveRequestSession(sessionId, updatedSession);
    return {
      status: 'resolved',
      session: updatedSession
    };
  }

  private resolveGenericSlot(
    sessionId: string,
    session: ActiveRequestSession,
    slot: UnresolvedRequirement,
    answerText: string
  ): RequirementAnswerResolutionResult {
    const updatedRequest = { ...session.request };
    const updatedSlots = updatedRequest.unresolvedRequirements.map(r =>
      r.id === slot.id ? { ...r, status: 'resolved' as const, resolvedValue: answerText } : r
    );

    updatedRequest.unresolvedRequirements = updatedSlots;
    const answeredSlotIds = [...session.answeredSlotIds, slot.id];
    const updatedSession: ActiveRequestSession = {
      ...session,
      request: updatedRequest,
      answeredSlotIds,
      activeSlotId: undefined,
      state: 'planning',
      revision: session.revision + 1
    };

    this.memoryManager.setActiveRequestSession(sessionId, updatedSession);
    return {
      status: 'resolved',
      session: updatedSession
    };
  }
}
