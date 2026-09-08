/**
 * OPM verified-generation workspace (Task 8, OPM scope only).
 *
 * Gating contract:
 * - Verify is disabled unless generation matches the current model fingerprint.
 * - Download / HIL export is disabled unless the bundle is verified AND the
 *   verified fingerprint still matches the current model fingerprint.
 * - Semantic edits (fingerprint change) invalidate back to `edited`;
 *   layout-only edits (same fingerprint) never invalidate.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { AppNode, AppEdge } from './EntropyTypes';
import { compileExecutableOpm } from '../../engine/opm/pipeline';
import {
  generateOpmCArtifacts,
  DEFAULT_OPM_RESOURCE_LIMITS,
  STRICT_C99_COMPILER_FLAGS,
  type OpmManifest,
} from '../../engine/opm/cGenerator';
import type { GeneratedOpmFile } from '../../engine/opm/cGeneratorTypes';
import {
  createDefaultOpmExecutionConfig,
  type OpmDiagnostic,
  type OpmExecutionConfig,
  type OpmSourceRef,
} from '../../engine/opm/executableTypes';
import type { OpmSimulationConfig } from './OpmSimulationConfig';

export type OpmArtifactLifecycle =
  | 'draft'
  | 'edited'
  | 'validated'
  | 'generated'
  | 'verifying'
  | 'verified'
  | 'failed';

export interface OpmVerificationEvidence {
  hostCompile: 'pass' | 'fail' | 'not-run';
  hostRuntime: 'pass' | 'fail' | 'not-run';
  parity?: 'match' | 'mismatch' | 'not-run';
  stdout?: string;
  stderr?: string;
}

export interface OpmArtifactState {
  lifecycle: OpmArtifactLifecycle;
  /** Fingerprint of the live model the last time it was computed. */
  currentFingerprint: string | null;
  /** Fingerprint captured at generation time. */
  generatedFingerprint: string | null;
  /** Fingerprint captured at successful verification time. */
  verifiedFingerprint: string | null;
  files: GeneratedOpmFile[];
  manifest: OpmManifest | null;
  diagnostics: OpmDiagnostic[];
  evidence: OpmVerificationEvidence | null;
  errors: string[];
  verifiedAt: string | null;
  toolchainVersion: string | null;
}

export interface OpmVerifyResult {
  success: boolean;
  evidence?: OpmVerificationEvidence | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  toolchainVersion?: string;
}

export function createInitialArtifactState(): OpmArtifactState {
  return {
    lifecycle: 'draft',
    currentFingerprint: null,
    generatedFingerprint: null,
    verifiedFingerprint: null,
    files: [],
    manifest: null,
    diagnostics: [],
    evidence: null,
    errors: [],
    verifiedAt: null,
    toolchainVersion: null,
  };
}

export function computeCurrentFingerprint(
  nodes: AppNode[],
  edges: AppEdge[],
  executionConfig?: OpmExecutionConfig,
): { fingerprint: string | null; diagnostics: OpmDiagnostic[] } {
  try {
    const compRes = compileExecutableOpm(
      nodes as never,
      edges as never,
      executionConfig ?? createDefaultOpmExecutionConfig(),
    );
    if (!compRes.model) return { fingerprint: null, diagnostics: compRes.diagnostics };
    return { fingerprint: compRes.model.fingerprint, diagnostics: compRes.diagnostics };
  } catch (err) {
    return {
      fingerprint: null,
      diagnostics: [
        {
          code: 'OPM_INTERNAL_ERROR',
          severity: 'error',
          message: err instanceof Error ? err.message : String(err),
          source: { elementId: 'canvas', propertyPath: 'internal' },
        },
      ],
    };
  }
}

/**
 * Fold a live-model fingerprint into artifact state. Layout-only edits keep
 * the same fingerprint, so the same state reference is returned unchanged
 * (no invalidation). Any fingerprint change is a semantic edit: the
 * lifecycle falls back to `draft` and prior verification no longer gates.
 */
