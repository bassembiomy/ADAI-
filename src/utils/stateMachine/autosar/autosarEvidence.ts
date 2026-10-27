/** Browser-safe types of the verification evidence (the Node-only verifier produces them, the report renders them). */
export const AUTOSAR_GATE_IDS = [
  'generation',
  'misra-subset',
  'arxml-structure',
  'host-build',
  'unit-test',
  'coverage',
  'static-analysis',
  'sanitizers',
  'second-compiler',
  'differential',
  'reproducible-build',
] as const;

export type AutosarGateId = (typeof AUTOSAR_GATE_IDS)[number];
export type AutosarGateStatus = 'pass' | 'fail' | 'not-run';

export interface AutosarGateEvidence {
  id: string;
  status: AutosarGateStatus;
  summary: string;
  /** Tool executable name (no directory), null for gates decided by ADIA's own TypeScript checks. */
  tool: string | null;
  toolVersion: string | null;
  /** Command line with paths relative to the package directory. */
  command: string | null;
  metrics: Record<string, number>;
}

export interface AutosarVerificationEvidence {
  swcName: string;
  fingerprint: string | null;
  generatorVersion: string;
  /** SHA-256 (hex) of every package file, keyed by its path (autosar/...). */
  fileSha256: Record<string, string>;
  gates: AutosarGateEvidence[];
  verdict: 'accepted' | 'not-accepted';
  /** Supplied by the caller (ISO timestamp) or null: the verifier never reads the clock. */
  executedAt: string | null;
}
