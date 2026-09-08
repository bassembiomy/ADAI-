import { describe, expect, it } from 'vitest';
import { deriveBddView } from './bdd';
import { recordVerificationEvidence, traceArtifactToRequirement } from './evidence';
import { deriveIbdView } from './ibd';
import { applyCommand, redo, undo } from './mutations';
import { assessOpmRoundTripLoss, projectSysmlToOpm } from './opmAdapter';
import { compareBaselines, createBaseline, loadRepository, serializeRepository } from './persistence';
import { transitionRequirementStatus } from './requirements';
import { buildTraceabilityMatrix, exportRtmCsv } from './rtm';
import { validateSysmlRepository } from './validation';
import { createEmptyRepository, type BlockDefinition } from './model';

describe('SysML 1.6 BDD/IBD/Requirements/RTM representative lifecycle', () => {
  it('qualifies the canonical lifecycle without conflating definitions and usages', () => {
    let repo = createEmptyRepository();
    repo.definitions.PowerIF = { id: 'PowerIF', name: 'Power interface', namespace: ['Vehicle'], kind: 'interface', features: ['voltage'] };
    repo.definitions.Real = { id: 'Real', name: 'Real', namespace: [], kind: 'valueType', unit: 'V', dimension: 'electricPotential' };
    repo.definitions.Component = {
      id: 'Component', name: 'Component', namespace: ['Vehicle'], kind: 'block', isAbstract: true, isLeaf: false,
      properties: [{ id: 'voltage', name: 'voltage', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      ports: [{ id: 'powerOut', name: 'powerOut', kind: 'proxy', typeId: 'PowerIF', direction: 'out', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      operations: ['start()'], constraints: ['voltage > 0'],
    };
    repo.definitions.Controller = {
      ...(structuredClone(repo.definitions.Component) as BlockDefinition), id: 'Controller', name: 'Controller', isAbstract: false,
      supertypeIds: ['Component'], properties: [], ports: [], operations: ['stop()'], constraints: [],
    };
    repo.definitions.System = { id: 'System', name: 'System', namespace: ['Vehicle'], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.usages.controller = { id: 'controller', name: 'controller', kind: 'part', ownerId: 'System', typeId: 'Controller', aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } };
    repo.usages.controllerPort = { id: 'controllerPort', name: 'powerOut', kind: 'port', ownerId: 'controller', definitionId: 'powerOut' };
    repo.relationships.g = { id: 'g', kind: 'generalization', sourceId: 'Controller', targetId: 'Component' };
    repo.relationships.comp = { id: 'comp', kind: 'composition', sourceId: 'System', targetId: 'controller' };
    repo.requirements.r = { id: 'r', name: 'Power safety', namespace: ['Vehicle'], kind: 'requirement', requirementId: 'REQ-POWER-1', text: 'Controller shall provide safe power', status: 'draft', version: '1', owner: 'Systems', risk: 'high', priority: 'high' };
    repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'controller', targetId: 'r' };
    repo.verificationCases.v = { id: 'v', name: 'Power simulation', namespace: ['Vehicle'], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['r'] };
    repo.relationships.vr = { id: 'vr', kind: 'verify', sourceId: 'v', targetId: 'r' };

    expect(validateSysmlRepository(repo).valid).toBe(true);
    expect(deriveBddView(repo).elements.map(item => item.id)).toContain('Controller');
    expect(deriveIbdView(repo, 'System').parts.map(item => item.id)).toEqual(['controller']);

    repo = transitionRequirementStatus(repo, 'r', 'approved').repository;
    repo = transitionRequirementStatus(repo, 'r', 'implemented').repository;
    repo = traceArtifactToRequirement(repo, { id: 'sim', name: 'Nominal run', kind: 'simulation', ownerId: 'Controller', revision: repo.revision }, 'r').repository;
    repo = traceArtifactToRequirement(repo, { id: 'code', name: 'controller.c', kind: 'generatedArtifact', ownerId: 'Controller', revision: repo.revision, uri: 'generated/controller.c' }, 'r').repository;
    repo = recordVerificationEvidence(repo, { id: 'e', verificationCaseId: 'v', requirementId: 'r', result: 'passed', executedAt: '2026-09-08T12:00:00Z', artifactUri: 'results/power.json' }).repository;
    repo = transitionRequirementStatus(repo, 'r', 'verified').repository;
    expect(repo.requirements.r.status).toBe('verified');
    expect(buildTraceabilityMatrix(repo).rows[0]).toMatchObject({ status: 'verified', simulations: ['sim'], artifacts: ['code'] });
    expect(exportRtmCsv(buildTraceabilityMatrix(repo))).toContain('REQ-POWER-1');

    const projection = projectSysmlToOpm(repo);
    expect(assessOpmRoundTripLoss(repo, projection).lossySourceIds).toContain('comp');

    const first = createBaseline(repo, { id: 'BL-1', name: 'Qualified', createdAt: '2026-09-08T13:00:00Z' });
    repo = first.repository;
    (repo.definitions.Controller as BlockDefinition).name = 'Renamed Controller';
    const second = createBaseline(repo, { id: 'BL-2', name: 'Changed', createdAt: '2026-09-08T14:00:00Z' });
    expect(compareBaselines(second.repository, 'BL-1', 'BL-2').changed).toContain('Controller');
    repo = loadRepository(serializeRepository(second.repository)).repository;
    expect(repo.definitions.Controller.name).toBe('Renamed Controller');

    const deletion = applyCommand(repo, { kind: 'deleteElements', elementIds: ['System'] });
    expect(deletion.repository.usages.controller).toBeUndefined();
    expect(deletion.repository.definitions.Controller).toBeDefined();
    const history = { past: [repo], present: deletion.repository, future: [] };
    expect(undo(history).present.usages.controller).toBeDefined();
    expect(redo(undo(history)).present.usages.controller).toBeUndefined();
  });
});