export function applyModelEdit(prev: OpmArtifactState, currentFingerprint: string | null): OpmArtifactState {
  if (currentFingerprint === prev.currentFingerprint) return prev;
  if (
    currentFingerprint !== null &&
    prev.generatedFingerprint !== null &&
    currentFingerprint === prev.generatedFingerprint &&
    prev.lifecycle !== 'draft'
  ) {
    // Fingerprint still matches the generated bundle (e.g. undo back to the
    // generated model): refresh the pointer without invalidating.
    return { ...prev, currentFingerprint };
  }
  return {
    ...prev,
    lifecycle: 'draft',
    currentFingerprint,
    verifiedFingerprint:
      prev.verifiedFingerprint !== null && prev.verifiedFingerprint === currentFingerprint
        ? prev.verifiedFingerprint
        : null,
    evidence: prev.verifiedFingerprint !== null && prev.verifiedFingerprint === currentFingerprint ? prev.evidence : null,
  };
}

export function markValidated(
  prev: OpmArtifactState,
  currentFingerprint: string | null,
  diagnostics: OpmDiagnostic[],
): OpmArtifactState {
  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    ...prev,
    lifecycle: hasErrors ? 'failed' : 'validated',
    currentFingerprint,
    diagnostics,
    errors: hasErrors ? diagnostics.filter((d) => d.severity === 'error').map((d) => `[${d.code}] ${d.message}`) : [],
  };
}

export function markGenerated(
  prev: OpmArtifactState,
  currentFingerprint: string,
  files: GeneratedOpmFile[],
  manifest: OpmManifest,
  diagnostics: OpmDiagnostic[],
): OpmArtifactState {
  return {
    ...prev,
    lifecycle: 'generated',
    currentFingerprint,
    generatedFingerprint: currentFingerprint,
    files: [...files],
    manifest,
    diagnostics,
    errors: [],
  };
}

export function markVerifying(prev: OpmArtifactState): OpmArtifactState {
  return { ...prev, lifecycle: 'verifying' };
}

export function markVerified(
  prev: OpmArtifactState,
  verifiedFingerprint: string,
  evidence: OpmVerificationEvidence,
  toolchainVersion: string | null,
): OpmArtifactState {
  return {
    ...prev,
    lifecycle: 'verified',
    verifiedFingerprint,
    evidence,
    errors: [],
    verifiedAt: new Date().toISOString(),
    toolchainVersion,
  };
}

export function markFailed(prev: OpmArtifactState, errors: string[]): OpmArtifactState {
  return { ...prev, lifecycle: 'failed', errors: [...errors] };
}

/**
 * Reset artifact state to draft on model revisions, clearing verified evidence
 * so that downloads and HIL exports fail closed until re-verification.
 */
export function resetToDraft(prev: OpmArtifactState): OpmArtifactState {
  return {
    ...prev,
    lifecycle: 'draft',
    currentFingerprint: null,
    verifiedFingerprint: null,
    evidence: null,
  };
}

/** Verify is enabled only when a generated bundle matches the live model. */
export function canVerify(state: OpmArtifactState): boolean {
  if (state.lifecycle === 'verifying') return false;
  if (state.files.length === 0 || state.generatedFingerprint === null) return false;
  if (state.currentFingerprint === null) return false;
  return state.generatedFingerprint === state.currentFingerprint;
}

/**
 * Download / HIL export is enabled only for a verified bundle whose
 * verified fingerprint still matches both the generated bundle and the
 * live model. Stale, failed, and never-verified states can never download.
 */
export function canDownload(state: OpmArtifactState): boolean {
  if (state.lifecycle !== 'verified') return false;
  if (state.verifiedFingerprint === null) return false;
  if (state.generatedFingerprint === null || state.currentFingerprint === null) return false;
  return (
    state.verifiedFingerprint === state.generatedFingerprint &&
    state.verifiedFingerprint === state.currentFingerprint
  );
}

export function canGenerate(diagnostics: OpmDiagnostic[], currentFingerprint: string | null): boolean {
  if (currentFingerprint === null) return false;
  return !diagnostics.some((d) => d.severity === 'error');
}

