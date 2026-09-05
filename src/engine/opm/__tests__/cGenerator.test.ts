import { describe, it, expect } from 'vitest';
import { generateOpmCArtifacts } from '../cGenerator';
import { compileExecutableOpm } from '../pipeline';
import { makeApplianceFixture } from '../fixtures';
import { createDefaultOpmExecutionConfig } from '../executableTypes';
import type { AppNode, AppEdge } from '../../../components/entropy/EntropyTypes';

function hostileModel() {
  const config = createDefaultOpmExecutionConfig();
  config.events = [{ id: 'ev_go', displayName: 'Go', cIdentifier: 'ev_go' }];
  const nodes: AppNode[] = [
    {
      id: 'obj_hostile',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: {
        name: 'Boiler */ evil_system("pwn")',
        type: 'object',
        physical: false,
        objectExecution: {
          enabled: true,
          attributes: [
            {
              id: 'stable-id-with-dash',
              displayName: 'Nice */ bad("x")',
              cIdentifier: 'safe_value',
              type: { kind: 'int32' },
              initialValue: 7,
              overflow: 'wrap',
              access: 'readWrite',
              persistent: false,
            } as never,
          ],
        },
      },
    } as never,
    {
      id: 'proc_mixed',
      type: 'opmProcess',
      position: { x: 10, y: 10 },
      data: {
        name: 'Proc */ inject',
        type: 'process',
        physical: false,
        processExecution: {
          enabled: true,
          activation: 'cyclic',
          inputAttributeIds: [],
          outputAttributeIds: [],
          guard: '',
          assignments: [
            {
              id: 'a1',
              targetAttributeId: 'stable-id-with-dash',
              operator: '=',
              expression: '1 + 2',
              enabled: true,
            },
          ],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      },
    } as never,
  ];
  const edges: AppEdge[] = [];
  return compileExecutableOpm(nodes, edges, config);
}

function floatMixedModel() {
  const config = createDefaultOpmExecutionConfig();
  const nodes: AppNode[] = [
    {
      id: 'obj_f',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: {
        name: 'Tank',
        type: 'object',
        physical: false,
        objectExecution: {
          enabled: true,
          attributes: [
            {
              id: 'level',
              displayName: 'Level',
              cIdentifier: 'level',
              type: { kind: 'float32' },
              initialValue: 20.0,
              overflow: 'saturate',
              access: 'readWrite',
              persistent: false,
            } as never,
            {
              id: 'count',
              displayName: 'Count',
              cIdentifier: 'count',
              type: { kind: 'int32' },
              initialValue: 3,
              overflow: 'wrap',
              access: 'readWrite',
              persistent: false,
            } as never,
          ],
        },
      },
    } as never,
    {
      id: 'proc_f',
      type: 'opmProcess',
      position: { x: 10, y: 10 },
      data: {
        name: 'Fill',
        type: 'process',
        physical: false,
        processExecution: {
          enabled: true,
          activation: 'cyclic',
          inputAttributeIds: [],
          outputAttributeIds: [],
          guard: '',
          assignments: [
            {
              id: 'a1',
              targetAttributeId: 'level',
              operator: '=',
              expression: 'count + 0.5',
              enabled: true,
            },
            {
              id: 'a2',
              targetAttributeId: 'count',
              operator: '=',
              expression: '1 + 2',
              enabled: true,
            },
          ],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      },
    } as never,
  ];
  return compileExecutableOpm(nodes, [], config);
}

describe('OPM C99 code generator', () => {
  const fixture = makeApplianceFixture();
  const comp = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
  const applianceModel = comp.model!;

  it('generates the complete deterministic package', () => {
    const result = generateOpmCArtifacts(applianceModel);
    expect(result.files.map(f => f.name)).toEqual([
      'opm_types.h',
      'opm_config.h',
      'opm_model.h',
      'opm_model.c',
      'opm_runtime.h',
      'opm_runtime.c',
      'opm_io.h',
      'opm_io.c',
      'opm_trace.h',
      'opm_trace.c',
      'main_example.c',
      'opm_manifest.json',
    ]);
    expect(result.files.map(f => f.content).join('\n')).not.toMatch(/\b(malloc|calloc|realloc|free)\s*\(/);
  });

  it('emits the public instance API exactly once', () => {
    const result = generateOpmCArtifacts(applianceModel);
    const header = result.files.find(f => f.name === 'opm_runtime.h')?.content ?? '';
    expect(header).toContain('void OPM_Init(OPM_Instance_t *instance);');
    expect(header).toContain('OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);');
    expect(header).toContain('OPM_Status_t OPM_DispatchEvent(OPM_Instance_t *instance, OPM_EventId_t event_id);');
  });

  it('generates deterministic byte-identical output regardless of input order', () => {
    const revNodes = [...fixture.nodes].reverse();
    const revEdges = [...fixture.edges].reverse();
    const revModel = compileExecutableOpm(revNodes, revEdges, fixture.config).model!;

    const res1 = generateOpmCArtifacts(applianceModel);
    const res2 = generateOpmCArtifacts(revModel);

    expect(res1.files).toEqual(res2.files);
    expect(res1.manifest).toEqual(res2.manifest);
  });

  it('emits bounded scheduler state + diagnostics API', () => {
    const result = generateOpmCArtifacts(applianceModel);
    const byName = new Map(result.files.map(f => [f.name, f.content]));
    expect(byName.get('opm_runtime.h')).toContain('const OPM_Diagnostics_t *OPM_GetDiagnostics');
    const runtimeC = byName.get('opm_runtime.c') ?? '';
    expect(runtimeC).toContain('OPM_EvaluateEligibility');
    expect(runtimeC).toContain('OPM_ResolveWriteConflicts');
    expect(runtimeC).toContain('OPM_CommitTransitions');
    expect(runtimeC).toContain('OPM_RunStateActions');
  });

  it('never renders stable ID as lvalue', () => {
    const hm = hostileModel();
    expect(hm.model).toBeDefined();
    const result = generateOpmCArtifacts(hm.model!);
    const modelC = result.files.find(f => f.name === 'opm_model.c')?.content ?? '';
    expect(modelC).toContain('instance->safe_value');
    expect(modelC).not.toContain('stable-id-with-dash');
  });

  it('uses exact configured array bounds and no heap', () => {
    const result = generateOpmCArtifacts(applianceModel);
    const byName = new Map(result.files.map(f => [f.name, f.content]));
    const s = applianceModel.settings;
    expect(byName.get('opm_config.h')).toContain(`(${s.eventQueueCapacity}U)`);
    expect(byName.get('opm_config.h')).toContain(`(${s.maxStagedWrites}U)`);
    expect(byName.get('opm_config.h')).toContain(`(${s.maxTransitions}U)`);
    expect(byName.get('opm_config.h')).toContain(`(${s.traceCapacity}U)`);
    const modelH = byName.get('opm_model.h') ?? '';
    expect(modelH).toContain('event_queue[OPM_EVENT_QUEUE_CAPACITY]');
    expect(modelH).toContain('staged_writes[OPM_MAX_STAGED_WRITES]');
    expect(modelH).toContain('staged_trans[OPM_MAX_TRANSITIONS]');
    expect(modelH).toContain('trace_ids[OPM_TRACE_CAPACITY]');
    expect(result.files.map(f => f.content).join('\n')).not.toMatch(/\b(malloc|calloc|realloc|free)\s*\(/);
  });

  it('never injects raw labels into C tokens or comments', () => {
    const hm = hostileModel();
    const result = generateOpmCArtifacts(hm.model!);
    const cSources = result.files.filter(f => f.name.endsWith('.h') || f.name.endsWith('.c')).map(f => f.content).join('\n');
    expect(cSources).not.toContain('evil_system');
    expect(cSources).not.toContain('stable-id-with-dash');
    expect(cSources).not.toContain('*/ evil');
    // Trace mapping for raw ids lives in the JSON manifest only.
    const manifestRaw = result.files.find(f => f.name === 'opm_manifest.json')?.content ?? '';
    expect(manifestRaw).toContain('stable-id-with-dash');
  });

  it('validates unknown events and supports both FIFO overflow policies', () => {
    const result = generateOpmCArtifacts(applianceModel);
    const runtimeC = result.files.find(f => f.name === 'opm_runtime.c')?.content ?? '';
    expect(runtimeC).toContain('OPM_UNKNOWN_EVENT');
    expect(runtimeC).toContain('OPM_EVENT_COUNT');
    expect(runtimeC).toContain('OPM_EVENT_OVERFLOW_DROP_OLDEST');
    expect(runtimeC).toContain('dropOldest');
    expect(runtimeC).toContain('rejectNewest');

    const cfgReject = JSON.parse(JSON.stringify(fixture.config));
    const cfgDrop = JSON.parse(JSON.stringify(fixture.config));
    cfgDrop.settings.eventOverflow = 'dropOldest';
    const mReject = compileExecutableOpm(fixture.nodes, fixture.edges, cfgReject).model!;
    const mDrop = compileExecutableOpm(fixture.nodes, fixture.edges, cfgDrop).model!;
    const rReject = generateOpmCArtifacts(mReject).files.find(f => f.name === 'opm_config.h')?.content ?? '';
    const rDrop = generateOpmCArtifacts(mDrop).files.find(f => f.name === 'opm_config.h')?.content ?? '';
    expect(rReject).toContain('#define OPM_EVENT_OVERFLOW_DROP_OLDEST (0U)');
    expect(rDrop).toContain('#define OPM_EVENT_OVERFLOW_DROP_OLDEST (1U)');
  });

  it('emits enabled-only process/link tables and typed init literals', () => {
    const result = generateOpmCArtifacts(applianceModel);
    const byName = new Map(result.files.map(f => [f.name, f.content]));
    expect(byName.get('opm_model.h')).toContain('OPM_PROCESS_TABLE');
    expect(byName.get('opm_model.h')).toContain('OPM_LINK_TABLE');
    expect(byName.get('opm_model.c')).toContain('OPM_PROCESS_TABLE');
    expect(byName.get('opm_model.c')).toContain('OPM_LINK_TABLE');
    // Canonical init literals: float with f suffix, int plain, bool words.
    expect(byName.get('opm_model.c')).toMatch(/20\.0f/);
    expect(byName.get('opm_model.c')).toMatch(/instance->pressure = 100/);
  });

  it('renders type-correct integer/float ops', () => {
    const fm = floatMixedModel();
    expect(fm.model).toBeDefined();
    const result = generateOpmCArtifacts(fm.model!);
    const modelC = result.files.find(f => f.name === 'opm_model.c')?.content ?? '';
    expect(modelC).toMatch(/0\.5f/);
    expect(modelC).toContain('(float)');
    expect(modelC).not.toMatch(/instance->count = 3\.0f/);
  });

  it('mirrors TS scheduler phases and returns worst status without committing failures', () => {
    const result = generateOpmCArtifacts(applianceModel);
    const byName = new Map(result.files.map(f => [f.name, f.content]));
    const runtimeC = byName.get('opm_runtime.c') ?? '';
    const modelC = byName.get('opm_model.c') ?? '';
    for (const phase of ['sampleInputs', 'advanceTimers', 'activate', 'evaluate', 'stage', 'resolveConflicts', 'commit', 'stateActions', 'publishOutputs']) {
      expect(runtimeC).toContain(phase);
    }
    expect(runtimeC).toContain('OPM_WorstStatus');
    expect(runtimeC).toContain('if (!__ok');
    // Checked divide/modulo helpers live in the model translation unit;
    // the scheduler refuses to stage or commit when they report failure.
    expect(modelC).toContain('OPM_CheckedDiv');
    expect(runtimeC).toContain('OPM_Model_EvaluateAction');
  });

  describe('Task 6: Strengthen embedded-oriented OPM C artifacts', () => {
    it('emits standard public API names, fixed-width types, bounded arrays, and comprehensive manifest fields', () => {
      const result = generateOpmCArtifacts(applianceModel);
      const runtimeH = result.files.find(f => f.name === 'opm_runtime.h')?.content ?? '';

      // 1. Public API names
      expect(runtimeH).toContain('void OPM_Init(OPM_Instance_t *instance);');
      expect(runtimeH).toContain('void OPM_Reset(OPM_Instance_t *instance);');
      expect(runtimeH).toContain('OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);');
      expect(runtimeH).toContain('OPM_Status_t OPM_DispatchEvent(OPM_Instance_t *instance, OPM_EventId_t event_id);');

      // 2. Manifest fields
      expect(result.manifest.modelFingerprint).toBe(applianceModel.fingerprint);
      expect(result.manifest.generatorVersion).toBe('1.0.0');
      expect(result.manifest.tickMs).toBe(applianceModel.settings.tickMs);
      expect(result.manifest.resourceLimits).toBeDefined();
      expect(result.manifest.resourceLimits.maxNodes).toBeGreaterThan(0);
      expect(result.manifest.strictCompilerFlags).toEqual(
        expect.arrayContaining(['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror']),
      );
      expect(result.manifest.qualificationStatus).toBeDefined();
    });

    it('rejects invalid C identifiers fail-closed without emitting partial artifacts', () => {
      const invalidModel = JSON.parse(JSON.stringify(applianceModel));
      invalidModel.objects[0].cIdentifier = '123-invalid-ident!';
      const result = generateOpmCArtifacts(invalidModel);
      expect(result.files).toHaveLength(0);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.some(d => d.code === 'OPM_CODEGEN_INVALID_IDENTIFIER')).toBe(true);
    });

    it('rejects resource limit overflow fail-closed without emitting partial artifacts', () => {
      const overflowModel = JSON.parse(JSON.stringify(applianceModel));
      overflowModel.settings.eventQueueCapacity = 99999;
      const result = generateOpmCArtifacts(overflowModel);
      expect(result.files).toHaveLength(0);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.some(d => d.code === 'OPM_CODEGEN_RESOURCE_LIMIT_EXCEEDED')).toBe(true);
    });

    it('functions in browser / renderer environment where Buffer is undefined', () => {
      const originalBuffer = (globalThis as any).Buffer;
      try {
        delete (globalThis as any).Buffer;
        const result = generateOpmCArtifacts(applianceModel);
        expect(result.files.length).toBeGreaterThan(0);
        expect(result.manifest.qualificationStatus).toBe('pending');
      } finally {
        (globalThis as any).Buffer = originalBuffer;
      }
    });
  });
});

