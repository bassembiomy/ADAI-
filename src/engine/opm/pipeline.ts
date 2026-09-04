/**
 * Executable OPM pipeline: normalization -> semantic validation -> typed compilation.
 */

import type {
  OpmEditorNode,
  OpmEditorEdge,
} from './editorBoundaryTypes';
import {
  createDefaultOpmExecutionConfig,
  type CompiledOpmAssignment,
  type CompiledOpmLink,
  type CompiledOpmProcess,
  type OpmAssignmentOperator,
  type OpmAttribute,
  type OpmDiagnostic,
  type OpmEnumDefinition,
  type OpmEventDefinition,
  type OpmExecutionConfig,
  type OpmSourceRef,
  type OpmSymbol,
  type OpmTargetSettings,
  type OpmTransitionRequest,
} from './executableTypes';
import { normalizeOpmModel } from './schemaAdapter';
import { validateExecutableOpm } from './semanticValidator';
import { computeModelFingerprint } from './canonicalHash';
import {
  compileOpmExpression,
  type OpmExpressionScope,
  type OpmValueSymbol,
  type TypedExpressionIr,
} from './expressionCompiler';

export type {
  CompiledOpmAssignment,
  CompiledOpmLink,
  CompiledOpmProcess,
} from './executableTypes';
export { computeModelFingerprint } from './canonicalHash';

export interface CompiledOpmObject {
  id: string;
  name: string;
  cIdentifier: string;
  physical: boolean;
  order: number;
  source: OpmSourceRef;
  attributes: readonly OpmAttribute[];
  stateIds: readonly string[];
  initialStateId?: string;
}

export interface CompiledOpmState {
  id: string;
  name: string;
  cIdentifier: string;
  parentObjectId: string;
  isInitial: boolean;
  isTerminal: boolean;
  order: number;
  source: OpmSourceRef;
  entryAssignments: readonly CompiledOpmAssignment[];
  exitAssignments: readonly CompiledOpmAssignment[];
  timeoutMs?: number;
  timeoutEventId?: string;
}

export interface ExecutableOpmModel {
  executionEnabled: boolean;
  fingerprint: string;
  settings: OpmTargetSettings;
  objects: readonly CompiledOpmObject[];
  states: readonly CompiledOpmState[];
  processes: readonly CompiledOpmProcess[];
  links: readonly CompiledOpmLink[];
  events: readonly OpmEventDefinition[];
  enums: readonly OpmEnumDefinition[];
  symbols: Readonly<Record<string, OpmSymbol>>;
  sourceByNormalizedId: Readonly<Record<string, OpmSourceRef>>;
}

export interface CompileOpmResult {
  model?: ExecutableOpmModel;
  diagnostics: OpmDiagnostic[];
}

