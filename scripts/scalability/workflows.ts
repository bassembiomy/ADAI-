export type WorkflowName =
  | 'load'
  | 'rename'
  | 'property-edit'
  | 'create-delete'
  | 'tree-expand'
  | 'tree-search'
  | 'undo'
  | 'redo'
  | 'save-reopen';

export interface WorkflowSample {
  handlerMs?: number;
  settleMs?: number;
  heartbeatGapMs: number;
  longTasksMs: number[];
  durationMs?: number;
  paintDelayMs?: number;
  reactCommits?: Array<{ area: string; phase: string; durationMs: number }>;
}

export interface WorkflowResultData {
  samples: WorkflowSample[];
}

export type WorkflowsMap = Partial<Record<WorkflowName, WorkflowResultData>>;
