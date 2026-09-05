/**
 * React-free structural boundary types accepted from the editor adapter.
 *
 * AppNode and AppEdge from @xyflow/react are structurally assignable to
 * OpmEditorNode and OpmEditorEdge.
 */

import type {
  OpmObjectExecution,
  OpmStateExecution,
  OpmProcessExecution,
  OpmLinkExecution,
} from './executableTypes';

export type OpmEditorNodeType = 'object' | 'process' | 'state' | 'requirement';

export type OpmEditorLinkType =
  // Structural Links
  | 'aggregation'
  | 'exhibition'
  | 'generalization'
  // Procedural Links
  | 'agent'
  | 'instrument'
  | 'consumption'
  | 'result'
  | 'effect'
  | 'trigger'
  | 'condition'
  // Requirement traceability
  | 'satisfies'
  | 'verifies';

export interface OpmEditorState {
  id: string;
  name: string;
  isActive: boolean;
  isInitial?: boolean;
  value?: string;
}

export interface OpmEditorPort {
  id: string;
  name: string;
  type: string;
  direction: 'input' | 'output';
  position: 'left' | 'right' | 'top' | 'bottom';
  dataType?: string;
}

export interface OpmEditorNodeData extends Record<string, unknown> {
  name: string;
  type: OpmEditorNodeType;
  physical: boolean;
  states?: OpmEditorState[];
  attributes?: { key: string; value: string }[];
  requirementText?: string;
  isInitial?: boolean;
  parentId?: string | null;
  zoomedIn?: boolean;
  inputs?: OpmEditorPort[];
  outputs?: OpmEditorPort[];
  objectExecution?: OpmObjectExecution;
  stateExecution?: OpmStateExecution;
  processExecution?: OpmProcessExecution;
  [key: string]: unknown;
}

export interface OpmEditorEdgeData extends Record<string, unknown> {
  type?: OpmEditorLinkType;
  label?: string;
  conditionText?: string;
  isSimulating?: boolean;
  isActiveFlow?: boolean;
  linkExecution?: OpmLinkExecution;
  [key: string]: unknown;
}

export interface OpmEditorNode<TData = OpmEditorNodeData> {
  id: string;
  type?: string;
  position: { x: number; y: number };
  parentId?: string | null;
  data: TData;
  [key: string]: unknown;
}

export interface OpmEditorEdge<TData = OpmEditorEdgeData> {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: TData;
  [key: string]: unknown;
}

