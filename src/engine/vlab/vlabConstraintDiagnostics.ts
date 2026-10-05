/**
 * Deterministic, pre-solve diagnostics for multibody distance/angle
 * constraints. These catch structurally invalid wiring (a constraint between
 * two frames that are already fully determined elsewhere, or two constraints
 * duplicating the same frame pair) before the nonlinear solver ever runs, so
 * failures are reported clearly instead of surfacing as opaque convergence
 * failures or silently wrong reactions.
 */

export type ConstraintDiagnosticCode =
  | 'FULLY_PRESCRIBED'
  | 'DUPLICATE_CONSTRAINT'
  | 'UNDEFINED_DIRECTION'
  | 'INVALID_JOINT_PARAMETER';

export interface ConstraintTopology {
  blockId: string;
  type: 'dist_constraint' | 'angle_constraint' | 'spherical_joint' | 'universal_joint';
  /** Union-find root id of the constraint's B (base) frame port. */
  baseRoot: string;
  /** Union-find root id of the constraint's F (follower) frame port. */
  followerRoot: string;
}

export class MultibodyConstraintDiagnosticError extends Error {
  constructor(
    public readonly code: ConstraintDiagnosticCode,
    public readonly blockId: string,
    public readonly frameNodeIds: [string, string],
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'MultibodyConstraintDiagnosticError';
  }
}

/**
 * Validates a model's dist_constraint / angle_constraint wiring against the
 * set of Frame roots that are already fully prescribed (pinned by a
 * reference, e.g. world_frame, or determined via a chain of rigid_transform
 * blocks anchored to one). Throws MultibodyConstraintDiagnosticError on the
 * first structural problem found; does not mutate its inputs.
 */
export function validateMultibodyConstraintTopology(
  constraints: ConstraintTopology[],
  prescribedRoots: Set<string>,
): void {
  const seen = new Map<string, string>(); // canonical "type:rootA|rootB" -> originating blockId

  for (const c of constraints) {
    // A constraint whose endpoints are the same root is self-referential
    // (e.g. both ports wired to the same world frame) and never redundant:
    // it carries no independent geometric information to over-constrain.
    if (
      c.baseRoot !== c.followerRoot &&
      prescribedRoots.has(c.baseRoot) &&
      prescribedRoots.has(c.followerRoot)
    ) {
      throw new MultibodyConstraintDiagnosticError(
        'FULLY_PRESCRIBED',
        c.blockId,
        [c.baseRoot, c.followerRoot],
        `Block "${c.blockId}" (${c.type}) connects two frames that are both already fully prescribed ` +
        `(e.g. anchored to the World frame through rigid_transform chains). This over-constrains the ` +
        `system with no remaining freedom to satisfy it. Remove this constraint, or release a degree ` +
        `of freedom by leaving one side unconstrained instead of anchoring it with another rigid_transform.`
      );
    }

    const endpoints = [c.baseRoot, c.followerRoot].sort();
    const key = `${c.type}:${endpoints[0]}|${endpoints[1]}`;
    const originalBlockId = seen.get(key);
    if (originalBlockId !== undefined) {
      throw new MultibodyConstraintDiagnosticError(
        'DUPLICATE_CONSTRAINT',
        c.blockId,
        [c.baseRoot, c.followerRoot],
        `Block "${c.blockId}" (${c.type}) duplicates the constraint already defined by block "${originalBlockId}" ` +
        `between the same pair of frames. Remove one of the two constraints.`
      );
    }
    seen.set(key, c.blockId);
  }
}
