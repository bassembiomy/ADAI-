import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository, isDefinitionKind,
  type BlockDefinition, type ConstraintBlockDefinition, type EnumerationDefinition, type SysmlRepository,
} from './model';
import { createSysmlGatewayState, executeSysmlCommand } from '../../services/sysmlCommandGateway';
import { loadRepository, serializeRepository } from './persistence';
import { validateSysmlRepository } from './validation';
import { validateBlockDefinition } from './bdd';
import { migrateV3ToV4 } from './persistence/migrateV3ToV4';
import { evaluateSysmlConnection } from './connectionPolicy';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, properties: BlockDefinition['properties'] = []): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties, ports: [], operations: [], constraints: [],
});
const enumeration = (id: string, literals: string[]): EnumerationDefinition => ({ id, kind: 'enumeration', name: id, namespace: [], ownerId: 'model', literals });
const constraintBlock = (id: string, parameters: ConstraintBlockDefinition['parameters'], constraints = ['F = m * a']): ConstraintBlockDefinition =>
  ({ id, kind: 'constraintBlock', name: id, namespace: [], ownerId: 'model', parameters, constraints });

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.real = { id: 'real', kind: 'valueType', name: 'Real', namespace: [], ownerId: 'model' };
  repo.definitions.newton = constraintBlock('newton', [
    { id: 'newton.F', name: 'F', typeId: 'real' }, { id: 'newton.m', name: 'm', typeId: 'real' }, { id: 'newton.a', name: 'a', typeId: 'real' },
  ]);
  repo.definitions.mode = enumeration('mode', ['off', 'on']);
  repo.definitions.alarm = { id: 'alarm', kind: 'signal', name: 'Alarm', namespace: [], ownerId: 'model' };
  return repo;
}
const codes = (repo: SysmlRepository) => validateSysmlRepository(repo).diagnostics.map(d => d.code);

describe('Enumeration, Signal and ConstraintBlock are stored definitions', () => {
  it('knows every definition kind', () => {
    for (const kind of ['block', 'valueType', 'interface', 'enumeration', 'signal', 'constraintBlock']) expect(isDefinitionKind(kind)).toBe(true);
    expect(isDefinitionKind('requirement')).toBe(false);
  });

  it('creates each through the gateway as a definition, with one undo step', () => {
    for (const element of [enumeration('e1', ['a', 'b']), { id: 's1', kind: 'signal', name: 'S', namespace: [], ownerId: 'model' } as const, constraintBlock('c1', [])]) {
      const state = createSysmlGatewayState(createEmptyRepository());
      const created = executeSysmlCommand(state, { type: 'createElement', element: element as never });
      expect(created.committed).toBe(true);
      expect(created.repository.definitions[element.id].kind).toBe(element.kind);
      expect(executeSysmlCommand(created, { type: 'undo' }).repository.definitions[element.id]).toBeUndefined();
    }
  });

  it('round-trips through save and load unchanged', () => {
    const loaded = loadRepository(serializeRepository(model()));
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions.mode).toMatchObject({ kind: 'enumeration', literals: ['off', 'on'] });
    expect(loaded.repository.definitions.newton).toMatchObject({ kind: 'constraintBlock', constraints: ['F = m * a'] });
    expect((loaded.repository.definitions.newton as ConstraintBlockDefinition).parameters.map(p => p.name)).toEqual(['F', 'm', 'a']);
    expect(loaded.repository.definitions.alarm.kind).toBe('signal');
  });

  it('appears in the V4 view with its own metaclass, and constraint properties stay constraint properties', () => {
    const repo = model();
    repo.definitions.car = block('car', [{ id: 'car.newton', name: 'newton', kind: 'constraint', typeId: 'newton', multiplicity: one }]);
    const v4 = migrateV3ToV4(repo);
    expect(v4.elements.mode.metaclass).toBe('Enumeration');
    expect(v4.elements.alarm.metaclass).toBe('Signal');
    expect(v4.elements.newton.metaclass).toBe('ConstraintBlock');
    expect(v4.elements['car.newton'].metaclass).toBe('ConstraintProperty');
  });
});

describe('rules for the new definitions', () => {
  it('accepts a well-formed model', () => {
    expect(validateSysmlRepository(model()).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('rejects empty and duplicate enumeration literals', () => {
    const repo = model();
    repo.definitions.mode = enumeration('mode', ['on', 'on', ' ']);
    expect(codes(repo)).toEqual(expect.arrayContaining(['DUPLICATE_ENUMERATION_LITERAL', 'EMPTY_ENUMERATION_LITERAL']));
  });

  it('rejects unnamed, duplicate and untyped constraint parameters, and duplicate parameter ids', () => {
    const repo = model();
    repo.definitions.bad = constraintBlock('bad', [
      { id: 'p1', name: 'x', typeId: 'real' }, { id: 'p2', name: 'x', typeId: 'real' },
      { id: 'p3', name: ' ', typeId: 'real' }, { id: 'p4', name: 'y', typeId: 'nowhere' },
      { id: 'newton.F', name: 'z', typeId: 'real' }, // collides with another element's id
    ]);
    expect(codes(repo)).toEqual(expect.arrayContaining(['DUPLICATE_PARAMETER_NAME', 'EMPTY_PARAMETER_NAME', 'MISSING_PARAMETER_TYPE', 'DUPLICATE_ELEMENT_ID']));
  });

  it('types a constraint property by a ConstraintBlock only, a value property by a ValueType or Enumeration, a flow property by a Signal', () => {
    const repo = model();
    repo.definitions.car = block('car', [
      { id: 'p-c', name: 'c', kind: 'constraint', typeId: 'newton', multiplicity: one },
      { id: 'p-mode', name: 'mode', kind: 'value', typeId: 'mode', multiplicity: one },
      { id: 'p-alarm', name: 'alarm', kind: 'flow', typeId: 'alarm', multiplicity: one },
    ]);
    expect(validateBlockDefinition(repo, 'car').map(d => d.code)).not.toContain('MISSING_PROPERTY_TYPE');
    (repo.definitions.car as BlockDefinition).properties.push({ id: 'p-bad', name: 'bad', kind: 'constraint', typeId: 'real', multiplicity: one });
    expect(validateBlockDefinition(repo, 'car').map(d => d.code)).toContain('MISSING_PROPERTY_TYPE');
  });

  it('lets a ConstraintBlock specialise only another ConstraintBlock', () => {
    const endpoint = (family: 'constraintBlock' | 'block', id: string) => ({ id, name: id, family });
    const check = (source: 'constraintBlock' | 'block', target: 'constraintBlock' | 'block') => evaluateSysmlConnection({
      relationshipKind: 'generalization', diagram: 'bdd', source: endpoint(source, 's'), target: endpoint(target, 't'),
    }).allowed;
    expect(check('constraintBlock', 'constraintBlock')).toBe(true);
    expect(check('constraintBlock', 'block')).toBe(false);
    expect(check('block', 'constraintBlock')).toBe(false);
  });
});
