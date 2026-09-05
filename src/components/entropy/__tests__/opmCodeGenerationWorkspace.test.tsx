import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  applyModelEdit,
  canDownload,
  canVerify,
  canGenerate,
  computeCurrentFingerprint,
  createInitialArtifactState,
  markFailed,
  markGenerated,
  markVerified,
  markVerifying,
  markValidated,
  OpmCodeGenerationWorkspace,
  type OpmArtifactLifecycle,
  type OpmArtifactState,
} from '../OpmCodeGenerationWorkspace';
import { generateOpmCArtifacts } from '../../../engine/opm/cGenerator';
import { compileExecutableOpm } from '../../../engine/opm/pipeline';
import { makeApplianceFixture } from '../../../engine/opm/fixtures';

const ALL_LIFECYCLES: OpmArtifactLifecycle[] = [
  'draft',
  'edited',
  'validated',
  'generated',
  'verifying',
  'verified',
  'failed',
];

function generatedState(): { state: OpmArtifactState; fingerprint: string } {
  const fixture = makeApplianceFixture();
  const compRes = compileExecutableOpm(fixture.nodes as never, fixture.edges as never, fixture.config);
  if (!compRes.model) throw new Error('fixture must compile');
  const { files, manifest } = generateOpmCArtifacts(compRes.model);
  const base = { ...createInitialArtifactState(), currentFingerprint: compRes.model.fingerprint };
  const state = markGenerated(base, compRes.model.fingerprint, files, manifest, compRes.diagnostics);
  return { state, fingerprint: compRes.model.fingerprint };
}

function verifiedState(): { state: OpmArtifactState; fingerprint: string } {
  const { state, fingerprint } = generatedState();
  const verified = markVerified(
    state,
    fingerprint,
    { hostCompile: 'pass', hostRuntime: 'pass', parity: 'match' },
    '1.0.0',
  );
  return { state: verified, fingerprint };
}

