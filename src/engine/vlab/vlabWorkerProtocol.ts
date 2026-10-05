import type { Node, Edge } from '@xyflow/react';
import type { SolverConfiguration } from './kernel/types';

export type VLabWorkerRequest = {
  requestId: number;
  nodes: Node[];
  edges: Edge[];
  configuration: SolverConfiguration;
  previousState: any;
  dt: number;
};

export type VLabWorkerResponse = {
  requestId: number;
  state?: any;
  error?: string;
};
