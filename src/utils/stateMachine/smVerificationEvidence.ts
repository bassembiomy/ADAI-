import { contentHash } from '../../engine/embedded/contentHash';

export type VerificationStatus =
  | 'PASS'
  | 'FAIL'
  | 'NOT_RUN'
  | 'NOT_APPLICABLE'
  | 'PENDING';

export type VerificationActivity =
  | 'structural'
  | 'semantic'
  | 'test-generation'
  | 'host-compilation'
  | 'host-runtime'
  | 'sanitizers'
  | 'statement-coverage'
  | 'branch-coverage'
  | 'mcdc-coverage'
  | 'differential'
  | 'static-analysis'
  | 'misra-analysis'
  | 'target-compilation'
  | 'hardware';

export interface CommandEvidence {
  executable: string;
  args: readonly string[];
  cwd: string;
  toolVersion: string | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  startedAt: string;
  durationMs: number;
  inputHashes: Readonly<Record<string, string>>;
  outputHashes: Readonly<Record<string, string>>;
}

export interface ActivityEvidence<T = unknown> {
  activity: VerificationActivity;
  status: VerificationStatus;
  summary: string;
  command: CommandEvidence | null;
  details: T;
}

export interface VerificationBundle {
  schemaVersion: 1;
  modelHash: string;
  generatedAt: string;
  overallStatus: VerificationStatus;
  acceptance: boolean;
  activities: Readonly<Record<VerificationActivity, ActivityEvidence>>;
}

const getNodeBuiltin = (name: string): any => {
  if (typeof process !== 'undefined' && process.versions?.node) {
    if (typeof (process as any).getBuiltinModule === 'function') {
      try {
        return (process as any).getBuiltinModule(name);
      } catch {
        // fallback
      }
    }
    try {
      if (typeof require === 'function') {
        return require(name);
      }
    } catch {
      // fallback
    }
    try {
      const req = (globalThis as any).require;
      if (typeof req === 'function') {
        return req(name);
      }
    } catch {
      // fallback
    }
  }
  return null;
};

export const computeFileSha256 = (filePath: string): string => {
  const nodeFs = getNodeBuiltin('node:fs') || getNodeBuiltin('fs');
  const nodeCrypto = getNodeBuiltin('node:crypto') || getNodeBuiltin('crypto');
  if (nodeFs && nodeCrypto) {
    try {
      if (nodeFs.existsSync(filePath)) {
        const content = nodeFs.readFileSync(filePath);
        return nodeCrypto.createHash('sha256').update(content).digest('hex');
      }
    } catch {
      // Fallback
    }
  }
  return '';
};

export const computeContentSha256 = (content: string | Buffer): string => {
  const nodeCrypto = getNodeBuiltin('node:crypto') || getNodeBuiltin('crypto');
  if (nodeCrypto) {
    try {
      return nodeCrypto.createHash('sha256').update(content).digest('hex');
    } catch {
      // Fallback
    }
  }
  const str = typeof content === 'string' ? content : content.toString('utf-8');
  return contentHash(str).replace(/^sha256:/, '');
};

export const createNotRunActivity = (
  activity: VerificationActivity,
  reason: string,
): ActivityEvidence => ({
  activity,
  status: 'NOT_RUN',
  summary: reason,
  command: null,
  details: null,
});

export const createNotApplicableActivity = (
  activity: VerificationActivity,
  reason: string,
): ActivityEvidence => ({
  activity,
  status: 'NOT_APPLICABLE',
  summary: reason,
  command: null,
  details: null,
});
