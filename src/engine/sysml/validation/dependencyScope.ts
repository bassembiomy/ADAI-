import {
  qualifiedName,
  type BlockDefinition,
  type SysmlRelationship,
  type SysmlRepository,
  type SysmlDefinition,
} from '../model';
import { type NormalizedSysmlStore } from '../normalizedStore';
import {
  validateSysmlRepository,
  type SysmlDiagnostic,
  type SysmlValidationReport,
  validateRequirementContainment,
} from '../validation';
import { classifyRelationship, parsePolicyDiagnostic } from '../policy';
import { validateAssociationEnds } from '../bdd';
import { effectiveSupertypeIds } from '../services/supertypes';
import type { SemanticEndpointContext } from '../semanticEndpointIndex';

/**
 * Validation Rule Classification Table:
 *
 * 1. LOCAL RULES (affect only the modified element itself):
 *    - MULTIPLICITY_BOUNDS (lower <= upper, valid integer or *)
 *    - RECEPTION_SIGNAL_EXISTS (signal definition exists)
 *    - VERIFICATION_BEHAVIOR_MISSING
 *
 * 2. DEPENDENCY-NEIGHBORHOOD RULES (affect element and direct owner/type/endpoint neighbors):
 *    - MISSING_USAGE_OWNER, MISSING_USAGE_TYPE
 *    - MISSING_PROPERTY_TYPE, MISSING_SUPERTYPE
 *    - MISSING_RELATIONSHIP_ENDPOINT (source/target endpoints exist)
 *    - INVALID_RELATIONSHIP_DIRECTION
 *    - CONNECTION_POLICY (classifyRelationship)
 *    - ASSOCIATION_ENDS (validateAssociationEnds)
 *    - REQUIREMENT_CONTAINMENT (validateRequirementContainment)
 *    - INHERITANCE_CYCLE (ancestors / supertypes of affected block)
 *    - PACKAGE_OWNERSHIP_CYCLE (ancestors of affected package)
 *
 * 3. INDEXED-GLOBAL RULES:
 *    - DUPLICATE_QUALIFIED_NAME (qualifiedName collisions)
 *    - DUPLICATE_ELEMENT_ID (ID collisions across collections)
 *
 * 4. FULL-ONLY / COMPOSITE RULES (fallback to full validator when modified):
 *    - COMPOSITE_CONTAINMENT_CYCLE (across all usages)
 *    - Complex Activity / Interaction graph validation
 *    - Parametric binding graphs
 *    - Port delegation and flow specification compatibility
 */

export type ValidationRuleCategory = 'local' | 'neighborhood' | 'indexed-global' | 'full-only';

export interface ScopedValidationChange {
  affectedIds: string[];
  commandType: string;
  changedProperties?: string[];
  newQualifiedName?: string;
  isPresentationOnly?: boolean;
}

/**
 * Checks whether a definition or requirement qualified name clashes with any other element.
 */
export function checkDuplicateQualifiedName(
  repo: SysmlRepository,
  elementId: string,
  element: { name: string; namespace: readonly string[] },
): SysmlDiagnostic | null {
  const targetQName = qualifiedName(element.namespace, element.name);
  for (const def of Object.values(repo.definitions)) {
    if (def.id === elementId) continue;
    if (qualifiedName(def.namespace, def.name) === targetQName) {
      return {
        code: 'DUPLICATE_QUALIFIED_NAME',
        severity: 'error',
        elementId,
        propertyPath: 'name',
        message: `Qualified name ${targetQName} is also used by ${def.id}`,
      };
    }
  }
  for (const req of Object.values(repo.requirements)) {
    if (req.id === elementId) continue;
    if (qualifiedName(req.namespace, req.name) === targetQName) {
      return {
        code: 'DUPLICATE_QUALIFIED_NAME',
        severity: 'error',
        elementId,
        propertyPath: 'name',
        message: `Qualified name ${targetQName} is also used by ${req.id}`,
      };
    }
  }
  return null;
}

/**
 * Validates a single relationship's endpoints, direction, and connection policy.
 */
