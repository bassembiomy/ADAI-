import {
  EngineeringArchitecturePlan,
  validateArchitecturePlanIntegrity,
  ArchitecturePlanIntegrityResult
} from '../contracts/architecturePlan';

export interface ArchitecturePlanValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateArchitecturePlan(
  plan: EngineeringArchitecturePlan
): ArchitecturePlanValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Structural integrity check
  const integrity = validateArchitecturePlanIntegrity(plan);
  if (!integrity.valid) {
    errors.push(...integrity.errors);
  }

  // 2. Leaked Catalog Block IDs check
  for (const comp of plan.components) {
    if (comp.conceptId.startsWith('xbridges_') || comp.conceptId.startsWith('block_')) {
      errors.push(
        `Component '${comp.id}' illegally contains catalog block ID '${comp.conceptId}' instead of a semantic concept ID`
      );
    }
  }

  // 3. Completeness: check if system concept exists
  if (!plan.system.conceptId) {
    errors.push('Architecture system conceptId is missing');
  }

  // 4. Decision consistency: selectedAlternative must be in consideredAlternatives
  for (const dec of plan.designDecisions) {
    if (dec.consideredAlternatives.length > 0 && !dec.consideredAlternatives.includes(dec.selectedAlternative)) {
      warnings.push(
        `Design decision '${dec.id}' selected alternative '${dec.selectedAlternative}' is not listed in consideredAlternatives`
      );
    }
  }

  // 5. Capability assessment coherence
  if (plan.capabilityAssessment.unsupportedConceptIds.length > 0 && plan.capabilityAssessment.feasible) {
    warnings.push('Plan is marked feasible despite having unsupported concept IDs');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
