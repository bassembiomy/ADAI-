import {
  InformationRequirement,
  ArchitectureAssumption,
  SlotClassification,
  ResolutionState
} from '../contracts/architecturePlan';

export interface SlotClassificationInput {
  slotName: string;
  definition: {
    type: string;
    default?: unknown;
    unit?: string;
    description?: string;
    required?: boolean;
    inferredFrom?: string;
  };
  userProvidedValue?: unknown;
  conceptId: string;
  candidateValues?: unknown[];
  affectedDecisions?: string[];
}

export class InformationClassifier {
  /**
   * Classifies a parameter slot into REQUIRED, OPTIONAL, INFERABLE, or DEFAULTABLE,
   * determining its resolution state and value.
   */
  public classifySlot(input: SlotClassificationInput): InformationRequirement {
    const { slotName, definition, userProvidedValue, candidateValues, affectedDecisions } = input;
    const isExplicitlyProvided = userProvidedValue !== undefined;

    let classification: SlotClassification;
    let resolutionState: ResolutionState;
    let resolvedValue: unknown | undefined = undefined;
    let reason = definition.description || `Parameter ${slotName} for ${input.conceptId}`;
    let defaultProvenance: string | undefined = undefined;

    if (isExplicitlyProvided) {
      classification = definition.required ? 'REQUIRED' : 'OPTIONAL';
      resolutionState = 'resolved';
      resolvedValue = userProvidedValue;
    } else if (definition.default !== undefined) {
      classification = 'DEFAULTABLE';
      resolutionState = 'defaulted';
      resolvedValue = definition.default;
      defaultProvenance = `Concept definition default for ${input.conceptId}.${slotName}`;
    } else if (definition.inferredFrom !== undefined) {
      classification = 'INFERABLE';
      resolutionState = 'inferred';
      resolvedValue = definition.default; // Can be filled if formula evaluates
      defaultProvenance = `Inferred from ${definition.inferredFrom}`;
    } else if (definition.required) {
      classification = 'REQUIRED';
      resolutionState = 'unresolved';
      resolvedValue = undefined;
    } else {
      classification = 'OPTIONAL';
      resolutionState = 'unresolved';
      resolvedValue = undefined;
    }

    return {
      id: `slot_${input.conceptId}_${slotName}`,
      slotName,
      classification,
      reason,
      affectedDecisions: affectedDecisions || [],
      candidateValues: candidateValues || (definition.type === 'boolean' ? [true, false] : []),
      defaultProvenance,
      resolutionState,
      resolvedValue,
      valueSchema: definition.type
    };
  }

  /**
   * Generates architecture assumptions for all defaulted or inferred slots.
   */
  public generateAssumptions(slots: InformationRequirement[]): ArchitectureAssumption[] {
    const assumptions: ArchitectureAssumption[] = [];

    for (const slot of slots) {
      if (slot.resolutionState === 'defaulted' && slot.resolvedValue !== undefined) {
        assumptions.push({
          id: `assump_${slot.id}`,
          statement: `Assumed default ${slot.slotName} = ${JSON.stringify(slot.resolvedValue)} (${slot.reason})`,
          source: 'defaulted',
          evidenceId: slot.defaultProvenance
        });
      } else if (slot.resolutionState === 'inferred' && slot.resolvedValue !== undefined) {
        assumptions.push({
          id: `assump_${slot.id}`,
          statement: `Inferred value for ${slot.slotName} = ${JSON.stringify(slot.resolvedValue)}`,
          source: 'inferred',
          evidenceId: slot.defaultProvenance
        });
      }
    }

    return assumptions;
  }
}
