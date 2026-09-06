import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

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

export const computeFileSha256 = (filePath: string): string => {
  if (!existsSync(filePath)) {
    return '';
  }
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
};

export const computeContentSha256 = (content: string | Buffer): string => {
  return createHash('sha256').update(content).digest('hex');
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
