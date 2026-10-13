/**
 * WP-31c (former WP-32): every structured V-Lab diagnostic as ONE typed, serializable record that can cross the worker boundary
 * (structured clone) and be rendered by the UI (WP-40): {code, message, blockId, blockIds, portId, details, items}.
 *
 * An Error instance does not survive postMessage (its class, its diagnostics array and every field are lost, only the message
 * would remain), so the worker serializes with `serializeVLabError` and the client rebuilds a VLabWorkerError carrying the same record.
 * `items` has one entry per underlying diagnostic (a topology error can report many problems); the top level mirrors the first.
 */
import { TopologyValidationError } from './vlabTopologyValidation';
import { DAEStructureError } from './vlabStructure';
import { BlockEquationError, NonFiniteResidualError, SingularMatrixError, SolverConvergenceError, VLabCancelledError, VLabSolverDiagnosticError } from './vlabResidualDiagnostics';
import { ScopeReadError } from './vlabScopeRead';
import { VLabParamError } from './vlabParams';
import { PortWidthMismatchError } from './vlabVectorPorts';
import { MultibodyConstraintDiagnosticError } from './vlabConstraintDiagnostics';

export type VLabDiagnosticCode =
  | 'TOPOLOGY' | 'PORT_WIDTH' | 'DAE_STRUCTURE' | 'NON_FINITE_RESIDUAL' | 'BLOCK_EQUATION' | 'SCOPE_READ' | 'SOLVER'
  | 'PARAM' | 'MULTIBODY_CONSTRAINT' | 'CANCELLED' | 'WORKER' | 'UNKNOWN';

/** One underlying diagnostic. `code` is the specific code of the source (e.g. 'width-mismatch', 'free-unknown', 'non-finite-residual'). */
export interface VLabDiagnosticItem {
  code: string;
  message: string;
  blockId?: string;
  portId?: string;
  details: Record<string, unknown>;
}

export interface VLabDiagnostic {
  code: VLabDiagnosticCode;
  /** the Error message (what the pre-WP-31c worker sent as the only information) */
  message: string;
  /** class name of the source error */
  name: string;
  blockId?: string;
  blockIds: string[];
  portId?: string;
  details: Record<string, unknown>;
  items: VLabDiagnosticItem[];
}