export function validateSingleRelationship(
  repo: SysmlRepository,
  relId: string,
  context?: SemanticEndpointContext,
): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const relationship = repo.relationships[relId];
  if (!relationship) return diagnostics;

  const sourceExists = Boolean(
    repo.definitions[relationship.sourceId] ||
    repo.packages[relationship.sourceId] ||
    repo.requirements[relationship.sourceId] ||
    repo.usages[relationship.sourceId] ||
    context?.externalEndpoints?.has(relationship.sourceId)
  );
  const targetExists = Boolean(
    repo.definitions[relationship.targetId] ||
    repo.packages[relationship.targetId] ||
    repo.requirements[relationship.targetId] ||
    repo.usages[relationship.targetId] ||
    context?.externalEndpoints?.has(relationship.targetId)
  );

  if (!sourceExists) {
    diagnostics.push({
      code: 'MISSING_RELATIONSHIP_ENDPOINT',
      severity: 'error',
      elementId: relationship.id,
      propertyPath: 'sourceId',
      message: `Source ${relationship.sourceId} does not exist`,
    });
  }
  if (!targetExists) {
    diagnostics.push({
      code: 'MISSING_RELATIONSHIP_ENDPOINT',
      severity: 'error',
      elementId: relationship.id,
      propertyPath: 'targetId',
      message: `Target ${relationship.targetId} does not exist`,
    });
  }

  if (sourceExists && targetExists) {
    if (relationship.kind === 'association' || relationship.kind === 'composition' || relationship.kind === 'sharedAggregation') {
      diagnostics.push(
        ...validateAssociationEnds(repo, relationship.id).filter(d => d.code !== 'INVALID_MULTIPLICITY')
      );
    }
    if (relationship.kind === 'requirementContainment') {
      diagnostics.push(...validateRequirementContainment(repo, relationship.id));
    }
    const decision = classifyRelationship(repo, relationship.id, context);
    for (const entry of decision.diagnostics) {
      const { code, message } = parsePolicyDiagnostic(entry);
      diagnostics.push({
        code,
        severity: 'error',
        elementId: relationship.id,
        propertyPath: 'kind',
        message,
      });
    }
  }

  return diagnostics;
}

/**
 * Checks for inheritance cycles reachable from the given block ID.
 */
export function checkInheritanceCycleForBlock(
  repo: SysmlRepository,
  blockId: string,
): SysmlDiagnostic | null {
  const seen = new Set<string>();
  const stack = [blockId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) {
      return {
        code: 'INHERITANCE_CYCLE',
        severity: 'error',
        elementId: blockId,
        propertyPath: 'supertypeIds',
        message: `Block ${blockId} participates in an inheritance cycle`,
      };
    }
    seen.add(current);
    const supertypes = effectiveSupertypeIds(repo, current);
    for (const st of supertypes) {
      if (st === blockId) {
        return {
          code: 'INHERITANCE_CYCLE',
          severity: 'error',
          elementId: blockId,
          propertyPath: 'supertypeIds',
          message: `Block ${blockId} participates in an inheritance cycle`,
        };
      }
      stack.push(st);
    }
  }
  return null;
}

/**
 * Execute dependency-scoped validation for common interactive commands.
 * Returns null if the command touches rules that require full whole-model validation.
 */
export function validateScopedSysmlRepository(
  repo: SysmlRepository,
  change: ScopedValidationChange,
  store?: NormalizedSysmlStore,
  context?: SemanticEndpointContext,
): SysmlValidationReport | null {
  // 1. Pure presentation updates never invalidate semantic rules
  if (
    change.isPresentationOnly ||
    change.commandType === 'updatePresentation' ||
    change.commandType === 'addToDiagram' ||
    change.commandType === 'removeFromDiagram'
  ) {
    return {
      valid: true,
      diagnostics: [],
      canSimulate: true,
      canExport: true,
      canReport: true,
      canVerify: true,
    };
  }

  // 2. Element update (e.g. rename or property edit)
  if (change.commandType === 'updateElement' && change.affectedIds.length === 1) {
    const elementId = change.affectedIds[0];
    const def = repo.definitions[elementId];
    const req = repo.requirements[elementId];
    const target = def ?? req;

    if (target) {
      const changed = change.changedProperties ?? [];
      const isSimpleAttributeUpdate = changed.length > 0 && changed.every(p => ['name', 'isAbstract', 'isLeaf', 'description'].includes(p));

      const diagnostics: SysmlDiagnostic[] = [];

      // Check qualified name uniqueness if name or namespace was affected
      if (changed.length === 0 || changed.includes('name') || changed.includes('namespace') || isSimpleAttributeUpdate) {
        const nameDiagnostic = checkDuplicateQualifiedName(repo, elementId, target);
        if (nameDiagnostic) diagnostics.push(nameDiagnostic);
      }

      if (def && def.kind === 'block') {
        if (changed.includes('supertypeIds')) {
          const cycle = checkInheritanceCycleForBlock(repo, elementId);
          if (cycle) diagnostics.push(cycle);
        }
        if (changed.includes('properties')) {
          const blockIds = new Set(Object.values(repo.definitions).filter(d => d.kind === 'block').map(d => d.id));
          for (const prop of def.properties ?? []) {
            if ((prop.kind === 'part' || prop.kind === 'reference') && prop.typeId && !blockIds.has(prop.typeId)) {
              diagnostics.push({
                code: 'MISSING_PROPERTY_TYPE',
                severity: 'error',
                elementId: prop.id,
                propertyPath: 'typeId',
                message: `Block type ${prop.typeId} of part ${prop.name} does not exist`,
              });
            }
          }
        }
      }

      if (!isSimpleAttributeUpdate && !changed.includes('properties') && !changed.includes('supertypeIds')) {
        // Fallback to full validator for other complex changes
        return null;
      }

      return {
        valid: diagnostics.filter(d => d.severity === 'error').length === 0,
        diagnostics,
        canSimulate: diagnostics.length === 0,
        canExport: true,
        canReport: true,
        canVerify: true,
      };
    }
  }

  // Fallback to full validation for unproven or complex multi-element commands
  return null;
}
