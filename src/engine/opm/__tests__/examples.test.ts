import { describe, it, expect } from 'vitest';
import { makeApplianceFixture, makeConformanceExerciseFixture, makeConformanceContentionFixture } from '../fixtures';
import { compileExecutableOpm } from '../pipeline';
import { generateOpmCArtifacts } from '../cGenerator';

describe('OPM template examples validation and code generation', () => {
  const getFixture = (key: string) => {
    switch (key) {
      case 'appliance': return makeApplianceFixture();
      case 'exercise': return makeConformanceExerciseFixture();
      case 'contention': return makeConformanceContentionFixture();
      default: throw new Error(`Unknown fixture ${key}`);
    }
  };

  it.each(['appliance', 'exercise', 'contention'])('validates and generates template %s', (key) => {
    const ex = getFixture(key);
    expect(ex).toBeDefined();
    expect(ex.nodes).toBeDefined();
    expect(ex.edges).toBeDefined();

    const comp = compileExecutableOpm(ex.nodes, ex.edges, ex.config);
    expect(comp.model).toBeDefined();
    expect(comp.diagnostics.filter(d => d.severity === 'error')).toEqual([]);

    const cArtifacts = generateOpmCArtifacts(comp.model!);
    expect(cArtifacts.files).toHaveLength(12);
    expect(cArtifacts.files.map(f => f.name)).toContain('opm_runtime.c');
    expect(cArtifacts.files.map(f => f.name)).toContain('opm_manifest.json');
  });

  it.each(['appliance', 'exercise', 'contention'])('template %s emits bounded scheduler with diagnostics', (key) => {
    const ex = getFixture(key);
    const comp = compileExecutableOpm(ex.nodes, ex.edges, ex.config);
    const cArtifacts = generateOpmCArtifacts(comp.model!);
    const byName = new Map(cArtifacts.files.map(f => [f.name, f.content]));
    expect(byName.get('opm_runtime.h')).toContain('const OPM_Diagnostics_t *OPM_GetDiagnostics');
    const runtimeC = byName.get('opm_runtime.c') ?? '';
    for (const fn of ['OPM_EvaluateEligibility', 'OPM_ResolveWriteConflicts', 'OPM_CommitTransitions', 'OPM_RunStateActions']) {
      expect(runtimeC).toContain(fn);
    }
    expect(cArtifacts.files.map(f => f.content).join('\n')).not.toMatch(/\b(malloc|calloc|realloc|free)\s*\(/);
    const s = comp.model!.settings;
    expect(byName.get('opm_config.h')).toContain(`(${s.eventQueueCapacity}U)`);
    expect(byName.get('opm_config.h')).toContain(`(${s.maxStagedWrites}U)`);
    expect(byName.get('opm_model.h')).toContain('staged_writes[OPM_MAX_STAGED_WRITES]');
    expect(runtimeC).toContain('OPM_UNKNOWN_EVENT');
    // Action evaluators return status; failures never commit as zero.
    expect(byName.get('opm_model.c')).toContain('OPM_Status_t OPM_Action_');
    expect(runtimeC).toContain('if (!__ok');
  });
});
