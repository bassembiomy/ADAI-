import {
  ApprovedAction,
  ToolAdapter,
  ToolResult,
  InspectionResult
} from '../actionContracts';

export interface VLabSimulationRunner {
  runSimulation(params: Record<string, unknown>): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    stdout?: string;
  }>;
  getSimulationStatus?(): Promise<Record<string, unknown>>;
}

export class VLabAdapter implements ToolAdapter {
  constructor(private runner?: VLabSimulationRunner) {}

  public isAvailable(): boolean {
    return Boolean(this.runner);
  }

  public async inspect(params: Record<string, unknown>): Promise<InspectionResult> {
    if (this.runner?.getSimulationStatus) {
      const status = await this.runner.getSimulationStatus();
      return { success: true, data: status };
    }

    return {
      success: true,
      data: {
        workspace: 'vlab',
        simulatorAvailable: Boolean(this.runner),
        params
      }
    };
  }

  public async execute(action: ApprovedAction): Promise<ToolResult> {
    const startTime = Date.now();

    if (action.kind !== 'run_simulation') {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: `VLabAdapter only handles 'run_simulation', received '${action.kind}'`
      };
    }

    if (!this.runner) {
      // Truthful constraint: never fabricate numbers or claim success without a real simulator
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: 'No real simulator adapter configured: cannot execute simulation without active engine'
      };
    }

    try {
      const simResult = await this.runner.runSimulation(action.params);
      if (!simResult.success) {
        return {
          success: false,
          changedArtifacts: [],
          evidence: {},
          stdout: simResult.stdout,
          durationMs: Date.now() - startTime,
          error: simResult.error || 'Simulation execution failed in solver'
        };
      }

      return {
        success: true,
        changedArtifacts: ['vlab/simulation_results.json'],
        evidence: simResult.data || { completed: true },
        stdout: simResult.stdout,
        durationMs: Date.now() - startTime
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: `Simulation exception: ${msg}`
      };
    }
  }
}