/** structured-clone-safe plain data: numbers (non-finite ones as strings), strings, booleans, null, arrays and plain objects, depth-limited */
export function toCloneable(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value === undefined ? undefined : null;
  switch (typeof value) {
    case 'number': return Number.isFinite(value) ? value : String(value);
    case 'string': case 'boolean': return value;
    case 'bigint': return value.toString();
    case 'function': case 'symbol': return undefined;
  }
  if (depth >= 5) return String(value);
  if (Array.isArray(value)) return value.slice(0, 200).map(v => toCloneable(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const c = toCloneable(v, depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return out;
}
const plain = (o: Record<string, unknown>): Record<string, unknown> => toCloneable(o) as Record<string, unknown>;
const unique = (ids: (string | undefined)[]): string[] => [...new Set(ids.filter((s): s is string => typeof s === 'string' && s.length > 0))];

function build(code: VLabDiagnosticCode, error: Error, items: VLabDiagnosticItem[], details: Record<string, unknown> = {}): VLabDiagnostic {
  const first = items[0];
  return {
    code, message: error.message, name: error.name,
    blockId: first?.blockId, blockIds: unique(items.map(i => i.blockId)), portId: first?.portId,
    details: plain(details), items,
  };
}

/** Typed, structured-clone-safe record of any error the engine can throw. Never loses the message; never throws. */
export function serializeVLabError(error: unknown): VLabDiagnostic {
  if (!(error instanceof Error)) {
    const message = typeof error === 'string' ? error : (() => { try { return JSON.stringify(error); } catch { return String(error); } })() ?? String(error);
    return { code: 'UNKNOWN', message, name: 'NonError', blockIds: [], details: {}, items: [] };
  }
  if (error instanceof TopologyValidationError) {
    const items = error.diagnostics.map((d: any): VLabDiagnosticItem => ({
      code: d.code, message: d.reason, blockId: d.blockId, portId: d.portId,
      details: plain({
        expectedDomain: d.expectedDomain, actualDomain: d.actualDomain, otherBlockId: d.otherBlockId, otherPortId: d.otherPortId,
        param: d.param, raw: d.raw, expectedWidth: d.expectedWidth, actualWidth: d.actualWidth,
      }),
    }));
    const widthOnly = items.length > 0 && items.every(i => i.code === 'width-mismatch' || i.code === 'composite-mismatch');
    return build(widthOnly ? 'PORT_WIDTH' : 'TOPOLOGY', error, items, { problems: items.length });
  }
  if (error instanceof PortWidthMismatchError) {
    return build('PORT_WIDTH', error, error.diagnostics.map((d: any) => ({
      code: d.code ?? 'width-mismatch', message: d.reason, blockId: d.blockId, portId: d.portId,
      details: plain({ expectedWidth: d.expectedWidth, actualWidth: d.actualWidth, otherBlockId: d.otherBlockId, otherPortId: d.otherPortId }),
    })));
  }
  if (error instanceof DAEStructureError) {
    return build('DAE_STRUCTURE', error, error.diagnostics.map(d => ({
      code: d.code, message: d.reason, blockId: d.blockId,
      details: plain({ blockType: d.blockType, expectedRows: d.expectedRows, actualRows: d.actualRows, missingIndices: d.missingIndices }),
    })));
  }
  if (error instanceof NonFiniteResidualError || error instanceof BlockEquationError) {
    return build(error instanceof BlockEquationError ? 'BLOCK_EQUATION' : 'NON_FINITE_RESIDUAL', error, error.diagnostics.map(d => ({
      code: d.faultCode ?? d.kind, message: d.reason, blockId: d.blockId || undefined,
      details: plain({ blockType: d.blockType, rowIndex: d.rowIndex, variable: d.variable, value: d.value, error: d.error, kind: d.kind }),
    })), { recoverable: error.recoverable });
  }
  if (error instanceof ScopeReadError) {
    const d = error.diagnostic;
    return build('SCOPE_READ', error, [{
      code: d.code, message: d.reason, blockId: d.scopeId, details: plain({ channel: d.channel, variable: d.variable }),
    }]);
  }
  if (error instanceof VLabSolverDiagnosticError) {
    const d = error.diagnostic;
    const rows = d.worstResidualRows.map(r => ({
      code: 'worst-residual-row', message: `${r.blockId || '?'} (${r.blockType || '?'}) row ${r.row} [${r.variable}] = ${r.value}`, blockId: r.blockId || undefined,
      details: plain({ blockType: r.blockType, row: r.row, variable: r.variable, value: r.value }),
    }));
    const singular = (d.singularUnknowns ?? []).map(s => ({
      code: 'singular-unknown', message: `singular Newton matrix in ${s.variable}`, blockId: s.blockId || undefined, details: plain({ variable: s.variable }),
    }));
    return build('SOLVER', error, [...rows, ...singular], { time: d.time, h: d.h, reason: d.reason, blocks: d.blocks });
  }
  if (error instanceof SolverConvergenceError || error instanceof SingularMatrixError) {
    return build('SOLVER', error, [], error instanceof SolverConvergenceError
      ? { residualNorm: error.residualNorm, singular: error.singular } : { singular: error.pivots });
  }
  if (error instanceof VLabParamError) {
    return build('PARAM', error, error.diagnostics.map(d => ({
      code: d.code, message: d.reason, blockId: d.blockId || undefined, details: plain({ param: d.param, raw: d.raw }),
    })));
  }
  if (error instanceof MultibodyConstraintDiagnosticError) {
    return build('MULTIBODY_CONSTRAINT', error, [{
      code: error.code, message: error.message, blockId: error.blockId, details: plain({ frameNodeIds: error.frameNodeIds }),
    }]);
  }
  if (error instanceof VLabCancelledError) {
    return build('CANCELLED', error, [], { time: error.time, acceptedSteps: error.acceptedSteps });
  }
  return build('UNKNOWN', error, [], { stack: error.stack });
}
