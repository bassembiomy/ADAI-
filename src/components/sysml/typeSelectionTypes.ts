/**
 * Task 1 shared type-selection contract (spec sections 3.2, 4.1, 4.2, 7).
 *
 * Tree and canvas creation share this request shape: owner identity,
 * requested feature kind, compatible candidate IDs, and an explicit
 * `CreateNewType` action. No production path may silently select the
 * first candidate or implicitly create a type.
 *
 * NOTE: Task 6 owns the full centralized semantic-style resolver. This
 * module only declares the presentation-role vocabulary so Task 1
 * surfaces compile without duplicating the resolver. There is
 * intentionally no token accessor stub here — Task 6 provides the real
 * `semanticPresentationToken` resolver.
 */
import type { TypeCandidate, CreateNewTypeAction } from '../../services/sysmlOwnedFeatureCommands';

export type { TypeCandidate, CreateNewTypeAction };

export type TypedFeatureKind =
  | 'part'
  | 'reference'
  | 'valueProperty'
  | 'port'
  | 'standardPort'
  | 'proxyPort'
  | 'fullPort'
  | 'flowPort';

export interface TypeSelectionRequest {
  ownerId: string;
  featureKind: TypedFeatureKind;
  candidates: TypeCandidate[];
  action: CreateNewTypeAction;
}

/** Payload carried on ExplorerCommandResult.typeSelection (request minus owner/kind). */
export type TypeSelectionPayload = Pick<TypeSelectionRequest, 'candidates' | 'action'>;

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
  | 'association'
  | 'selection'
  | 'warning'
  | 'error';

export type SemanticPresentationState = 'default' | 'selected' | 'focused' | 'warning' | 'error';

// Task 6 owns the centralized `semanticPresentationToken(role, state)`
// resolver. It is intentionally not stubbed here so a placeholder return
// value can never masquerade as the real resolver.
