/**
 * Command and Transaction Result Types with explicit Type Resolution failure actions.
 * Global constraint: Unknown types return TYPE_NOT_FOUND, candidates, and an explicit CreateNewType action.
 */

export interface CreateNewTypeAction {
  actionKind: 'CreateNewType';
  suggestedName: string;
  suggestedMetaclass?: string;
  targetNamespace?: string[];
  targetOwnerId?: string | null;
}

export interface TypeCandidate {
  id: string;
  name: string;
  qualifiedName: string;
  metaclass: string;
  score: number;
}

export interface TypeNotFoundResult {
  success: false;
  code: 'TYPE_NOT_FOUND';
  searchedType: string;
  message: string;
  candidates: TypeCandidate[];
  action: CreateNewTypeAction;
}

export interface CommandSuccessResult<T = unknown> {
  success: true;
  data?: T;
  revision: number;
  diagnostics?: unknown[];
}

export interface CommandFailureResult {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}

export type CommandResult<T = unknown> =
  | CommandSuccessResult<T>
  | CommandFailureResult
  | TypeNotFoundResult;

export function isTypeNotFound(result: unknown): result is TypeNotFoundResult {
  return typeof result === 'object' && result !== null && (result as TypeNotFoundResult).code === 'TYPE_NOT_FOUND';
}
