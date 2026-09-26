import type {
  ModelExplorerAdapter,
  ModelExplorerCommand,
  ExplorerCommandResult,
  ExplorerImpact,
} from './modelExplorerTypes';

export interface ModelExplorerCommandBus {
  dispatch(command: ModelExplorerCommand): ExplorerCommandResult;
  confirm(command: ModelExplorerCommand, impactHash: string): ExplorerCommandResult;
}

export function hasMaterialImpact(impact?: ExplorerImpact): boolean {
  if (!impact) return false;
  return impact.descendants.length > 0
    || impact.relationships.length > 0
    || impact.presentations.length > 0
    || impact.invalidated.length > 0;
}

export function isPreflightClear(result: ExplorerCommandResult): boolean {
  return !result.diagnostics.some(item => item.severity === 'error')
    && !hasMaterialImpact(result.impact);
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
