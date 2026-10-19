import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type RequirementDefinition } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildBlockPropertyUpdateCommand } from './sysmlPropertyCommands';

function requirement(id: string, status: RequirementDefinition['status'] = 'draft'): RequirementDefinition {
  return { id, kind: 'requirement', name: id, requirementId: `REQ-${id}`, namespace: ['model'], ownerId: 'model', text: 'Original', status, version: '1.0', owner: 'Team A' };
}

function stateWith(...requirements: RequirementDefinition[]) {
  const repo = createEmptyRepository();
  for (const r of requirements) repo.requirements[r.id] = r;
  return createSysmlGatewayState(repo);
}

describe('requirement edits from the property panel', () => {
  it('maps BlockData names to the requirement fields and stores lowercase enums', () => {
    const state = stateWith(requirement('r1', 'draft'));
    const command = buildBlockPropertyUpdateCommand(state.repository, 'r1', {
      reqId: 'REQ-9', description: 'new', status: 'Approved', risk: 'High', priority: 'Critical', assignedTo: 'Team B',
    });
    const result = executeSysmlCommand(state, command as never);
    expect(result.committed).toBe(true);
    const stored = result.repository.requirements.r1 as unknown as Record<string, unknown>;
    expect(stored).toMatchObject({ requirementId: 'REQ-9', text: 'new', status: 'approved', risk: 'high', priority: 'critical', owner: 'Team B' });
    for (const stray of ['reqId', 'description', 'assignedTo']) expect(stored).not.toHaveProperty(stray);
    // the canvas projection reads the edit back
    expect(result.view.blocks.find(block => block.id === 'r1')).toMatchObject({ reqId: 'REQ-9', description: 'new', status: 'approved', risk: 'high' });
  });

  it('does not write keys a requirement does not have', () => {
    const state = stateWith(requirement('r1'));
    const command = buildBlockPropertyUpdateCommand(state.repository, 'r1', {
      verificationMethod: 'Test', attachedFiles: [{ name: 'a.pdf', content: 'x' }], layerId: 'root', text: 'kept',
    });
    expect(command).toEqual({ type: 'updateElement', elementId: 'r1', patch: { text: 'kept' } });
    const result = executeSysmlCommand(state, command as never);
    expect(result.committed).toBe(true);
    const stored = result.repository.requirements.r1 as unknown as Record<string, unknown>;
    for (const stray of ['verificationMethod', 'attachedFiles', 'layerId']) expect(stored).not.toHaveProperty(stray);
    expect(stored.text).toBe('kept');
  });

  it('stores a verification case method as method', () => {
    const repo = createEmptyRepository();
    repo.verificationCases.v1 = { id: 'v1', kind: 'verificationCase', name: 'v1', namespace: ['model'], ownerId: 'model', method: 'Test', verifiesRequirementIds: [] };
    const command = buildBlockPropertyUpdateCommand(repo, 'v1', { verificationMethod: 'Analysis' });
    expect(command).toEqual({ type: 'updateElement', elementId: 'v1', patch: { method: 'Analysis' } });
  });
});

describe('requirement status lifecycle in the gateway', () => {
  it('rejects approved to verified without passing evidence', () => {
    const state = stateWith(requirement('r1', 'approved'));
    const result = executeSysmlCommand(state, { type: 'updateElement', elementId: 'r1', patch: { status: 'verified' } });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toContain('INVALID_REQUIREMENT_STATUS_TRANSITION');
    expect(result.repository.requirements.r1.status).toBe('approved');
  });

  it('rejects implemented to verified without current passing evidence', () => {
    const state = stateWith(requirement('r1', 'implemented'));
    const result = executeSysmlCommand(state, { type: 'updateElement', elementId: 'r1', patch: { status: 'verified' } });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toContain('CURRENT_PASSING_EVIDENCE_REQUIRED');
  });

  it('commits draft to approved and the exceptional statuses', () => {
    let state = stateWith(requirement('r1', 'draft'));
    const approved = executeSysmlCommand(state, { type: 'updateElement', elementId: 'r1', patch: { status: 'approved' } });
    expect(approved.committed).toBe(true);
    expect(approved.repository.requirements.r1.status).toBe('approved');
    state = { ...state, ...approved };
    const retired = executeSysmlCommand(state, { type: 'updateElement', elementId: 'r1', patch: { status: 'retired' } });
    expect(retired.committed).toBe(true);
  });

  it('applies the same rule to an edit that comes from the legacy panel', () => {
    const state = stateWith(requirement('r1', 'approved'));
    const command = buildBlockPropertyUpdateCommand(state.repository, 'r1', { status: 'Verified' });
    expect(executeSysmlCommand(state, command as never).committed).toBe(false);
  });
});
