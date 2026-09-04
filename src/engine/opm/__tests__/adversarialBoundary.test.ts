import { describe, expect, it } from 'vitest';
import { compileExecutableOpm } from '../pipeline';
import { generateOpmCArtifacts } from '../cGenerator';
import { makeApplianceFixture } from '../fixtures';
import type { OpmScalarType } from '../executableTypes';

/** Build an otherwise-valid fixture whose object owns a single adversarial attribute. */
function fixtureWithSingleAttribute(initialValue: unknown, type: OpmScalarType) {
  const fixture = makeApplianceFixture();
  const attrId = 'adv_attr';
  (fixture.nodes[0].data as any).objectExecution.attributes = [
    {
      id: attrId,
      displayName: 'Adversarial',
      cIdentifier: 'adv_attr',
      type,
      initialValue,
      overflow: 'diagnostic',
      access: 'readWrite',
      persistent: false,
    },
  ];
  const procExec = (fixture.nodes[3].data as any).processExecution;
  procExec.guard = '';
  procExec.inputAttributeIds = [attrId];
  procExec.outputAttributeIds = [attrId];
  procExec.assignments = [
    {
      id: 'asgn_adv',
      targetAttributeId: attrId,
      operator: '=',
      expression: type.kind === 'bool' ? 'true' : type.kind === 'float32' ? '0.0' : '0',
      enabled: true,
    },
  ];
  (fixture.nodes[1].data as any).stateExecution.entryAssignments = [];
  return fixture;
}

const NON_CANONICAL_CASES: Array<{ label: string; type: OpmScalarType; initialValue: unknown }> = [
  { label: 'bool from string false (mandated)', type: { kind: 'bool' }, initialValue: 'false' },
  { label: 'int32 from injection string (mandated)', type: { kind: 'int32' }, initialValue: '0; injected_call()' },
  { label: 'uint32 from negative (mandated)', type: { kind: 'uint32' }, initialValue: -1 },
  { label: 'float32 from NaN string (mandated)', type: { kind: 'float32' }, initialValue: 'NaN' },
  { label: 'bool from number 1', type: { kind: 'bool' }, initialValue: 1 },
  { label: 'bool from string', type: { kind: 'bool' }, initialValue: 'true' },
  { label: 'int32 from float', type: { kind: 'int32' }, initialValue: 1.5 },
  { label: 'int32 from string', type: { kind: 'int32' }, initialValue: '5' },
  { label: 'uint32 from negative', type: { kind: 'uint32' }, initialValue: -1 },
  { label: 'uint32 from float', type: { kind: 'uint32' }, initialValue: 2.5 },
  { label: 'float32 from string', type: { kind: 'float32' }, initialValue: 'hot' },
  { label: 'float32 from boolean', type: { kind: 'float32' }, initialValue: true },
];

describe('OPM adversarial compiler boundary (RED gate)', () => {
  it.each(NON_CANONICAL_CASES)('rejects non-canonical initial value: $label', ({ type, initialValue }) => {
    const fixture = fixtureWithSingleAttribute(initialValue, type);
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_INVALID_INITIAL_VALUE',
        source: expect.objectContaining({
          elementId: 'obj_boiler',
          propertyPath: 'objectExecution.attributes[0].initialValue',
        }),
      }),
    );
  });

  it('emits resolved C identifiers instead of leaking assignment target ids', () => {
    const fixture = makeApplianceFixture();
    (fixture.nodes[0].data as any).objectExecution.attributes[0] = {
      id: 'stable-id-with-dash',
      displayName: 'Safe Value',
      cIdentifier: 'safe_value',
      type: { kind: 'float32' },
      initialValue: 20.0,
      minimum: 0.0,
      maximum: 100.0,
      overflow: 'saturate',
      access: 'readWrite',
      persistent: false,
    };
    const procExec = (fixture.nodes[3].data as any).processExecution;
    procExec.guard = '';
    procExec.inputAttributeIds = ['stable-id-with-dash'];
    procExec.outputAttributeIds = ['stable-id-with-dash'];
    procExec.assignments[0].targetAttributeId = 'stable-id-with-dash';
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeDefined();
    const files = generateOpmCArtifacts(result.model!).files;
    const modelC = files.find(f => f.name === 'opm_model.c')!.content;
    expect(modelC).toContain('instance->safe_value');
    expect(modelC).not.toContain('stable-id-with-dash');
  });
});
