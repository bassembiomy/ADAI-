// WP-17/18a: simulation scenario model. Contract: plan §7.5
import type { SimEngine } from './simSession';
import type { SimStimulus } from './simCriterion';

export interface SimSignalRef { alias: string; target: string }
export type SimTemporal =
  | { kind: 'always' | 'never' | 'eventually'; window?: [number, number] }
  | { kind: 'response'; trigger: string; within: number; window?: [number, number] };
export interface SimAssertion { id: string; requirementId: string; name?: string; condition: string; temporal: SimTemporal }
/** observable target -> drivable target of ANOTHER engine */
export interface SimCoupling { from: string; to: string }
export interface SimScenario {
  id: string; verificationCaseId: string; duration: number; step: number;
  order?: SimEngine[]; signals: SimSignalRef[]; stimuli: SimStimulus[]; couplings: SimCoupling[]; assertions: SimAssertion[];
}
