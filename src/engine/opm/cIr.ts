/**
 * Embedded-C Intermediate Representation (IR) for OPM code generation.
 *
 * Guarantees:
 * - Every lvalue uses the resolved (validated) C identifier; raw editor
 *   stable ids never reach generated C.
 * - Integer / float operations are type-correct: float literals carry the
 *   `f` suffix, mixed int/float operands promote via explicit `(float)`
 *   casts, float modulo uses `fmodf`, float abs uses `fabsf`.
 * - Division / modulo render as checked helpers when an `ok` flag variable
 *   is supplied, so a zero divisor reports failure instead of committing
 *   a fabricated zero.
 */

import type { OpmScalarType } from './executableTypes';
import type { TypedExpressionIr } from './expressionCompiler';
import type { CompiledOpmAssignment } from './executableTypes';

export type CType =
  | 'bool'
  | 'int32_t'
  | 'uint32_t'
  | 'float'
  | 'void'
  | { kind: 'enum'; name: string }
  | { kind: 'struct'; name: string };

export function mapScalarToCType(type: OpmScalarType, enums: readonly { id: string; cIdentifier: string }[]): string {
  switch (type.kind) {
    case 'bool': return 'bool';
    case 'int32': return 'int32_t';
    case 'uint32': return 'uint32_t';
    case 'float32': return 'float';
    case 'enum': {
      const en = enums.find(e => e.id === type.enumId);
      return en ? en.cIdentifier : 'uint32_t';
    }
  }
}

const SAFE_C_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True only for identifiers that are safe to emit verbatim into C. */
export function isSafeCIdentifier(name: unknown): name is string {
  return typeof name === 'string' && SAFE_C_IDENTIFIER.test(name);
}

/**
 * Sanitize arbitrary editor text for use inside a C comment.
 * Strips comment terminators, control characters and newlines so raw
 * labels can never break out of a comment or inject tokens.
 */
