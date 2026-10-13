import {
  EngineeringArchitecturePlan,
  InformationRequirement
} from '../contracts/architecturePlan';
import { ProjectMemoryManager } from '../memory/projectMemory';

export type ClarificationDecision =
  | {
      type: 'clarification_needed';
      slot: InformationRequirement;
      prompt: string;
      alternatives?: { value: unknown; rationale: string }[];
    }
  | {
      type: 'all_resolved';
    };

export interface SlotAnswer {
  slotId: string;
  value: unknown;
  projectId?: string;
}

export type AnswerResult =
  | {
      success: true;
      parsedValue: unknown;
      updatedPlan: EngineeringArchitecturePlan;
    }
  | {
      success: false;
      error: string;
      correctionPrompt: string;
    };

export class ClarificationManager {
  /**
   * Identifies the next unresolved REQUIRED slot ranked by architecture impact and dependency order.
   * If all REQUIRED slots are resolved, returns all_resolved.
   */
  public next(plan: EngineeringArchitecturePlan): ClarificationDecision {
    const unresolvedRequired = plan.informationRequirements.filter(
      r => r.classification === 'REQUIRED' && r.resolutionState === 'unresolved'
    );

    if (unresolvedRequired.length === 0) {
      return { type: 'all_resolved' };
    }

    // Rank by architecture impact:
    // 1. Number of affected decisions descending
    // 2. Number of candidate alternatives descending
    // 3. Alphabetical tie-breaker
    const ranked = [...unresolvedRequired].sort((a, b) => {
      const diffDecisions = b.affectedDecisions.length - a.affectedDecisions.length;
      if (diffDecisions !== 0) return diffDecisions;

      const diffCandidates = b.candidateValues.length - a.candidateValues.length;
      if (diffCandidates !== 0) return diffCandidates;

      return a.slotName.localeCompare(b.slotName);
    });

    const topSlot = ranked[0];

    // Find if this slot affects any specific design decision with rationale
    let alternatives: { value: unknown; rationale: string }[] | undefined = undefined;
    const matchedDecision = plan.designDecisions.find(d =>
      topSlot.affectedDecisions.includes(d.id) || d.id.includes(topSlot.slotName)
    );

    if (matchedDecision && matchedDecision.consideredAlternatives.length > 0) {
      alternatives = matchedDecision.consideredAlternatives.map(alt => ({
        value: alt,
        rationale: matchedDecision.rationale
      }));
    } else if (topSlot.candidateValues.length > 0) {
      alternatives = topSlot.candidateValues.map(v => ({
        value: v,
        rationale: `Candidate value for ${topSlot.slotName}`
      }));
    }

    const prompt = topSlot.reason || `Please specify ${topSlot.slotName} for the system architecture.`;

    return {
      type: 'clarification_needed',
      slot: topSlot,
      prompt,
      alternatives
    };
  }

  /**
   * Parses an answer through the slot's declared schema, validates it, and returns the updated plan.
   * If invalid, returns a precise correction prompt.
   */
  public applyAnswer(
    plan: EngineeringArchitecturePlan,
    answer: SlotAnswer,
    projectMemory?: ProjectMemoryManager
  ): AnswerResult {
    const slotIndex = plan.informationRequirements.findIndex(
      r => r.id === answer.slotId || r.slotName === answer.slotId
    );

    if (slotIndex === -1) {
      return {
        success: false,
        error: `Slot '${answer.slotId}' not found in architecture plan`,
        correctionPrompt: `Please provide an answer for one of the active slots in the plan.`
      };
    }

    const slot = plan.informationRequirements[slotIndex];

    // Type parsing and validation
    let parsedValue: unknown = answer.value;

    if (slot.valueSchema === 'number') {
      if (typeof answer.value === 'string') {
        const num = parseFloat(answer.value.trim());
        if (isNaN(num)) {
          return {
            success: false,
            error: `Expected number for slot '${slot.slotName}', got '${answer.value}'`,
            correctionPrompt: `Please enter a valid numeric value for ${slot.slotName}.`
          };
        }
        parsedValue = num;
      } else if (typeof answer.value !== 'number' || isNaN(answer.value)) {
        return {
          success: false,
          error: `Expected number for slot '${slot.slotName}', got '${typeof answer.value}'`,
          correctionPrompt: `Please enter a valid numeric value for ${slot.slotName}.`
        };
      }
    } else if (slot.valueSchema === 'boolean') {
      if (typeof answer.value === 'string') {
        const lower = answer.value.trim().toLowerCase();
        if (['true', 'yes', '1'].includes(lower)) parsedValue = true;
        else if (['false', 'no', '0'].includes(lower)) parsedValue = false;
        else {
          return {
            success: false,
            error: `Expected boolean for slot '${slot.slotName}', got '${answer.value}'`,
            correctionPrompt: `Please answer with yes/no or true/false for ${slot.slotName}.`
          };
        }
      }
    }

    // Candidate validation
    if (slot.candidateValues.length > 0) {
      const match = slot.candidateValues.find(c => String(c).toLowerCase() === String(parsedValue).toLowerCase());
      if (match === undefined) {
        return {
          success: false,
          error: `Invalid value '${parsedValue}' for slot '${slot.slotName}'.`,
          correctionPrompt: `Allowed options for ${slot.slotName} are: [${slot.candidateValues.join(', ')}].`
        };
      }
      parsedValue = match;
    }

    // Clone plan and update slot
    const updatedPlan: EngineeringArchitecturePlan = {
      ...plan,
      informationRequirements: plan.informationRequirements.map((r, idx) =>
        idx === slotIndex
          ? {
              ...r,
              resolutionState: 'resolved' as const,
              resolvedValue: parsedValue
            }
          : r
      )
    };

    // Update any design decision matching this slot
    for (const dec of updatedPlan.designDecisions) {
      if (dec.id.includes(slot.slotName) || slot.affectedDecisions.includes(dec.id)) {
        if (dec.consideredAlternatives.includes(String(parsedValue))) {
          dec.selectedAlternative = String(parsedValue);
        }
      }
    }

    // Update project memory if available
    if (projectMemory && answer.projectId) {
      projectMemory.recordDecision(answer.projectId, {
        decisionKey: slot.slotName,
        title: `Clarification for ${slot.slotName}`,
        value: parsedValue,
        rationale: `Clarified by user: ${slot.reason}`,
        approvedBy: 'user',
        provenance: { source: 'user_approval' }
      });
      projectMemory.resolveSlot(answer.projectId, slot.slotName, parsedValue);
    }

    return {
      success: true,
      parsedValue,
      updatedPlan
    };
  }
}