export const canRunHil = canDownload;

export interface OpmCodeGenerationWorkspaceProps {
  nodes: AppNode[];
  edges: AppEdge[];
  executionConfig?: OpmExecutionConfig;
  state: OpmArtifactState;
  onStateChange: (next: OpmArtifactState) => void;
  verifyViaIpc?: (files: GeneratedOpmFile[]) => Promise<OpmVerifyResult>;
  onDownload?: (files: GeneratedOpmFile[], fingerprint: string) => void;
  onRunHil?: (files: GeneratedOpmFile[], fingerprint: string) => void;
  onNavigateToDiagnostic?: (source: OpmSourceRef) => void;
  opmSimulationConfig?: OpmSimulationConfig;
}

async function defaultVerifyViaIpc(files: GeneratedOpmFile[]): Promise<OpmVerifyResult> {
  const bridge = (window as unknown as { electronAPI?: { invoke: (channel: string, payload: unknown) => Promise<OpmVerifyResult> } })
    .electronAPI;
  if (!bridge) throw new Error('Verification IPC bridge unavailable (electronAPI missing).');
  return await bridge.invoke('opm-verify-generated-c', { files });
}

export function getRemediationMessage(state: OpmArtifactState, currentFingerprint: string | null): string | null {
  if (state.diagnostics.some((d) => d.severity === 'error')) {
    return 'Resolve model validation errors before generating C code.';
  }
  if (state.lifecycle === 'failed') {
    return 'C qualification failed. Inspect error logs and remediate model or environment.';
  }
  if (state.generatedFingerprint === null || state.lifecycle === 'draft') {
    return 'Generate C code for the current model fingerprint before running verification.';
  }
  if (currentFingerprint !== null && state.generatedFingerprint !== currentFingerprint) {
    return 'Model changed since generation. Re-generate C artifacts for the updated fingerprint.';
  }
  if (state.lifecycle !== 'verified') {
    return 'Verify generated C code against the qualification compiler to unlock download and HIL export.';
  }
  return null;
}

const LIFECYCLE_LABEL: Record<OpmArtifactLifecycle, string> = {
  draft: 'Draft — edit model to generate',
  edited: 'Draft — regeneration required',
  validated: 'Validated — ready to generate',
  generated: 'Generated — ready to verify',
  verifying: 'Verifying…',
  verified: 'Verified — export unlocked',
  failed: 'Failed — see errors',
};

