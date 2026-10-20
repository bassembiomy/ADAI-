import type { RequirementDefinition, SysmlRepository } from '../engine/sysml/model';
import type { SysmlDiagnostic } from '../engine/sysml/validation';
import { transitionRequirementStatus } from '../engine/sysml/requirements';

/** The fields a RequirementDefinition really stores (plus its name and owning package). */
const REQUIREMENT_FIELDS = new Set([
  'name', 'ownerId', 'requirementId', 'text', 'status', 'version', 'baselineId', 'source', 'rationale',
  'owner', 'risk', 'priority', 'copiedFromId',
]);
/** BlockData names the property panels use, mapped to the RequirementDefinition field they project. */
const BLOCK_KEY_TO_REQUIREMENT_FIELD: Record<string, string> = { reqId: 'requirementId', description: 'text', assignedTo: 'owner' };
const LOWERCASE_ENUM_FIELDS = new Set(['status', 'risk', 'priority']);

/**
 * Turns a BlockData-style edit of a requirement into a patch of RequirementDefinition fields:
 * reqId/description/assignedTo become requirementId/text/owner, enum values are stored lowercase,
 * and keys the requirement does not have (verificationMethod, attachedFiles, ...) are not written.
 */
export function toRequirementPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = BLOCK_KEY_TO_REQUIREMENT_FIELD[key] ?? key;
    if (!REQUIREMENT_FIELDS.has(field)) continue;
    result[field] = LOWERCASE_ENUM_FIELDS.has(field) && typeof value === 'string' ? value.trim().toLowerCase() : value;
  }
  return result;
}

/**
 * The lifecycle rule for a requirement status edit: the canonical `transitionRequirementStatus`,
 * so Verified needs current passing evidence. Returns the diagnostics that reject the edit, or null
 * when the patch is not a status change or the change is allowed.
 */
export function gateRequirementStatusUpdate(
  repo: SysmlRepository, elementId: string, patch: Record<string, unknown>,
): SysmlDiagnostic[] | null {
  const requirement = repo.requirements[elementId];
  if (!requirement || !('status' in patch)) return null;
  const outcome = transitionRequirementStatus(repo, elementId, patch.status as RequirementDefinition['status']);
  return outcome.applied ? null : outcome.diagnostics;
}
