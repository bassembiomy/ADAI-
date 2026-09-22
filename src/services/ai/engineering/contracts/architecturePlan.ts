import { z } from 'zod';

export const SlotClassificationEnum = z.enum([
  'REQUIRED',
  'OPTIONAL',
  'INFERABLE',
  'DEFAULTABLE'
]);
export type SlotClassification = z.infer<typeof SlotClassificationEnum>;

export const ResolutionStateEnum = z.enum([
  'unresolved',
  'resolved',
  'inferred',
  'defaulted'
]);
export type ResolutionState = z.infer<typeof ResolutionStateEnum>;

export const InformationRequirementBaseSchema = z.object({
  id: z.string().min(1),
  slotName: z.string().min(1),
  classification: SlotClassificationEnum,
  reason: z.string().min(1),
  affectedDecisions: z.array(z.string()),
  candidateValues: z.array(z.unknown()),
  defaultProvenance: z.string().optional(),
  resolutionState: ResolutionStateEnum,
  resolvedValue: z.unknown().optional(),
  valueSchema: z.string().optional()
}).strict();

export const InformationRequirementSchema = InformationRequirementBaseSchema.superRefine((data, ctx) => {
  if (data.resolutionState === 'unresolved' && data.resolvedValue !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Slot '${data.slotName}' is marked as 'unresolved' but contains a resolvedValue`,
      path: ['resolvedValue']
    });
  }
  if ((data.resolutionState === 'resolved' || data.resolutionState === 'inferred' || data.resolutionState === 'defaulted') && data.resolvedValue === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Slot '${data.slotName}' is marked as '${data.resolutionState}' but resolvedValue is undefined`,
      path: ['resolvedValue']
    });
  }
});
export type InformationRequirement = z.infer<typeof InformationRequirementBaseSchema>;

export const ArchitectureSystemSchema = z.object({
  name: z.string().min(1),
  conceptId: z.string().min(1),
  description: z.string()
}).strict();
export type ArchitectureSystem = z.infer<typeof ArchitectureSystemSchema>;

export const ArchitectureSubsystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  conceptId: z.string().min(1),
  parentSubsystemId: z.string().optional(),
  functionalRoles: z.array(z.string()),
  description: z.string().optional()
}).strict();
export type ArchitectureSubsystem = z.infer<typeof ArchitectureSubsystemSchema>;

export const ArchitectureComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  conceptId: z.string().min(1),
  subsystemId: z.string().min(1),
  role: z.string().min(1),
  designParameters: z.record(z.string(), z.unknown())
}).strict();
export type ArchitectureComponent = z.infer<typeof ArchitectureComponentSchema>;

export const ArchitectureConnectionSchema = z.object({
  id: z.string().min(1),
  fromComponentId: z.string().min(1),
  fromPort: z.string().min(1),
  toComponentId: z.string().min(1),
  toPort: z.string().min(1),
  semanticType: z.string().min(1),
  domain: z.string().optional()
}).strict();
export type ArchitectureConnection = z.infer<typeof ArchitectureConnectionSchema>;

export const DesignDecisionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  selectedAlternative: z.string().min(1),
  consideredAlternatives: z.array(z.string()),
  rationale: z.string().min(1),
  affectedComponents: z.array(z.string())
}).strict();
export type DesignDecision = z.infer<typeof DesignDecisionSchema>;

export const ArchitectureAssumptionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  source: z.enum(['user', 'inferred', 'defaulted', 'domain_convention']),
  evidenceId: z.string().optional()
}).strict();
export type ArchitectureAssumption = z.infer<typeof ArchitectureAssumptionSchema>;

export const KnowledgeEvidenceSchema = z.object({
  conceptId: z.string().min(1),
  factIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  citation: z.string()
}).strict();
export type KnowledgeEvidence = z.infer<typeof KnowledgeEvidenceSchema>;

export const CapabilityAssessmentSchema = z.object({
  feasible: z.boolean(),
  coveredConceptIds: z.array(z.string()),
  unsupportedConceptIds: z.array(z.string()),
  candidateBlockIds: z.array(z.string()).optional(),
  notes: z.string().optional()
}).strict();
export type CapabilityAssessment = z.infer<typeof CapabilityAssessmentSchema>;

export const EngineeringArchitecturePlanSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  planId: z.string().min(1),
  intentId: z.string().min(1),
  system: ArchitectureSystemSchema,
  subsystems: z.array(ArchitectureSubsystemSchema),
  components: z.array(ArchitectureComponentSchema),
  connections: z.array(ArchitectureConnectionSchema),
  designDecisions: z.array(DesignDecisionSchema),
  informationRequirements: z.array(InformationRequirementSchema),
  assumptions: z.array(ArchitectureAssumptionSchema),
  knowledgeEvidence: z.array(KnowledgeEvidenceSchema),
  capabilityAssessment: CapabilityAssessmentSchema,
  rationale: z.string()
}).strict();
export type EngineeringArchitecturePlan = z.infer<typeof EngineeringArchitecturePlanSchema>;

export interface ArchitecturePlanIntegrityResult {
  valid: boolean;
  errors: string[];
}

export function validateArchitecturePlanIntegrity(
  plan: EngineeringArchitecturePlan
): ArchitecturePlanIntegrityResult {
  const errors: string[] = [];
  const subsystemIds = new Set(plan.subsystems.map(s => s.id));
  const componentIds = new Set(plan.components.map(c => c.id));

  // Check subsystem hierarchy integrity
  for (const sub of plan.subsystems) {
    if (sub.parentSubsystemId && !subsystemIds.has(sub.parentSubsystemId)) {
      errors.push(`Subsystem '${sub.id}' references non-existent parentSubsystemId '${sub.parentSubsystemId}'`);
    }
  }

  // Check component subsystem references and ensure no ADIA block IDs leaked into semantic concept IDs
  for (const comp of plan.components) {
    if (!subsystemIds.has(comp.subsystemId)) {
      errors.push(`Component '${comp.id}' references non-existent subsystemId '${comp.subsystemId}'`);
    }
    if (comp.conceptId.startsWith('xbridges_') || comp.conceptId.startsWith('block_')) {
      errors.push(`Component '${comp.id}' illegally contains catalog block ID '${comp.conceptId}' in conceptId`);
    }
  }

  // Check connection component endpoints
  for (const conn of plan.connections) {
    if (!componentIds.has(conn.fromComponentId)) {
      errors.push(`Connection '${conn.id}' references non-existent fromComponentId '${conn.fromComponentId}'`);
    }
    if (!componentIds.has(conn.toComponentId)) {
      errors.push(`Connection '${conn.id}' references non-existent toComponentId '${conn.toComponentId}'`);
    }
  }

  // Check decision affected components
  for (const dec of plan.designDecisions) {
    for (const compId of dec.affectedComponents) {
      if (!componentIds.has(compId)) {
        errors.push(`DesignDecision '${dec.id}' references non-existent affected component '${compId}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
