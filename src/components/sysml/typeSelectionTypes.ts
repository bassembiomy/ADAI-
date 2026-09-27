/**
 * Task 1 shared type-selection contract (spec sections 3.2, 4.1, 4.2, 7).
 *
 * Tree and canvas creation share this request shape: owner identity,
 * requested feature kind, compatible candidate IDs, and an explicit
 * `CreateNewType` action. No production path may silently select the
 * first candidate or implicitly create a type.
 *
 * NOTE: Task 6 owns the full centralized semantic-style resolver. This
 * module only declares the presentation-role vocabulary and a stub token
 * accessor signature so Task 1 surfaces compile without duplicating the
 * resolver.
 */
import type { TypeCandidate } from '../../services/sysmlOwnedFeatureCommands';

export type { TypeCandidate };

export type TypedFeatureKind =
  | 'part'
  | 'reference'
  | 'valueProperty'
  | 'proxyPort'
  | 'fullPort'
  | 'flowPort';

export interface TypeSelectionRequest {
  ownerId: string;
  featureKind: string;
  candidates: TypeCandidate[];
  action: { kind: 'CreateNewType'; payload?: { suggestedMetaclass?: string; suggestedName?: string } };
}

export type TypeSelectionResult =
  | { kind: 'selected'; typeId: string }
  | { kind: 'createNewType' }
  | { kind: 'cancelled' };

export type SemanticPresentationRole =
  | 'block'
  | 'requirement'
  | 'state'
  | 'standardPort'
  | 'proxyPort'
  | 'fullPort'
  | 'flowPort'
  | 'validRequirementRelationship'
  | 'selection'
  | 'warning'
  | 'error';

export type SemanticPresentationState = 'default' | 'selected' | 'focused' | 'warning' | 'error';

/**
 * Stub token accessor. Task 6 provides the full centralized resolver;
 * this stub keeps Task 1 surfaces compiling and returns the role key so
 * no hard-coded workflow color is introduced here. Colors never drive
 * validation.
 */
export function semanticPresentationToken(
  role: SemanticPresentationRole,
  _state: SemanticPresentationState = 'default',
): string {
  return role;
}
