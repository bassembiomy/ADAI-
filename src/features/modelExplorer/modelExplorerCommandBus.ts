import type {
  ModelExplorerAdapter,
  ModelExplorerCommand,
  ExplorerCommandResult,
} from './modelExplorerTypes';

export interface ModelExplorerCommandBus {
  dispatch(command: ModelExplorerCommand): ExplorerCommandResult;
  confirm(command: ModelExplorerCommand, impactHash: string): ExplorerCommandResult;
}

export function isPreflightClear(result: ExplorerCommandResult): boolean {
  return !result.impact && !result.diagnostics.some(item => item.severity === 'error');
}

export function createModelExplorerCommandBus(adapter: ModelExplorerAdapter): ModelExplorerCommandBus {
  return {
    dispatch(command: ModelExplorerCommand): ExplorerCommandResult {
      const checked = adapter.preflight(command);
      return isPreflightClear(checked) ? adapter.execute(command) : checked;
    },
    confirm(command: ModelExplorerCommand, impactHash: string): ExplorerCommandResult {
      return adapter.execute({ ...command, confirmedImpactHash: impactHash } as ModelExplorerCommand);
    },
  };
}
