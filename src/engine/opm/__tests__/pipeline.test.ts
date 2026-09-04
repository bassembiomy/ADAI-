import { describe, it, expect } from 'vitest';
import { compileExecutableOpm, computeModelFingerprint } from '../pipeline';
import { canonicalJson, sha256Hex } from '../canonicalHash';
import { generateOpmCArtifacts } from '../cGenerator';
import { makeApplianceFixture } from '../fixtures';

describe('OPM executable compilation pipeline', () => {
  it('compiles a complete appliance model into immutable typed IR', () => {
    const fixture = makeApplianceFixture();
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);

    expect(result.model).toBeDefined();
    const model = result.model!;
    expect(model.executionEnabled).toBe(true);
    expect(model.fingerprint).toBeDefined();
    expect(model.fingerprint.length).toBeGreaterThan(0);
    expect(model.objects).toHaveLength(1);
    expect(model.states).toHaveLength(2);
    expect(model.processes).toHaveLength(1);
    expect(model.links).toHaveLength(2);

    // Verify immutability
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.objects)).toBe(true);
    expect(Object.isFrozen(model.states)).toBe(true);
    expect(Object.isFrozen(model.processes)).toBe(true);
    expect(Object.isFrozen(model.links)).toBe(true);

    // Verify compiled process has typed IR guard and assignments
    const heatProc = model.processes[0];
    expect(heatProc.guardIr).toBeDefined();
    expect(heatProc.guardIr?.kind).toBe('binary');
    expect(heatProc.assignments).toHaveLength(1);
    expect(heatProc.assignments[0].expressionIr.kind).toBe('literal');
  });

  it('retains source element and property path in diagnostics', () => {
    const fixture = makeApplianceFixture();
    // Invalidate an assignment target
    fixture.nodes[3].data.processExecution!.assignments[0].targetAttributeId = 'non_existent_var';
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);

    expect(result.model).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    // Single documented code: unknown targets report OPM_ASSIGNMENT_TARGET_UNKNOWN
    // (OPM_EXPR_UNKNOWN_REFERENCE is reserved for unknown expression symbols).
    const err = result.diagnostics.find(d => d.code === 'OPM_ASSIGNMENT_TARGET_UNKNOWN');
    expect(err).toBeDefined();
    expect(result.diagnostics.filter(d => d.code === 'OPM_EXPR_UNKNOWN_REFERENCE')).toEqual([]);
    expect(err?.source.elementId).toBe('proc_heat');
  });
});

describe('OPM compiler-boundary gates: settings, enums, disabled payloads (RED)', () => {
  it.each([
    ['eventQueueCapacity', 0],
    ['eventQueueCapacity', -4],
    ['eventQueueCapacity', 2.5],
    ['maxStagedWrites', 0],
    ['maxTransitions', -3],
    ['traceCapacity', 1.5],
    ['tickMs', 0],
  ] as Array<[string, number]>)('rejects invalid target setting %s = %s', (field, value) => {
    const fixture = makeApplianceFixture();
    (fixture.config.settings as unknown as Record<string, unknown>)[field] = value;
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_INVALID_SETTINGS',
        source: expect.objectContaining({ propertyPath: `settings.${field}` }),
      }),
    );
  });

  it('rejects an invalid enum initial value', () => {
    const fixture = makeApplianceFixture();
    (fixture.nodes[0].data as any).objectExecution.attributes[2].initialValue = 'mode_nonexistent';
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_INVALID_INITIAL_VALUE',
        source: expect.objectContaining({
          elementId: 'obj_boiler',
          propertyPath: 'objectExecution.attributes[2].initialValue',
        }),
      }),
    );
  });

  it('reports unknown assignment targets as OPM_ASSIGNMENT_TARGET_UNKNOWN', () => {
    const fixture = makeApplianceFixture();
    (fixture.nodes[1].data as any).stateExecution.entryAssignments[0].targetAttributeId = 'no_such_attr';
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_ASSIGNMENT_TARGET_UNKNOWN',
        source: expect.objectContaining({ elementId: 'st_boiler_off' }),
      }),
    );
  });

  it('drops disabled processes from compilation and C output', () => {
    const fixture = makeApplianceFixture();
    (fixture.nodes[3].data as any).processExecution.enabled = false;
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeDefined();
    expect(result.model!.processes).toHaveLength(0);
    const modelC = generateOpmCArtifacts(result.model!).files
      .find(f => f.name === 'opm_model.c')!.content;
    expect(modelC).not.toContain('proc_');
  });

  it('drops disabled link behavior from compilation', () => {
    const fixture = makeApplianceFixture();
    (fixture.edges[0].data as any).linkExecution.enabled = false;
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeDefined();
    const link = result.model!.links.find(l => l.id === 'edge_heat_effect')!;
    expect(link.transition).toBeUndefined();
    expect(link.assignments).toHaveLength(0);
  });

  it('disabled transition links confer no state reachability', () => {
    const fixture = makeApplianceFixture();
    (fixture.edges[1].data as any).linkExecution.enabled = false;
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'OPM_STATE_UNREACHABLE' }),
    );
  });

  it('skips type-checking disabled assignments', () => {
    const fixture = makeApplianceFixture();
    const procExec = (fixture.nodes[3].data as any).processExecution;
    procExec.assignments.push({
      id: 'asgn_disabled_garbage',
      targetAttributeId: 'temp',
      operator: '=',
      expression: 'nonexistent_symbol_xyz',
      enabled: false,
    });
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeDefined();
  });

  it.each(['aggregation', 'generalization', 'exhibition', 'satisfies', 'verifies'] as const)(
    'accepts valid requirement structural link %s',
    linkType => {
      const fixture = makeApplianceFixture();
      fixture.edges.push({
        id: `edge_req_${linkType}`,
        source: 'obj_boiler',
        target: 'proc_heat',
        type: linkType as string,
        data: { type: linkType },
      } as unknown as (typeof fixture.edges)[number]);
      const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
      expect(result.model).toBeDefined();
      expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    },
  );
});

describe('OPM model fingerprint (Task 2)', () => {
  it('sha256Hex matches the known abc vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('fingerprint is 64 lowercase hex chars', () => {
    const fixture = makeApplianceFixture();
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeDefined();
    expect(result.model!.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fingerprint is invariant to React Flow array order and object key order', () => {
    const a = makeApplianceFixture();
    const b = makeApplianceFixture();
    b.nodes = [...b.nodes].reverse();
    b.edges = [...b.edges].reverse();
    const ra = compileExecutableOpm(a.nodes, a.edges, a.config);
    const rb = compileExecutableOpm(b.nodes, b.edges, b.config);
    expect(ra.model).toBeDefined();
    expect(rb.model).toBeDefined();
    expect(ra.model!.fingerprint).toBe(rb.model!.fingerprint);

    const obj = { b: 1, a: { d: 4, c: 3 } };
    const reordered = { a: { c: 3, d: 4 }, b: 1 };
    expect(canonicalJson(obj)).toBe(canonicalJson(reordered));
    expect(computeModelFingerprint(obj)).toBe(computeModelFingerprint(reordered));
    expect(computeModelFingerprint(obj)).toMatch(/^[a-f0-9]{64}$/);
  });
});

