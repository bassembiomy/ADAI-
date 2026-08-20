import { Node, Edge } from 'reactflow';

export interface VLabProbe {
  id: string;
  sourceNodeId: string;
  sourceHandle: string;
  variableName: string;
  unit: string;
}

export interface VLabExcitation {
  type: 'step' | 'sine' | 'ramp' | 'pulse' | 'constant';
  sourceNodeId: string;
  amplitude: number;
  frequency?: number;
  offset?: number;
  startTime?: number;
}

export interface VLabTestBoundary {
  id: string;
  name: string;
  domain: 'electrical' | 'mechanical' | 'thermal' | 'fluid' | 'electromechanical' | 'signal';
  nodes: Node[];
  edges: Edge[];
  dt: number;
  totalTime: number;
  excitation: VLabExcitation;
  probes: VLabProbe[];
}

export interface SimulationTrajectory {
  time: number[];
  signals: Record<string, number[]>;
  finalState?: any;
}
