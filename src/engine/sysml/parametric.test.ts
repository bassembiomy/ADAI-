import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository,
  type BlockDefinition, type ConstraintBlockDefinition, type SysmlRepository,
} from './model';
import { createSysmlGatewayState, executeSysmlCommand } from '../../services/sysmlCommandGateway';
import { buildCreateParametricBindingCommand } from '../../services/sysmlParametricCommands';
import { validateSysmlRepository } from './validation';
import { loadRepository, serializeRepository } from './persistence';
import { validateConnector } from './ibd';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.real = { id: 'real', kind: 'valueType', name: 'Real', namespace: [], ownerId: 'model' };
  repo.definitions.text = { id: 'text', kind: 'valueType', name: 'Text', namespace: [], ownerId: 'model' };
  const newton: ConstraintBlockDefinition = {
    id: 'newton', kind: 'constraintBlock', name: 'Newton', namespace: [], ownerId: 'model',
    constraints: ['F = m * a'],
    parameters: [{ id: 'newton.F', name: 'F', typeId: 'real' }, { id: 'newton.m', name: 'm', typeId: 'real' }, { id: 'newton.a', name: 'a', typeId: 'real' }],
  };
  repo.definitions.newton = newton;
  const car: BlockDefinition = {
    id: 'car', kind: 'block', name: 'Car', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
    properties: [
      { id: 'car.newton', name: 'newton', kind: 'constraint', typeId: 'newton', multiplicity: one },
      { id: 'car.mass', name: 'mass', kind: 'value', typeId: 'real', multiplicity: one },
      { id: 'car.thrust', name: 'thrust', kind: 'value', typeId: 'real', multiplicity: one },
      { id: 'car.label', name: 'label', kind: 'value', typeId: 'text', multiplicity: one },
      { id: 'car.engine', name: 'engine', kind: 'part', typeId: 'car', multiplicity: one },
    ],
    ports: [], operations: [], constraints: [],
  };
  repo.definitions.car = car;
  return repo;
}
const plan = (repo: SysmlRepository, source: { propertyId: string; parameterId?: string }, target: { propertyId: string; parameterId?: string }, connectorId = 'b1') =>
  buildCreateParametricBindingCommand(repo, { contextId: 'car', source, target, connectorId });

describe('parametric bindings', () => {
  it('binds a value property to a constraint parameter of the same type', () => {
    const result = plan(model(), { propertyId: 'car.mass' }, { propertyId: 'car.newton', parameterId: 'newton.m' });
    expect(result.ok).toBe(true);
    expect(result.connector).toMatchObject({ kind: 'binding', ownerId: 'car', sourcePortId: 'car.mass', targetPortId: 'newton.m' });
  });

  it('binds two value properties directly, and two parameters of one constraint', () => {
    expect(plan(model(), { propertyId: 'car.mass' }, { propertyId: 'car.thrust' }).ok).toBe(true);
    expect(plan(model(), { propertyId: 'car.newton', parameterId: 'newton.m' }, { propertyId: 'car.newton', parameterId: 'newton.a' }).ok).toBe(true);
  });

  it('rejects incompatible types', () => {
    const result = plan(model(), { propertyId: 'car.label' }, { propertyId: 'car.newton', parameterId: 'newton.m' });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toContain('INCOMPATIBLE_BINDING_TYPE');
  });

  it('requires a parameter for a constraint property and forbids one on a value property', () => {
    expect(plan(model(), { propertyId: 'car.mass' }, { propertyId: 'car.newton' }).diagnostics.map(d => d.code)).toContain('PARAMETRIC_END_REQUIRES_PARAMETER');
    expect(plan(model(), { propertyId: 'car.mass', parameterId: 'newton.m' }, { propertyId: 'car.thrust' }).diagnostics.map(d => d.code)).toContain('UNKNOWN_CONSTRAINT_PARAMETER');
    expect(plan(model(), { propertyId: 'car.mass' }, { propertyId: 'car.newton', parameterId: 'nope' }).diagnostics.map(d => d.code)).toContain('UNKNOWN_CONSTRAINT_PARAMETER');
  });

  it('rejects part properties, unknown properties, a value bound to itself and a non-Block context', () => {
    expect(plan(model(), { propertyId: 'car.engine' }, { propertyId: 'car.mass' }).diagnostics.map(d => d.code)).toContain('INVALID_PARAMETRIC_END');
    expect(plan(model(), { propertyId: 'ghost' }, { propertyId: 'car.mass' }).diagnostics.map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
    expect(plan(model(), { propertyId: 'car.mass' }, { propertyId: 'car.mass' }).diagnostics.map(d => d.code)).toContain('SELF_CONNECTOR');
    const notBlock = buildCreateParametricBindingCommand(model(), { contextId: 'newton', source: { propertyId: 'x' }, target: { propertyId: 'y' } });
    expect(notBlock.diagnostics.map(d => d.code)).toContain('INVALID_PARAMETRIC_CONTEXT');
  });

  it('creates through the gateway, rejects a duplicate in either direction, and undoes', () => {
    const repo = model();
    const first = plan(repo, { propertyId: 'car.mass' }, { propertyId: 'car.newton', parameterId: 'newton.m' });
    const created = executeSysmlCommand(createSysmlGatewayState(repo), first.command!);
    expect(created.committed).toBe(true);
    expect(created.repository.connectors.b1).toMatchObject({ sourceEnd: { propertyId: 'car.mass' }, targetEnd: { propertyId: 'car.newton', parameterId: 'newton.m' } });

    const reversed = plan(created.repository, { propertyId: 'car.newton', parameterId: 'newton.m' }, { propertyId: 'car.mass' }, 'b2');
    expect(reversed.ok).toBe(false);
    expect(reversed.diagnostics.map(d => d.code)).toContain('DUPLICATE_CONNECTOR');
    expect(executeSysmlCommand(created, { type: 'undo' }).repository.connectors.b1).toBeUndefined();
  });

  it('survives save and load, and a dangling end is reported by repository validation', () => {
    const repo = model();
    const created = executeSysmlCommand(createSysmlGatewayState(repo), plan(repo, { propertyId: 'car.mass' }, { propertyId: 'car.newton', parameterId: 'newton.m' }).command!);
    const loaded = loadRepository(serializeRepository(created.repository));
    expect(loaded.diagnostics.filter(d => d.severity === 'error').map(d => `${d.code} ${d.message}`)).toEqual([]);
    expect(loaded.repository.connectors.b1.targetEnd).toEqual({ propertyId: 'car.newton', parameterId: 'newton.m' });

    const broken = structuredClone(loaded.repository);
    (broken.definitions.car as BlockDefinition).properties = (broken.definitions.car as BlockDefinition).properties.filter(p => p.id !== 'car.mass');
    expect(validateSysmlRepository(broken).diagnostics.map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
    expect(validateConnector(broken, 'b1').map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
  });

  it('does not disturb ordinary IBD binding connectors', () => {
    const repo = model();
    repo.connectors.legacy = { id: 'legacy', kind: 'binding', ownerId: 'car', sourcePortId: 'car.mass', targetPortId: 'car.thrust' };
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).not.toContain('INVALID_PARAMETRIC_END');
  });
});
