import type { SysmlRepository } from '../engine/sysml/model';
import { sysmlObjectLabel } from '../features/sysml/sysmlDisplayLabel';
import type { SysmlEditorCommand } from './sysmlCommandGateway';

export interface TestProcedureOption { id: string; label: string; kind: 'activity' | 'interaction' }

/** The Activities and Interactions a verification case can name as its test procedure. */
export function listTestProcedures(repo: SysmlRepository): TestProcedureOption[] {
  return Object.values(repo.definitions)
    .flatMap(definition => definition.kind === 'activity' || definition.kind === 'interaction'
      ? [{ id: definition.id, label: sysmlObjectLabel(definition, definition.kind === 'activity' ? 'Activity' : 'Interaction'), kind: definition.kind }]
      : [])
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type VerificationCommandPlan =
  | { ok: true; command: SysmlEditorCommand }
  | { ok: false; diagnostics: Array<{ code: string; message: string }> };

/** Sets (or, with `undefined`, clears) the test procedure of a verification case: one `updateElement`. */
export function buildSetVerificationBehaviorCommand(
  repo: SysmlRepository,
  input: { verificationCaseId: string; behaviorId?: string },
): VerificationCommandPlan {
  if (!repo.verificationCases[input.verificationCaseId]) {
    return { ok: false, diagnostics: [{ code: 'VERIFICATION_CASE_NOT_FOUND', message: 'The verification case does not exist.' }] };
  }
  if (input.behaviorId !== undefined) {
    const behavior = repo.definitions[input.behaviorId];
    if (behavior?.kind !== 'activity' && behavior?.kind !== 'interaction') {
      return { ok: false, diagnostics: [{ code: 'VERIFICATION_BEHAVIOR_MISSING', message: 'The test procedure must be an Activity or an Interaction.' }] };
    }
  }
  return {
    ok: true,
    command: { type: 'updateElement', elementId: input.verificationCaseId, patch: { behaviorId: input.behaviorId } },
  };
}
