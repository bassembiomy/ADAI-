export interface EquationContext {
  dt: number;
  time: number;
  parameters: Record<string, any>;
  prevStates: number[];
}