export const OpmCodeGenerationWorkspace: React.FC<OpmCodeGenerationWorkspaceProps> = ({
  nodes,
  edges,
  executionConfig,
  state,
  onStateChange,
  verifyViaIpc,
  onDownload,
  onRunHil,
  onNavigateToDiagnostic,
  opmSimulationConfig,
}) => {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const current = useMemo(
    () => computeCurrentFingerprint(nodes, edges, executionConfig),
    [nodes, edges, executionConfig],
  );

  // Semantic edits invalidate; layout-only edits (same fingerprint) do not.
  useEffect(() => {
    const next = applyModelEdit(state, current.fingerprint);
    if (next !== state) onStateChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.fingerprint]);

  const generateEnabled = canGenerate(current.diagnostics, current.fingerprint);
  const verifyEnabled = canVerify({ ...state, currentFingerprint: current.fingerprint });
  const downloadEnabled = canDownload({ ...state, currentFingerprint: current.fingerprint });
  const stale =
    state.generatedFingerprint !== null &&
    current.fingerprint !== null &&
    state.generatedFingerprint !== current.fingerprint;

  const handleValidate = () => {
    setLocalError(null);
    onStateChange(markValidated({ ...state, currentFingerprint: current.fingerprint }, current.fingerprint, current.diagnostics));
  };

  const handleGenerate = () => {
    setLocalError(null);
    const withCurrent = { ...state, currentFingerprint: current.fingerprint };
    if (current.fingerprint === null) {
      onStateChange(markFailed(withCurrent, current.diagnostics.filter((d) => d.severity === 'error').map((d) => `[${d.code}] ${d.message}`)));
      return;
    }
    if (current.diagnostics.some((d) => d.severity === 'error')) {
      onStateChange(markFailed(withCurrent, current.diagnostics.filter((d) => d.severity === 'error').map((d) => `[${d.code}] ${d.message}`)));
      return;
    }
    try {
      const compRes = compileExecutableOpm(nodes as never, edges as never, executionConfig ?? createDefaultOpmExecutionConfig());
      if (!compRes.model) {
        onStateChange(markFailed(withCurrent, compRes.diagnostics.filter((d) => d.severity === 'error').map((d) => `[${d.code}] ${d.message}`)));
        return;
      }
      const { files, manifest, diagnostics } = generateOpmCArtifacts(compRes.model, compRes.diagnostics);
      if (manifest.qualificationStatus === 'failed') {
        onStateChange(markFailed(withCurrent, diagnostics.map((d) => `[${d.code}] ${d.message}`)));
        return;
      }
      setActiveFile(files[0]?.name ?? null);
      onStateChange(markGenerated(withCurrent, compRes.model.fingerprint, files, manifest, diagnostics));
    } catch (err) {
      onStateChange(markFailed(withCurrent, [err instanceof Error ? err.message : String(err)]));
    }
  };

  const handleVerify = async () => {
    setLocalError(null);
    const withCurrent = { ...state, currentFingerprint: current.fingerprint };
    if (!canVerify(withCurrent)) return;
    onStateChange(markVerifying(withCurrent));
    try {
      const result = await (verifyViaIpc ?? defaultVerifyViaIpc)(withCurrent.files);
      const fp = withCurrent.generatedFingerprint ?? current.fingerprint;
      if (result.success && fp) {
        onStateChange(
          markVerified(withCurrent, fp, result.evidence ?? { hostCompile: 'pass', hostRuntime: 'pass', stdout: result.stdout, stderr: result.stderr }, result.toolchainVersion ?? null),
        );
      } else {
        onStateChange(markFailed(withCurrent, [result.error ?? 'Verification failed with no further detail.']));
      }
    } catch (err) {
      onStateChange(markFailed(withCurrent, [err instanceof Error ? err.message : String(err)]));
    }
  };

  const activeContent = state.files.find((f) => f.name === activeFile)?.content ?? '';
  const errorDiagnostics = (state.diagnostics ?? []).filter((d) => d.severity === 'error');
  const warnDiagnostics = (state.diagnostics ?? []).filter((d) => d.severity === 'warning');
  const limits = state.manifest?.resourceLimits ?? DEFAULT_OPM_RESOURCE_LIMITS;
  const qualificationStatus =
    state.manifest?.qualificationStatus ??
    (state.lifecycle === 'verified' ? 'qualified' : state.lifecycle === 'failed' ? 'failed' : 'pending');

  return (
    <div className="flex flex-col gap-3 p-3 text-xs" data-testid="opm-codegen-workspace">
      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-md p-2.5">
        <div className="flex items-center justify-between">
          <span className="uppercase text-[10px] font-extrabold tracking-wider text-gray-400">Artifact lifecycle</span>
          <span className="text-[10px] font-bold text-emerald-300" data-testid="opm-lifecycle">{LIFECYCLE_LABEL[state.lifecycle]}</span>
        </div>
        <div className="mt-1 font-mono text-[10px] text-gray-400 break-all" data-testid="opm-fingerprint">
          fingerprint: {current.fingerprint ?? '— (model has validation errors)'}
        </div>
        {stale && (
          <div className="mt-1 text-[10px] text-amber-400 font-bold" data-testid="opm-stale-warning">
            Model changed since generation — re-generate before verifying or exporting.
          </div>
        )}
        {localError && <div className="mt-1 text-[10px] text-red-400">{localError}</div>}

        {/* Sequential Actions Stepper */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            data-testid="opm-validate"
            onClick={handleValidate}
            className="px-2 py-1 bg-[#222] hover:bg-[#333] border border-[#333] rounded text-[10px] font-bold"
          >
            1. Validate
          </button>
          <button
            data-testid="opm-generate"
            onClick={handleGenerate}
            disabled={!generateEnabled}
            title={generateEnabled ? 'Generate C artifacts' : 'Generate is blocked: resolve model validation errors first'}
            className={`px-2 py-1 rounded text-[10px] font-bold border ${generateEnabled ? 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-600' : 'bg-[#1c1c1c] text-gray-600 border-[#2d2d2d] cursor-not-allowed'}`}
          >
            2. Generate
          </button>
          <button
            data-testid="opm-verify"
            onClick={handleVerify}
            disabled={!verifyEnabled}
            title={verifyEnabled ? 'Verify the generated bundle' : 'Verify unlocks when generation matches the current model fingerprint'}
            className={`px-2 py-1 rounded text-[10px] font-bold border ${verifyEnabled ? 'bg-sky-700 hover:bg-sky-600 text-white border-sky-600' : 'bg-[#1c1c1c] text-gray-600 border-[#2d2d2d] cursor-not-allowed'}`}
          >
            3. Verify
          </button>
          <button
            data-testid="opm-download"
            onClick={() => downloadEnabled && state.generatedFingerprint && onDownload?.(state.files, state.generatedFingerprint)}
            disabled={!downloadEnabled}
            title={downloadEnabled ? 'Download the verified bundle' : 'Download unlocks only for a verified bundle matching the current model'}
            className={`px-2 py-1 rounded text-[10px] font-bold border ${downloadEnabled ? 'bg-orange-600 hover:bg-orange-500 text-black border-orange-500' : 'bg-[#1c1c1c] text-gray-600 border-[#2d2d2d] cursor-not-allowed'}`}
          >
            4. Download
          </button>
          <button
            data-testid="opm-hil"
            onClick={() => downloadEnabled && state.generatedFingerprint && onRunHil?.(state.files, state.generatedFingerprint)}
            disabled={!downloadEnabled}
            title={downloadEnabled ? 'Send the verified bundle to HIL' : 'HIL unlocks only for a verified bundle matching the current model'}
            className={`px-2 py-1 rounded text-[10px] font-bold border ${downloadEnabled ? 'bg-purple-700 hover:bg-purple-600 text-white border-purple-600' : 'bg-[#1c1c1c] text-gray-600 border-[#2d2d2d] cursor-not-allowed'}`}
          >
            Send to HIL
          </button>
        </div>
        {!downloadEnabled && (
          <div className="mt-2 text-[10px] text-amber-400 font-medium" data-testid="opm-remediation">
            {getRemediationMessage(state, current.fingerprint)}
          </div>
        )}
      </div>

      {/* Progress & Target Evidence Section */}
      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-md p-2.5 space-y-1.5 font-mono text-[10px]">
        <div className="flex items-center justify-between uppercase text-[10px] font-extrabold tracking-wider text-gray-400 border-b border-[#2d2d2d] pb-1">
          <span>Target Configuration &amp; Qualification</span>
          <span
            data-testid="opm-qualification-status"
            className={`font-bold uppercase ${
              qualificationStatus === 'qualified'
                ? 'text-green-400'
                : qualificationStatus === 'failed'
                ? 'text-red-400'
                : 'text-amber-400'
            }`}
          >
            {qualificationStatus}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>OPM Simulation Tick:</span>
          <span data-testid="opm-tick" className="text-white font-bold">
            {opmSimulationConfig?.tickMs ?? state.manifest?.tickMs ?? 10}ms
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-gray-400">
          <span>Resource Limits:</span>
          <div data-testid="opm-resource-limits" className="text-gray-300 pl-1">
            Nodes: {limits.maxNodes} · States: {limits.maxStates} · Processes: {limits.maxProcesses} · Links: {limits.maxLinks}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 text-gray-400">
          <span>Strict Compiler Flags:</span>
          <div data-testid="opm-compiler-flags" className="text-sky-300 pl-1 break-all">
            {STRICT_C99_COMPILER_FLAGS.join(' ')}
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-md p-2.5">
        <span className="uppercase text-[10px] font-extrabold tracking-wider text-gray-400">
          Validation diagnostics ({errorDiagnostics.length} errors, {warnDiagnostics.length} warnings)
        </span>
        <div className="mt-1 max-h-32 overflow-y-auto space-y-1 font-mono text-[10px]">
          {(state.diagnostics ?? []).length === 0 && <div className="text-gray-600 italic">No diagnostics yet — run Validate or Generate.</div>}
          {(state.diagnostics ?? []).map((d, i) => {
            const path = `${d.source.elementId}.${d.source.propertyPath}`;
            return (
              <div
                key={i}
                data-opm-path={path}
                onClick={() => onNavigateToDiagnostic?.(d.source)}
                className={`cursor-pointer hover:underline p-1 rounded hover:bg-white/5 ${d.severity === 'error' ? 'text-red-400' : 'text-amber-300'}`}
                title={`Click to focus inspector for ${d.source.elementId}`}
              >
                [{d.severity.toUpperCase()}] [{d.code}] {d.message}
                <span className="text-gray-500"> @ {d.source.elementId}:{d.source.propertyPath}</span>
              </div>
            );
          })}
        </div>
        {state.errors.length > 0 && (
          <div className="mt-1 space-y-0.5 font-mono text-[10px] text-red-400" data-testid="opm-errors">
            {state.errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </div>

      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-md p-2.5">
        <span className="uppercase text-[10px] font-extrabold tracking-wider text-gray-400">Artifacts ({state.files.length})</span>
        {state.files.length === 0 ? (
          <div className="mt-1 text-[10px] text-gray-600 italic">No generated artifacts yet.</div>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap gap-1">
              {state.files.map((f) => (
                <button
                  key={f.name}
                  onClick={() => setActiveFile(f.name)}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${activeFile === f.name ? 'bg-sky-950 text-sky-300 border-sky-700' : 'bg-[#111] text-gray-400 border-[#2d2d2d] hover:text-white'}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <pre className="mt-1 max-h-48 overflow-auto bg-[#0b0b0b] border border-[#2d2d2d] rounded p-2 font-mono text-[10px] text-gray-300 whitespace-pre-wrap">
              {activeContent}
            </pre>
          </>
        )}
      </div>

      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-md p-2.5">
        <span className="uppercase text-[10px] font-extrabold tracking-wider text-gray-400">Manifest</span>
        <pre className="mt-1 max-h-40 overflow-auto bg-[#0b0b0b] border border-[#2d2d2d] rounded p-2 font-mono text-[10px] text-gray-300 whitespace-pre-wrap">
          {state.manifest ? JSON.stringify(state.manifest, null, 2) : 'No manifest yet.'}
        </pre>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-md p-2.5">
        <span className="uppercase text-[10px] font-extrabold tracking-wider text-gray-400">Compiler output &amp; parity</span>
        {!state.evidence ? (
          <div className="mt-1 text-[10px] text-gray-600 italic">No verification evidence yet.</div>
        ) : (
          <div className="mt-1 font-mono text-[10px] space-y-0.5" data-testid="opm-evidence">
            <div className="text-gray-300">hostCompile: {state.evidence.hostCompile} · hostRuntime: {state.evidence.hostRuntime} · parity: {state.evidence.parity ?? 'not-run'}</div>
            {state.evidence.stdout && <pre className="text-gray-400 whitespace-pre-wrap">[stdout] {state.evidence.stdout}</pre>}
            {state.evidence.stderr && <pre className="text-gray-500 whitespace-pre-wrap">[stderr] {state.evidence.stderr}</pre>}
          </div>
        )}
        {state.verifiedAt && <div className="mt-1 font-mono text-[10px] text-gray-500">verifiedAt: {state.verifiedAt} · toolchain: {state.toolchainVersion ?? 'unknown'}</div>}
      </div>
    </div>
  );
};
