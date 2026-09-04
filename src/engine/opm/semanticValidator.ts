/**
 * Semantic validation and graph/scheduling analysis for executable OPM models.
 */

import type {
  OpmCompilationInput,
  OpmDiagnostic,
  OpmSourceRef,
} from './executableTypes';
import { compileOpmExpression, type OpmExpressionScope, type OpmValueSymbol } from './expressionCompiler';
import { validateOpmConnectionContract } from '../../components/entropy/OpmLinkRules';

export function validateExecutableOpm(
  input: OpmCompilationInput,
  initialDiagnostics: OpmDiagnostic[] = [],
): OpmDiagnostic[] {
  const diagnostics: OpmDiagnostic[] = [...initialDiagnostics];

  function makeDiagnostic(
    code: string,
    severity: 'error' | 'warning',
    message: string,
    source: OpmSourceRef,
  ): void {
    diagnostics.push({ code, severity, message, source });
  }

  function alreadyReported(code: string, elementId: string, propertyPath: string): boolean {
    return diagnostics.some(
      d => d.code === code && d.source.elementId === elementId && d.source.propertyPath === propertyPath,
    );
  }

  // Single documented behavior: unknown assignment *targets* always report
  // OPM_ASSIGNMENT_TARGET_UNKNOWN (blocking). OPM_EXPR_UNKNOWN_REFERENCE is
  // reserved for unknown symbols *inside* expression text (expressionCompiler)
  // and is never emitted for target ids, so no duplicate code is produced.
  function reportUnknownAssignmentTarget(ownerId: string, path: string, targetId: string): void {
    if (!alreadyReported('OPM_ASSIGNMENT_TARGET_UNKNOWN', ownerId, `${path}.targetAttributeId`)) {
      makeDiagnostic(
        'OPM_ASSIGNMENT_TARGET_UNKNOWN',
        'error',
        `Assignment targets unknown attribute "${targetId}".`,
        { elementId: ownerId, propertyPath: `${path}.targetAttributeId` },
      );
    }
  }

  // Resolve node kinds for the shared connection contract.
  const nodeKindById = new Map<string, string>();
  for (const obj of input.objects) nodeKindById.set(obj.id, 'object');
  for (const proc of input.processes) nodeKindById.set(proc.id, 'process');
  for (const st of input.states) nodeKindById.set(st.id, 'state');

  // Shared connection validation: every link direction is checked against
  // the production contract used by the canvas. Structural requirement
  // links always validate but never enter executable scheduling tables.
  for (const link of input.links) {
    if (['aggregation', 'generalization', 'exhibition', 'satisfies', 'verifies'].includes(link.type)) continue;
    const srcKind = nodeKindById.get(link.sourceId);
    const tgtKind = nodeKindById.get(link.targetId);
    if (!srcKind || !tgtKind) continue;
    const verdict = validateOpmConnectionContract(srcKind, tgtKind, link.type);
    if (!verdict.valid && !alreadyReported(verdict.code || 'OPM_INVALID_LINK_DIRECTION', link.id, 'source')) {
      makeDiagnostic(
        verdict.code || 'OPM_INVALID_LINK_DIRECTION',
        'error',
        verdict.reason || `Link "${link.id}" connects incompatible endpoints for type "${link.type}".`,
        { elementId: link.id, propertyPath: 'source' },
      );
    }
  }

  // Build expression scope from all object attributes
  const scopeSymbols: Record<string, OpmValueSymbol> = {};
  const attrMap = new Map<string, { attr: any; ownerObjectId: string }>();

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
        attrMap.set(attr.id, { attr, ownerObjectId: obj.id });
      }
    }
  }

  // Add enum members to scope
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
  const eventIds = new Set<string>(input.events.map(e => e.id));
  const stateById = new Map<string, typeof input.states[0]>();
  for (const st of input.states) {
    stateById.set(st.id, st);
  }

  // 1. Validate Objects & State initial/terminal properties
  for (const obj of input.objects) {
    if (obj.stateIds.length > 0) {
      const objStates = obj.stateIds.map(id => stateById.get(id)).filter(Boolean);
      const initialStates = objStates.filter(st => st!.isInitial || st!.execution?.initial);

      if (initialStates.length > 1) {
        makeDiagnostic(
          'OPM_STATE_MULTIPLE_INITIAL',
          'error',
          `Object "${obj.name}" has multiple initial states: ${initialStates.map(s => `"${s!.name}"`).join(', ')}.`,
          obj.source,
        );
      } else if (initialStates.length === 0 && (obj.execution?.enabled || objStates.some(s => s?.execution?.enabled))) {
        makeDiagnostic(
          'OPM_STATE_INITIAL_REQUIRED',
          'error',
          `Stateful object "${obj.name}" must have exactly one initial state.`,
          obj.source,
        );
      }
    }
  }

  // 2. Validate States (entry/exit assignments, timeout events).
  // Disabled state behavior is excluded from analysis.
  for (const st of input.states) {
    if (st.execution && st.execution.enabled !== false) {
      if (st.execution.timeoutEventId && !eventIds.has(st.execution.timeoutEventId)) {
        makeDiagnostic(
          'OPM_EVENT_UNKNOWN',
          'error',
          `State "${st.name}" timeout event "${st.execution.timeoutEventId}" is not defined in events table.`,
          { elementId: st.id, propertyPath: 'stateExecution.timeoutEventId' },
        );
      }

      const allAssignments = [
        ...(st.execution.entryAssignments || []).map((a, i) => ({ a, path: `stateExecution.entryAssignments[${i}]` })),
        ...(st.execution.exitAssignments || []).map((a, i) => ({ a, path: `stateExecution.exitAssignments[${i}]` })),
      ];

      for (const { a, path } of allAssignments) {
        // Disabled assignments are never scheduled and skip type-checking.
        if ((a as { enabled?: unknown }).enabled === false) continue;
        const targetId = a.targetAttributeId || (a as any).target;
        const targetInfo = attrMap.get(targetId);
        if (!targetInfo) {
          reportUnknownAssignmentTarget(st.id, path, String(targetId));
        } else if (targetInfo.attr.access === 'readOnly') {
          makeDiagnostic(
            'OPM_ASSIGNMENT_READONLY_TARGET',
            'error',
            `Assignment cannot write to read-only attribute "${targetInfo.attr.displayName || targetId}".`,
            { elementId: st.id, propertyPath: `${path}.targetAttributeId` },
          );
        }

        if (a.expression) {
          const compRes = compileOpmExpression(
            a.expression,
            targetInfo ? { kind: 'exact', type: targetInfo.attr.type } : { kind: 'anyScalar' },
            scope,
            { elementId: st.id, propertyPath: `${path}.expression` },
          );
          diagnostics.push(...compRes.diagnostics);
        }
      }
    }
  }

  // 3. Validate Processes. Disabled processes are dropped from compilation
  // and excluded from conflict analysis.
  const processWrites = new Map<string, { procId: string; priority: number }[]>();

  for (const proc of input.processes) {
    if (proc.execution && proc.execution.enabled !== false) {
      if (proc.execution.periodMs !== undefined && proc.execution.periodMs <= 0) {
        makeDiagnostic(
          'OPM_PROCESS_INVALID_PERIOD',
          'error',
          `Process "${proc.name}" periodMs must be strictly positive (> 0).`,
          { elementId: proc.id, propertyPath: 'processExecution.periodMs' },
        );
      }
      if (proc.execution.debounceMs < 0) {
        makeDiagnostic(
          'OPM_PROCESS_INVALID_DEBOUNCE',
          'error',
          `Process "${proc.name}" debounceMs must be non-negative.`,
          { elementId: proc.id, propertyPath: 'processExecution.debounceMs' },
        );
      }

      if (proc.execution.guard && proc.execution.guard.trim() !== '') {
        const guardRes = compileOpmExpression(
          proc.execution.guard,
          { kind: 'boolean' },
          scope,
          { elementId: proc.id, propertyPath: 'processExecution.guard' },
        );
        diagnostics.push(...guardRes.diagnostics);
      }

      if (proc.execution.assignments) {
        for (let i = 0; i < proc.execution.assignments.length; i++) {
          const a = proc.execution.assignments[i];
          // Disabled assignments are never scheduled and skip type-checking.
          if ((a as { enabled?: unknown }).enabled === false) continue;
          const path = `processExecution.assignments[${i}]`;
          const targetId = a.targetAttributeId || (a as any).target;
          const targetInfo = attrMap.get(targetId);

          if (!targetInfo) {
            reportUnknownAssignmentTarget(proc.id, path, String(targetId));
          } else {
            if (targetInfo.attr.access === 'readOnly') {
              makeDiagnostic(
                'OPM_ASSIGNMENT_READONLY_TARGET',
                'error',
                `Process "${proc.name}" cannot write to read-only attribute "${targetInfo.attr.displayName || targetId}".`,
                { elementId: proc.id, propertyPath: `${path}.targetAttributeId` },
              );
            }

            // Track write conflict
            const writes = processWrites.get(targetId) || [];
            writes.push({ procId: proc.id, priority: proc.execution.priority });
            processWrites.set(targetId, writes);
          }

          if (a.expression) {
            const compRes = compileOpmExpression(
              a.expression,
              targetInfo ? { kind: 'exact', type: targetInfo.attr.type } : { kind: 'anyScalar' },
              scope,
              { elementId: proc.id, propertyPath: `${path}.expression` },
            );
            diagnostics.push(...compRes.diagnostics);
          }
        }
      }
    }
  }

  // Check write conflicts: equal-priority writes to same attribute
  for (const [attrId, writes] of processWrites.entries()) {
    if (writes.length > 1) {
      const priorityCount = new Map<number, string[]>();
      for (const w of writes) {
        const list = priorityCount.get(w.priority) || [];
        list.push(w.procId);
        priorityCount.set(w.priority, list);
      }
      for (const [pri, procIds] of priorityCount.entries()) {
        if (procIds.length > 1) {
          for (const pid of procIds) {
            makeDiagnostic(
              'OPM_WRITE_CONFLICT',
              'error',
              `Write conflict: multiple processes (${procIds.join(', ')}) write to attribute "${attrId}" with equal priority ${pri}.`,
              { elementId: pid, propertyPath: 'processExecution.priority' },
            );
          }
        }
      }
    }
  }

  // 4. Validate Links & Transitions. Disabled link behavior is dropped from
  // compilation and confers no state reachability (matches pipeline dropping:
  // a disabled link carries no transition). Only enabled links populate
  // transitionsByObject liveness.
  const transitionsByObject = new Map<string, string[]>();

  for (const link of input.links) {
    const linkExec = link.execution;
    if (linkExec?.transition && linkExec.enabled !== false) {
      const trans = linkExec.transition;
      const targetState = stateById.get(trans.targetStateId);
      if (targetState && targetState.parentObjectId === trans.ownerObjectId) {
        const list = transitionsByObject.get(trans.ownerObjectId) || [];
        list.push(trans.targetStateId);
        transitionsByObject.set(trans.ownerObjectId, list);
      }
    }
    if (link.execution && link.execution.enabled !== false) {
      if (link.execution.eventId && !eventIds.has(link.execution.eventId)) {
        makeDiagnostic(
          'OPM_EVENT_UNKNOWN',
          'error',
          `Link "${link.id}" event "${link.execution.eventId}" is not defined in events table.`,
          { elementId: link.id, propertyPath: 'linkExecution.eventId' },
        );
      }

      if (link.execution.guard && link.execution.guard.trim() !== '') {
        const guardRes = compileOpmExpression(
          link.execution.guard,
          { kind: 'boolean' },
          scope,
          { elementId: link.id, propertyPath: 'linkExecution.guard' },
        );
        diagnostics.push(...guardRes.diagnostics);
      }

      if (link.execution.assignments) {
        for (let i = 0; i < link.execution.assignments.length; i++) {
          const a = link.execution.assignments[i];
          // Disabled assignments are never scheduled and skip type-checking.
          if ((a as { enabled?: unknown }).enabled === false) continue;
          const path = `linkExecution.assignments[${i}]`;
          const targetId = a.targetAttributeId || (a as any).target;
          const targetInfo = attrMap.get(targetId);

          if (!targetInfo) {
            reportUnknownAssignmentTarget(link.id, path, String(targetId));
          } else if (targetInfo.attr.access === 'readOnly') {
            makeDiagnostic(
              'OPM_ASSIGNMENT_READONLY_TARGET',
              'error',
              `Link "${link.id}" cannot write to read-only attribute "${targetInfo.attr.displayName || targetId}".`,
              { elementId: link.id, propertyPath: `${path}.targetAttributeId` },
            );
          }

          if (a.expression) {
            const compRes = compileOpmExpression(
              a.expression,
              targetInfo ? { kind: 'exact', type: targetInfo.attr.type } : { kind: 'anyScalar' },
              scope,
              { elementId: link.id, propertyPath: `${path}.expression` },
            );
            diagnostics.push(...compRes.diagnostics);
          }
        }
      }

      if (link.execution.transition) {
        const trans = link.execution.transition;
        const targetState = stateById.get(trans.targetStateId);

        if (!targetState) {
          makeDiagnostic(
            'OPM_TRANSITION_TARGET_UNKNOWN',
            'error',
            `Transition targets non-existent state "${trans.targetStateId}".`,
            { elementId: link.id, propertyPath: 'linkExecution.transition.targetStateId' },
          );
        } else if (targetState.parentObjectId !== trans.ownerObjectId) {
          makeDiagnostic(
            'OPM_TRANSITION_OWNER_MISMATCH',
            'error',
            `Transition target state "${targetState.name}" belongs to object "${targetState.parentObjectId}", not owner "${trans.ownerObjectId}".`,
            { elementId: link.id, propertyPath: 'linkExecution.transition.targetStateId' },
          );
        }

        if (trans.sourceStateId) {
          const srcState = stateById.get(trans.sourceStateId);
          if (!srcState) {
            makeDiagnostic(
              'OPM_TRANSITION_SOURCE_UNKNOWN',
              'error',
              `Transition source state "${trans.sourceStateId}" does not exist.`,
              { elementId: link.id, propertyPath: 'linkExecution.transition.sourceStateId' },
            );
          } else if (srcState.parentObjectId !== trans.ownerObjectId) {
            makeDiagnostic(
              'OPM_TRANSITION_OWNER_MISMATCH',
              'error',
              `Transition source state "${srcState.name}" belongs to object "${srcState.parentObjectId}", not owner "${trans.ownerObjectId}".`,
              { elementId: link.id, propertyPath: 'linkExecution.transition.sourceStateId' },
            );
          }
        }
      }
    }
  }

  // 4b. Capacity validation: enabled staged writes and transitions must fit
  // the configured bounds. Disabled behavior is never scheduled.
  {
    let enabledWriteCount = 0;
    let enabledTransitionCount = 0;
    for (const st of input.states) {
      if (st.execution && st.execution.enabled !== false) {
        for (const a of [...(st.execution.entryAssignments || []), ...(st.execution.exitAssignments || [])]) {
          if ((a as { enabled?: unknown }).enabled !== false) enabledWriteCount++;
        }
      }
    }
    for (const proc of input.processes) {
      if (proc.execution && proc.execution.enabled !== false) {
        for (const a of proc.execution.assignments || []) {
          if ((a as { enabled?: unknown }).enabled !== false) enabledWriteCount++;
        }
      }
    }
    for (const link of input.links) {
      if (link.execution && link.execution.enabled !== false) {
        for (const a of link.execution.assignments || []) {
          if ((a as { enabled?: unknown }).enabled !== false) enabledWriteCount++;
        }
        if (link.execution.transition) enabledTransitionCount++;
      }
    }
    if (Number.isFinite(input.settings.maxStagedWrites) && enabledWriteCount > input.settings.maxStagedWrites) {
      makeDiagnostic(
        'OPM_CAPACITY_EXCEEDED',
        'error',
        `Enabled staged writes (${enabledWriteCount}) exceed maxStagedWrites (${input.settings.maxStagedWrites}).`,
        { elementId: 'settings', propertyPath: 'settings.maxStagedWrites' },
      );
    }
    if (Number.isFinite(input.settings.maxTransitions) && enabledTransitionCount > input.settings.maxTransitions) {
      makeDiagnostic(
        'OPM_CAPACITY_EXCEEDED',
        'error',
        `Enabled transitions (${enabledTransitionCount}) exceed maxTransitions (${input.settings.maxTransitions}).`,
        { elementId: 'settings', propertyPath: 'settings.maxTransitions' },
      );
    }
  }

  // 5. State Reachability Check
  for (const obj of input.objects) {
    if (obj.stateIds.length > 0 && (obj.execution?.enabled || obj.stateIds.some(id => stateById.get(id)?.execution?.enabled))) {
      const objStates = obj.stateIds.map(id => stateById.get(id)).filter(Boolean);
      const reachableStates = new Set<string>();

      // Initial states are reachable
      for (const st of objStates) {
        if (st!.isInitial || st!.execution?.initial) {
          reachableStates.add(st!.id);
        }
      }

      // Transition targets are reachable
      const transitioned = transitionsByObject.get(obj.id) || [];
      for (const t of transitioned) {
        reachableStates.add(t);
      }

      // Check all non-initial states
      for (const st of objStates) {
        if (!reachableStates.has(st!.id)) {
          makeDiagnostic(
            'OPM_STATE_UNREACHABLE',
            'error',
            `State "${st!.name}" on object "${obj.name}" is unreachable from initial state(s).`,
            st!.source,
          );
        }
      }
    }
  }

  // Sort diagnostics deterministically
  diagnostics.sort((a, b) => {
    if (a.source.elementId !== b.source.elementId) {
      return a.source.elementId < b.source.elementId ? -1 : 1;
    }
    if (a.source.propertyPath !== b.source.propertyPath) {
      return a.source.propertyPath < b.source.propertyPath ? -1 : 1;
    }
    const aStart = a.source.start ?? 0;
    const bStart = b.source.start ?? 0;
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });

  return diagnostics;
}