export function compileExecutableOpm(
  nodes: OpmEditorNode[],
  edges: OpmEditorEdge[],
  config: OpmExecutionConfig | OpmTargetSettings = createDefaultOpmExecutionConfig(),
): CompileOpmResult {
  const normResult = normalizeOpmModel(nodes, edges, config);
  const diagnostics = validateExecutableOpm(normResult.input!, normResult.diagnostics);

  const hasErrors = diagnostics.some(d => d.severity === 'error');
  if (hasErrors || !normResult.input) {
    return { model: undefined, diagnostics };
  }

  const input = normResult.input;

  // Build expression scope
  const scopeSymbols: Record<string, OpmValueSymbol> = {};
  for (const obj of input.objects) {
    if (obj.execution?.attributes) {
      for (const attr of obj.execution.attributes) {
        const valSym: OpmValueSymbol = {
          id: attr.id,
          name: attr.displayName || attr.id,
          cIdentifier: attr.cIdentifier,
          type: attr.type,
          access: attr.access,
        };
        scopeSymbols[attr.id] = valSym;
        scopeSymbols[attr.cIdentifier] = valSym;
        if (attr.displayName) {
          scopeSymbols[attr.displayName] = valSym;
          scopeSymbols[`${obj.name}.${attr.displayName}`] = valSym;
        }
        scopeSymbols[`${obj.id}.${attr.id}`] = valSym;
        scopeSymbols[`${obj.cIdentifier}.${attr.cIdentifier}`] = valSym;
      }
    }
  }

  for (const en of input.enums) {
    for (const mem of en.members) {
      const memSym: OpmValueSymbol = {
        id: mem.id,
        name: mem.displayName || mem.id,
        cIdentifier: mem.cIdentifier,
        type: { kind: 'enum', enumId: en.id },
      };
      scopeSymbols[mem.id] = memSym;
      scopeSymbols[mem.cIdentifier] = memSym;
      scopeSymbols[`${en.id}.${mem.id}`] = memSym;
    }
  }

  const scope: OpmExpressionScope = { symbols: Object.freeze(scopeSymbols) };

  // Attribute symbol table: every assignment target must resolve through it.
  // Unknown targets block generation with OPM_ASSIGNMENT_TARGET_UNKNOWN;
  // raw editor ids are never copied into generated identifiers.
  const attributeCIdentifiers = new Map<string, string>();
  for (const obj of input.objects) {
    if (obj.execution?.attributes) {
      for (const attr of obj.execution.attributes) {
        attributeCIdentifiers.set(attr.id, attr.cIdentifier);
      }
    }
  }

  const compileDiagnostics: OpmDiagnostic[] = [];

  // Helper to compile assignment
  function compileAssignment(
    raw: any,
    idx: number,
    ownerId: string,
    prefixPath: string,
  ): CompiledOpmAssignment {
    const targetId = raw.targetAttributeId || raw.target;
    const targetSym = scopeSymbols[targetId];
    const resolvedTargetCIdentifier = attributeCIdentifiers.get(targetId);
    if (resolvedTargetCIdentifier === undefined) {
      compileDiagnostics.push({
        code: 'OPM_ASSIGNMENT_TARGET_UNKNOWN',
        severity: 'error',
        message: `Assignment targets unknown attribute "${targetId}".`,
        source: { elementId: ownerId, propertyPath: `${prefixPath}[${idx}].targetAttributeId` },
      });
    }
    const source: OpmSourceRef = { elementId: ownerId, propertyPath: `${prefixPath}[${idx}]` };
    const exprRes = compileOpmExpression(
      raw.expression,
      targetSym ? { kind: 'exact', type: targetSym.type } : { kind: 'anyScalar' },
      scope,
      { elementId: ownerId, propertyPath: `${prefixPath}[${idx}].expression` },
    );

    return Object.freeze({
      id: raw.id,
      targetAttributeId: targetId,
      // Sentinel: unknown targets block generation (error already emitted,
      // model discarded below), so no raw id may leak into identifiers.
      resolvedTargetCIdentifier: resolvedTargetCIdentifier ?? '',
      operator: raw.operator || '=',
      expressionText: raw.expression,
      expressionIr: exprRes.ir || ({
        kind: 'literal',
        type: { kind: 'int32' },
        value: 0,
      } as TypedExpressionIr),
      enabled: raw.enabled !== false,
      source,
    });
  }

  // Compile Objects
  const compiledObjects: CompiledOpmObject[] = input.objects.map(obj => {
    const initialSt = input.states.find(s => s.parentObjectId === obj.id && (s.isInitial || s.execution?.initial));
    return Object.freeze({
      id: obj.id,
      name: obj.name,
      cIdentifier: obj.cIdentifier,
      physical: obj.physical,
      order: obj.order,
      source: obj.source,
      attributes: Object.freeze([...(obj.execution?.attributes || [])]),
      stateIds: Object.freeze([...obj.stateIds]),
      initialStateId: initialSt?.id,
    });
  });

  // Compile States
  const compiledStates: CompiledOpmState[] = input.states.map(st => {
    const entryAssignments = (st.execution?.entryAssignments || []).map((a, i) =>
      compileAssignment(a, i, st.id, 'stateExecution.entryAssignments'),
    );
    const exitAssignments = (st.execution?.exitAssignments || []).map((a, i) =>
      compileAssignment(a, i, st.id, 'stateExecution.exitAssignments'),
    );

    return Object.freeze({
      id: st.id,
      name: st.name,
      cIdentifier: st.cIdentifier,
      parentObjectId: st.parentObjectId,
      isInitial: st.isInitial || Boolean(st.execution?.initial),
      isTerminal: Boolean(st.execution?.terminal),
      order: st.order,
      source: st.source,
      entryAssignments: Object.freeze(entryAssignments),
      exitAssignments: Object.freeze(exitAssignments),
      timeoutMs: st.execution?.timeoutMs,
      timeoutEventId: st.execution?.timeoutEventId,
    });
  });

  // Compile Processes. Disabled processes are dropped from compilation.
  const compiledProcesses: CompiledOpmProcess[] = input.processes
    .filter(proc => proc.execution?.enabled !== false)
    .map(proc => {
    let guardIr: TypedExpressionIr | undefined;
    if (proc.execution?.guard && proc.execution.guard.trim() !== '') {
      const gRes = compileOpmExpression(
        proc.execution.guard,
        { kind: 'boolean' },
        scope,
        { elementId: proc.id, propertyPath: 'processExecution.guard' },
      );
      guardIr = gRes.ir;
    }

    const assignments = (proc.execution?.assignments || []).map((a, i) =>
      compileAssignment(a, i, proc.id, 'processExecution.assignments'),
    );

    return Object.freeze({
      enabled: proc.execution?.enabled !== false,
      id: proc.id,
      name: proc.name,
      cIdentifier: proc.cIdentifier,
      physical: proc.physical,
      order: proc.order,
      source: proc.source,
      activation: proc.execution?.activation || 'cyclic',
      inputAttributeIds: Object.freeze([...(proc.execution?.inputAttributeIds || [])]),
      outputAttributeIds: Object.freeze([...(proc.execution?.outputAttributeIds || [])]),
      guardText: proc.execution?.guard || '',
      guardIr,
      assignments: Object.freeze(assignments),
      priority: proc.execution?.priority ?? 1,
      periodMs: proc.execution?.periodMs,
      debounceMs: proc.execution?.debounceMs ?? 0,
      reentrancy: proc.execution?.reentrancy || 'reject',
    });
  });

  // Compile Links. Disabled link behavior is dropped: the link stays in the
  // table with its enabled flag but carries no guard, event, assignments,
  // or transition.
  const compiledLinks: CompiledOpmLink[] = input.links.map(link => {
    if (link.execution && link.execution.enabled === false) {
      return Object.freeze({
        enabled: false,
        id: link.id,
        type: link.type,
        sourceId: link.sourceId,
        targetId: link.targetId,
        order: link.order,
        source: link.source,
        guardText: '',
        guardIr: undefined,
        eventId: undefined,
        assignments: Object.freeze([]),
        transition: undefined,
        priority: link.execution.priority ?? 1,
        delayMs: link.execution.delayMs ?? 0,
      });
    }

    let guardIr: TypedExpressionIr | undefined;
    if (link.execution?.guard && link.execution.guard.trim() !== '') {
      const gRes = compileOpmExpression(
        link.execution.guard,
        { kind: 'boolean' },
        scope,
        { elementId: link.id, propertyPath: 'linkExecution.guard' },
      );
      guardIr = gRes.ir;
    }

    const assignments = (link.execution?.assignments || []).map((a, i) =>
      compileAssignment(a, i, link.id, 'linkExecution.assignments'),
    );

    return Object.freeze({
      enabled: link.execution?.enabled !== false,
      id: link.id,
      type: link.type,
      sourceId: link.sourceId,
      targetId: link.targetId,
      order: link.order,
      source: link.source,
      guardText: link.execution?.guard || '',
      guardIr,
      eventId: link.execution?.eventId,
      assignments: Object.freeze(assignments),
      transition: link.execution?.transition ? Object.freeze({ ...link.execution.transition }) : undefined,
      priority: link.execution?.priority ?? 1,
      delayMs: link.execution?.delayMs ?? 0,
    });
  });

  if (compileDiagnostics.some(d => d.severity === 'error')) {
    return { model: undefined, diagnostics: [...diagnostics, ...compileDiagnostics] };
  }

  const fingerprint = computeModelFingerprint({
    settings: input.settings,
    objects: compiledObjects,
    states: compiledStates,
    processes: compiledProcesses,
    links: compiledLinks,
    events: input.events,
    enums: input.enums,
  });

  const model: ExecutableOpmModel = Object.freeze({
    executionEnabled: input.executionEnabled,
    fingerprint,
    settings: input.settings,
    objects: Object.freeze(compiledObjects),
    states: Object.freeze(compiledStates),
    processes: Object.freeze(compiledProcesses),
    links: Object.freeze(compiledLinks),
    events: input.events,
    enums: input.enums,
    symbols: input.symbols,
    sourceByNormalizedId: input.sourceByNormalizedId,
  });

  return { model, diagnostics };
}

