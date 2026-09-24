import type {
  ModelExplorerAdapter,
  ModelExplorerCommand,
  ExplorerCommandResult,
} from './modelExplorerTypes';

export interface ModelExplorerCommandBus {
  dispatch(command: ModelExplorerCommand): ExplorerCommandResult;
  confirm(command: ModelExplorerCommand, impactHash: string): ExplorerCommandResult;
}

export function createModelExplorerCommandBus(adapter: ModelExplorerAdapter): ModelExplorerCommandBus {
  return {
    dispatch(command: ModelExplorerCommand): ExplorerCommandResult {
      const checked = adapter.preflight(command);
      if (checked.diagnostics.some(d => d.severity === 'error') || checked.impact) {
        return checked;
      }
      return adapter.execute(command);
    },
    confirm(command: ModelExplorerCommand, impactHash: string): ExplorerCommandResult {
      return adapter.execute({ ...command, confirmedImpactHash: impactHash } as ModelExplorerCommand);
    },
  };
}