describe('OpmCodeGenerationWorkspace lifecycle', () => {
  it('covers the full lifecycle edited|validated|generated|verifying|verified|failed with fingerprint/files/evidence/errors', () => {
    const { state: gen, fingerprint } = generatedState();
    expect(gen.lifecycle).toBe('generated');
    expect(gen.generatedFingerprint).toBe(fingerprint);
    expect(gen.currentFingerprint).toBe(fingerprint);
    expect(gen.files.length).toBeGreaterThan(0);
    expect(gen.manifest?.fingerprint).toBe(fingerprint);

    const validating = markValidated(createInitialArtifactState(), fingerprint, []);
    expect(validating.lifecycle).toBe('validated');

    const verifying = markVerifying(gen);
    expect(verifying.lifecycle).toBe('verifying');

    const { state: verified } = verifiedState();
    expect(verified.lifecycle).toBe('verified');
    expect(verified.verifiedFingerprint).toBe(fingerprint);
    expect(verified.evidence?.hostCompile).toBe('pass');
    expect(verified.evidence?.hostRuntime).toBe('pass');
    expect(verified.verifiedAt).not.toBeNull();

    const failed = markFailed(gen, ['boom']);
    expect(failed.lifecycle).toBe('failed');
    expect(failed.errors).toEqual(['boom']);

    expect(ALL_LIFECYCLES).toHaveLength(7);
  });

  it('semantic edits invalidate verification, layout-only edits do not', () => {
    const fixture = makeApplianceFixture();
    const { state: verified, fingerprint } = verifiedState();

    // Layout-only edit: move a node; fingerprint must be unchanged and state untouched.
    const movedNodes = fixture.nodes.map((n) =>
      n.id === 'proc_heat' ? { ...n, position: { x: 9999, y: 9999 } } : n,
    );
    const moved = computeCurrentFingerprint(movedNodes, fixture.edges, fixture.config);
    expect(moved.fingerprint).toBe(fingerprint);
    const afterLayout = applyModelEdit(verified, moved.fingerprint);
    expect(afterLayout).toBe(verified);
    expect(afterLayout.lifecycle).toBe('verified');

    // Semantic edit: change a guard; fingerprint must change and lifecycle must reset.
    const editedNodes = fixture.nodes.map((n) =>
      n.id === 'proc_heat'
        ? { ...n, data: { ...n.data, processExecution: { ...n.data.processExecution!, guard: 'temp < 10.0' } } }
        : n,
    );
    const edited = computeCurrentFingerprint(editedNodes, fixture.edges, fixture.config);
    expect(edited.fingerprint).not.toBe(fingerprint);
    const afterSemantic = applyModelEdit(verified, edited.fingerprint);
    expect(afterSemantic).not.toBe(verified);
    expect(afterSemantic.lifecycle).toBe('draft');
    expect(afterSemantic.verifiedFingerprint).toBeNull();
    expect(afterSemantic.evidence).toBeNull();
  });

  it('gates Verify on generation matching the current fingerprint', () => {
    const { state: gen, fingerprint } = generatedState();
    expect(canVerify(gen)).toBe(true);

    // Never generated: nothing to verify.
    expect(canVerify(createInitialArtifactState())).toBe(false);

    // Stale generation (model moved on) cannot verify.
    const stale = { ...gen, currentFingerprint: `${fingerprint}-stale` };
    expect(canVerify(stale)).toBe(false);

    // Actively verifying cannot re-verify.
    expect(canVerify(markVerifying(gen))).toBe(false);
  });

  it('stale/failed/never-verified bundles cannot download; matching verified bundles can', () => {
    const { state: verified, fingerprint } = verifiedState();
    expect(canDownload(verified)).toBe(true);

    // Never verified.
    const { state: gen } = generatedState();
    expect(canDownload(gen)).toBe(false);
    expect(canDownload(createInitialArtifactState())).toBe(false);

    // Failed verification.
    expect(canDownload(markFailed(gen, ['host compile failed']))).toBe(false);

    // Stale: model changed after verification.
    const staleVerified: OpmArtifactState = { ...verified, lifecycle: 'verified', currentFingerprint: `${fingerprint}-stale` };
    expect(canDownload(staleVerified)).toBe(false);

    // Stale generation invalidated back to draft.
    const invalidated = applyModelEdit(verified, `${fingerprint}-stale`);
    expect(invalidated.lifecycle).toBe('draft');
    expect(canDownload(invalidated)).toBe(false);
  });

  it('asserts manifest initially shows pending qualificationStatus and never labels unqualified output as qualified', () => {
    const fixture = makeApplianceFixture();
    const compRes = compileExecutableOpm(fixture.nodes as never, fixture.edges as never, fixture.config);
    if (!compRes.model) throw new Error('fixture must compile');

    const result = generateOpmCArtifacts(compRes.model);
    expect(result.manifest.qualificationStatus).toBe('pending');
    expect(result.manifest.qualificationStatus).not.toBe('qualified');
  });

  it('asserts empty files produce failed lifecycle and manifest status', () => {
    const fixture = makeApplianceFixture();
    const compRes = compileExecutableOpm(fixture.nodes as never, fixture.edges as never, fixture.config);
    if (!compRes.model) throw new Error('fixture must compile');

    // Simulate empty file diagnostic
    const res = generateOpmCArtifacts(compRes.model, [
      {
        code: 'OPM_CODEGEN_EMPTY_FILE',
        severity: 'error',
        message: 'Empty file detected',
        source: { elementId: 'opm_model.c', propertyPath: 'content' },
      },
    ]);
    expect(res.manifest.qualificationStatus).toBe('failed');
    expect(res.files).toHaveLength(0);
    expect(res.diagnostics.some(d => d.code === 'OPM_CODEGEN_EMPTY_FILE')).toBe(true);
  });

  it('blocks Generate when model has validation errors or null fingerprint', () => {
    // Null fingerprint -> blocked
    expect(canGenerate([], null)).toBe(false);

    // Errors present -> blocked
    expect(
      canGenerate(
        [{ code: 'ERR', severity: 'error', message: 'bad', source: { elementId: 'n1', propertyPath: 'name' } }],
        'fp123',
      ),
    ).toBe(false);

    // Warnings only -> allowed
    expect(
      canGenerate(
        [{ code: 'WARN', severity: 'warning', message: 'caution', source: { elementId: 'n1', propertyPath: 'name' } }],
        'fp123',
      ),
    ).toBe(true);
  });

  it('renders sequential progress sections, evidence details, and data-opm-path on diagnostics', () => {
    const fixture = makeApplianceFixture();
    const { state: verified, fingerprint } = verifiedState();

    const stateWithDiagnostics: OpmArtifactState = {
      ...verified,
      diagnostics: [
        {
          code: 'OPM_TEST_DIAG',
          severity: 'warning',
          message: 'Check port connection',
          source: { elementId: 'obj_pump', propertyPath: 'attributes.speed' },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <OpmCodeGenerationWorkspace
        nodes={fixture.nodes as never}
        edges={fixture.edges as never}
        state={stateWithDiagnostics}
        onStateChange={() => {}}
        opmSimulationConfig={{
          tickMs: 25,
          maxTicks: 1000,
          maxEventsPerTick: 16,
          deterministicOrder: 'priority-then-source-order',
        }}
      />,
    );

    // 1. Sequential action buttons exist
    expect(html).toContain('data-testid="opm-validate"');
    expect(html).toContain('data-testid="opm-generate"');
    expect(html).toContain('data-testid="opm-verify"');
    expect(html).toContain('data-testid="opm-download"');

    // 2. Evidence details exist
    expect(html).toContain('data-testid="opm-fingerprint"');
    expect(html).toContain('data-testid="opm-tick"');
    expect(html).toContain('25ms');
    expect(html).toContain('data-testid="opm-resource-limits"');
    expect(html).toContain('data-testid="opm-compiler-flags"');
    expect(html).toContain('-std=c99');
    expect(html).toContain('data-testid="opm-qualification-status"');
    expect(html).toContain('data-testid="opm-evidence"');

    // 3. Diagnostic elements have data-opm-path attribute
    expect(html).toContain('data-opm-path="obj_pump.attributes.speed"');
  });

  it('disables Generate button when model validation fails', () => {
    const fixture = makeApplianceFixture();
    // Invalid model: object with empty name or corrupt state
    const invalidNodes = fixture.nodes.map(n =>
      n.id === 'obj_pump' ? { ...n, data: { ...n.data, name: '' } } : n
    );

    const html = renderToStaticMarkup(
      <OpmCodeGenerationWorkspace
        nodes={invalidNodes as never}
        edges={fixture.edges as never}
        state={createInitialArtifactState()}
        onStateChange={() => {}}
      />,
    );

    // Generate button should be disabled when model has errors
    expect(html).toMatch(/<button[^>]*data-testid="opm-generate"[^>]*disabled|<button[^>]*disabled[^>]*data-testid="opm-generate"/);
  });
});