export function sanitizeCComment(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let out = raw.replace(/\*\//g, '* /').replace(/\/\*/g, '/ *');
  out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
  out = out.replace(/[\r\n]+/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length > 80) out = out.slice(0, 80);
  return out;
}

/**
 * Resolve the validated C lvalue target for an assignment.
 * Raw `targetAttributeId` (stable editor id, may contain dashes or hostile
 * text) is never returned; only `resolvedTargetCIdentifier` is used.
 */
export function resolveAssignmentLvalue(
  assignment: Pick<CompiledOpmAssignment, 'resolvedTargetCIdentifier' | 'targetAttributeId'>,
): string {
  const resolved = assignment.resolvedTargetCIdentifier;
  if (isSafeCIdentifier(resolved)) return resolved;
  return '';
}

/** Render `instance-><resolved>`; falls back to a safe sentinel, never raw id. */
export function renderLValue(
  assignment: Pick<CompiledOpmAssignment, 'resolvedTargetCIdentifier' | 'targetAttributeId'>,
  instanceExpr = 'instance',
): string {
  const target = resolveAssignmentLvalue(assignment);
  if (target === '') return `${instanceExpr}->_invalid_target`;
  return `${instanceExpr}->${target}`;
}

/** Canonical init literal for a typed attribute (no raw strings leak). */
export function renderInitLiteral(
  type: OpmScalarType,
  initialValue: unknown,
  enums: readonly { id: string; members: readonly { id: string; cIdentifier: string }[]; cIdentifier: string }[],
): string {
  if (type.kind === 'bool') {
    return initialValue ? 'true' : 'false';
  }
  if (type.kind === 'float32') {
    const n = typeof initialValue === 'number' && Number.isFinite(initialValue) ? initialValue : 0;
    const s = String(n);
    return s.includes('.') || s.includes('e') || s.includes('E') ? `${s}f` : `${s}.0f`;
  }
  if (type.kind === 'int32') {
    const n = typeof initialValue === 'number' && Number.isFinite(initialValue) ? Math.trunc(initialValue) : 0;
    const clamped = Math.max(-2147483648, Math.min(2147483647, n));
    return String(clamped);
  }
  if (type.kind === 'uint32') {
    const n = typeof initialValue === 'number' && Number.isFinite(initialValue) ? Math.trunc(initialValue) : 0;
    const clamped = Math.max(0, Math.min(4294967295, n));
    return `${clamped}U`;
  }
  // enum
  const enumId = (type as { kind: 'enum'; enumId: string }).enumId;
  const en = enums.find(e => (e as { id: string }).id === enumId);
  if (typeof initialValue === 'object' && initialValue !== null) {
    const cand = initialValue as { memberId?: string; cIdentifier?: string };
    const mem = (en?.members ?? []).find(
      m => m.id === cand.memberId || m.cIdentifier === cand.cIdentifier,
    );
    if (mem && isSafeCIdentifier(mem.cIdentifier)) return mem.cIdentifier;
  }
  if (typeof initialValue === 'string' && en) {
    const mem = (en.members ?? []).find(m => m.id === initialValue || m.cIdentifier === initialValue);
    if (mem && isSafeCIdentifier(mem.cIdentifier)) return mem.cIdentifier;
  }
  const first = en?.members?.[0];
  if (first && isSafeCIdentifier(first.cIdentifier)) return first.cIdentifier;
  return '0U';
}

export function renderFloatLiteralC(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = String(v);
  return s.includes('.') || s.includes('e') || s.includes('E') ? `${s}f` : `${s}.0f`;
}

function renderFloatLiteral(n: number): string {
  return renderFloatLiteralC(n);
}

function wrapFloat(expr: string, alreadyFloat: boolean): string {
  return alreadyFloat ? expr : `(float)(${expr})`;
}

export function renderCExpression(
  ir: TypedExpressionIr,
  instanceExpr = 'instance',
  okVar?: string,
  enumMemberCIdentifiers?: ReadonlySet<string> | readonly string[],
): string {
  if (ir.kind === 'literal') {
    if (ir.type.kind === 'bool') {
      return ir.value ? 'true' : 'false';
    }
    if (ir.type.kind === 'float32') {
      return renderFloatLiteral(Number(ir.value));
    }
    if (ir.type.kind === 'enum') {
      // Enum literals must be validated identifiers; raw editor text never
      // reaches C verbatim (fail-closed to 0U).
      if (typeof ir.value === 'string') {
        return isSafeCIdentifier(ir.value) ? ir.value : '0U';
      }
      return String(Math.trunc(Number(ir.value) ?? 0));
    }
    // int32 / uint32: plain decimal, uint gets U suffix when non-negative domain
    if (ir.type.kind === 'uint32') {
      const n = Math.trunc(Number(ir.value));
      return `${Math.max(0, n)}U`;
    }
    return String(Math.trunc(Number(ir.value)));
  }

  if (ir.kind === 'reference') {
    const id = isSafeCIdentifier(ir.cIdentifier) ? ir.cIdentifier : '_invalid_ref';
    // Enum members are compile-time constants, not instance fields.
    if (enumMemberCIdentifiers !== undefined) {
      const isEnumMember = Array.isArray(enumMemberCIdentifiers)
        ? (enumMemberCIdentifiers as readonly string[]).includes(id)
        : (enumMemberCIdentifiers as ReadonlySet<string>).has(id);
      if (isEnumMember) return id;
    }
    return `${instanceExpr}->${id}`;
  }

  if (ir.kind === 'unary') {
    const inner = renderCExpression(ir.operand, instanceExpr, okVar, enumMemberCIdentifiers);
    if (ir.op === 'not') return `(!(${inner}))`;
    if (ir.op === 'negate') {
      if (ir.type.kind === 'float32' && ir.operand.type.kind !== 'float32') {
        return `(-(float)(${inner}))`;
      }
      return `(-(${inner}))`;
    }
    // plus
    if (ir.type.kind === 'float32' && ir.operand.type.kind !== 'float32') {
      return `((float)(${inner}))`;
    }
    return `(+(${inner}))`;
  }

  if (ir.kind === 'binary') {
    const leftS = renderCExpression(ir.left, instanceExpr, okVar, enumMemberCIdentifiers);
    const rightS = renderCExpression(ir.right, instanceExpr, okVar, enumMemberCIdentifiers);
    const resultFloat = ir.type.kind === 'float32';
    const leftFloat = ir.left.type.kind === 'float32';
    const rightFloat = ir.right.type.kind === 'float32';

    const floatBin = (op: string): string =>
      `(${wrapFloat(leftS, leftFloat)} ${op} ${wrapFloat(rightS, rightFloat)})`;

    switch (ir.op) {
      case 'add': return resultFloat ? floatBin('+') : `(${leftS} + ${rightS})`;
      case 'subtract': return resultFloat ? floatBin('-') : `(${leftS} - ${rightS})`;
      case 'multiply': return resultFloat ? floatBin('*') : `(${leftS} * ${rightS})`;
      case 'divide': {
        if (okVar) {
          const helper =
            ir.type.kind === 'float32' ? 'OPM_CheckedDivF32'
            : ir.type.kind === 'uint32' ? 'OPM_CheckedDivU32'
            : 'OPM_CheckedDivI32';
          if (resultFloat) {
            return `${helper}(${wrapFloat(leftS, leftFloat)}, ${wrapFloat(rightS, rightFloat)}, &(${okVar}))`;
          }
          return `${helper}(${leftS}, ${rightS}, &(${okVar}))`;
        }
        return resultFloat ? floatBin('/') : `(${leftS} / ${rightS})`;
      }
      case 'modulo': {
        if (resultFloat || leftFloat || rightFloat) {
          const l = wrapFloat(leftS, leftFloat);
          const r = wrapFloat(rightS, rightFloat);
          if (okVar) return `OPM_CheckedModF32(${l}, ${r}, &(${okVar}))`;
          return `(fmodf(${l}, ${r}))`;
        }
        if (okVar) {
          const helper = ir.type.kind === 'uint32' ? 'OPM_CheckedModU32' : 'OPM_CheckedModI32';
          return `${helper}(${leftS}, ${rightS}, &(${okVar}))`;
        }
        return `(${leftS} % ${rightS})`;
      }
      case 'and': return `(${leftS} && ${rightS})`;
      case 'or': return `(${leftS} || ${rightS})`;
      case 'equal': return `(${leftS} == ${rightS})`;
      case 'notEqual': return `(${leftS} != ${rightS})`;
      case 'lessThan':
      case 'lessEqual':
      case 'greaterThan':
      case 'greaterEqual': {
        const opStr =
          ir.op === 'lessThan' ? '<' : ir.op === 'lessEqual' ? '<='
          : ir.op === 'greaterThan' ? '>' : '>=';
        const eitherFloat = leftFloat || rightFloat;
        if (eitherFloat) {
          return `(${wrapFloat(leftS, leftFloat)} ${opStr} ${wrapFloat(rightS, rightFloat)})`;
        }
        return `(${leftS} ${opStr} ${rightS})`;
      }
    }
    return '0';
  }

  if (ir.kind === 'intrinsic') {
    const renderedArgs = ir.args.map(a => renderCExpression(a, instanceExpr, okVar, enumMemberCIdentifiers));
    const resultFloat = ir.type.kind === 'float32';
    const castIfNeeded = (expr: string, idx: number): string => {
      const argFloat = ir.args[idx].type.kind === 'float32';
      return resultFloat && !argFloat ? `(float)(${expr})` : expr;
    };
    if (ir.name === 'abs') {
      const a0 = castIfNeeded(renderedArgs[0], 0);
      return resultFloat ? `(fabsf(${a0}))` : `(abs(${renderedArgs[0]}))`;
    }
    if (ir.name === 'min') {
      const a0 = castIfNeeded(renderedArgs[0], 0);
      const a1 = castIfNeeded(renderedArgs[1], 1);
      return `((${a0} < ${a1}) ? ${a0} : ${a1})`;
    }
    if (ir.name === 'max') {
      const a0 = castIfNeeded(renderedArgs[0], 0);
      const a1 = castIfNeeded(renderedArgs[1], 1);
      return `((${a0} > ${a1}) ? ${a0} : ${a1})`;
    }
    if (ir.name === 'clamp') {
      const a0 = castIfNeeded(renderedArgs[0], 0);
      const a1 = castIfNeeded(renderedArgs[1], 1);
      const a2 = castIfNeeded(renderedArgs[2], 2);
      return `((${a0} < ${a1}) ? ${a1} : ((${a0} > ${a2}) ? ${a2} : ${a0}))`;
    }
  }

  return '0';
}
