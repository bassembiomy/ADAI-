import { describe, it, expect } from 'vitest';
import {
  applyModelEdit,
  canDownload,
  canVerify,
  computeCurrentFingerprint,
  createInitialArtifactState,
  markFailed,
  markGenerated,
  markVerified,
  markVerifying,
  markValidated,
  type OpmArtifactLifecycle,
  type OpmArtifactState,
} from '../OpmCodeGenerationWorkspace';
import { generateOpmCArtifacts } from '../../../engine/opm/cGenerator';
import { compileExecutableOpm } from '../../../engine/opm/pipeline';
import { makeApplianceFixture } from '../../../engine/opm/fixtures';

const ALL_LIFECYCLES: OpmArtifactLifecycle[] = [
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

    expect(ALL_LIFECYCLES).toHaveLength(6);
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
    expect(afterSemantic.lifecycle).toBe('edited');
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

    // Stale generation invalidated back to edited.
    const invalidated = applyModelEdit(verified, `${fingerprint}-stale`);
    expect(invalidated.lifecycle).toBe('edited');
    expect(canDownload(invalidated)).toBe(false);
  });
});
