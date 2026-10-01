import {
  ApprovedAction,
  ToolAdapter,
  ToolResult,
  InspectionResult
} from '../actionContracts';

export const ALLOWLISTED_EXECUTABLES = new Set([
  'node',
  'gcc',
  'clang',
  'make',
  'vitest',
  'npm',
  'npx',
  'tsx',
  'git'
]);

export interface ProcessExecutor {
  spawn(
    command: string,
    args: string[],
    options: { cwd: string; timeoutMs?: number }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export class LocalProcessAdapter implements ToolAdapter {
  constructor(private executor?: ProcessExecutor) {}

  public async inspect(params: Record<string, unknown>): Promise<InspectionResult> {
    return {
      success: true,
      data: {
        allowlistedExecutables: Array.from(ALLOWLISTED_EXECUTABLES),
        executorConfigured: Boolean(this.executor),
        params
      }
    };
  }

  public async execute(action: ApprovedAction): Promise<ToolResult> {
    const startTime = Date.now();

    if (action.kind !== 'generate_code' && action.kind !== 'run_tests') {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: `LocalProcessAdapter does not handle action kind '${action.kind}'`
      };
    }

    const command = String(action.params.command || '');
    const args = Array.isArray(action.params.args) ? (action.params.args as string[]) : [];
    const cwd = String(action.params.cwd || process.cwd());
    const timeoutMs = Number(action.params.timeoutMs || 30000);

    // Security Gate: Reject unallowlisted executables
    const baseCommand = command.replace(/^.*[\\/]/, '').toLowerCase();
    if (!ALLOWLISTED_EXECUTABLES.has(baseCommand)) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: `Execution of binary '${baseCommand}' is rejected: not on the allowlist (${Array.from(ALLOWLISTED_EXECUTABLES).join(', ')})`
      };
    }

    // Security Gate: Never allow shell strings / interpolation
    if (typeof action.params.args === 'string') {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: 'Execution with shell string is forbidden. Must provide explicit argument array.'
      };
    }

    if (!this.executor) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: 'No process executor configured'
      };
    }

    try {
      const res = await this.executor.spawn(command, args, { cwd, timeoutMs });
      const success = res.exitCode === 0;

      return {
        success,
        changedArtifacts: action.params.expectedArtifacts ? (action.params.expectedArtifacts as string[]) : [],
        evidence: {
          exitCode: res.exitCode,
          command,
          args,
          cwd
        },
        stdout: res.stdout,
        stderr: res.stderr,
        durationMs: Date.now() - startTime,
        error: success ? undefined : `Process exited with code ${res.exitCode}: ${res.stderr || res.stdout}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: `Process execution exception: ${msg}`
      };
    }
  }
}
