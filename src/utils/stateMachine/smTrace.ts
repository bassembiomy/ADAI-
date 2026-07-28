export interface SemanticTraceFrame {
  sequence: number;
  elapsedMs: number;
  activeStateIds: string[];
  actions: string[];
  data: Record<string, number | boolean>;
  stateTimersMs: Record<string, number>;
  history: Record<string, string | null>;
  error: string | null;
}
