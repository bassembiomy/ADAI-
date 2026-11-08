import { evaluateParameter, type ParameterKind } from '../../engine/xbridges/parameterEvaluation';
import { XB_PARAMETER_SCHEMA } from '../../engine/xbridges/parameterSchema';
import type { ModelDiagnostic } from './smModel';
import type { XBParameterValue, XBPersistedModelV1 } from './xbModel';

/**
 * Embedded code generation evaluates numeric parameter text (MATLAB expressions such as `2*pi` or `[1 2 3]`) once, with the
 * evaluator the simulation uses, so the interpreter and the generated C see the same numbers. Text that is empty or is not a
 * valid expression is XB_PARAMETER_INVALID; range and integer rules stay with the block-specific embedded checks.
 */
export const resolveXBParameterExpressions = (
  model: XBPersistedModelV1,
): { model: XBPersistedModelV1; diagnostics: ModelDiagnostic[] } => {
  const diagnostics: ModelDiagnostic[] = [];
  let changed = false;
  const nodes = model.nodes.map((node) => {
    const kinds = (XB_PARAMETER_SCHEMA as Record<string, Record<string, ParameterKind>>)[node.type];
    if (!kinds) return node;
    let parameters: Record<string, XBParameterValue> | null = null;
    for (const [name, kind] of Object.entries(kinds)) {
      const raw = (node.parameters as Record<string, XBParameterValue | undefined>)[name];
      if (typeof raw !== 'string' || kind.kind === 'option') continue;
      const result = evaluateParameter(raw, kind);
      if (!result.ok) {
        if (result.code === 'PARAMETER_EMPTY' || result.code === 'PARAMETER_INVALID') {
          diagnostics.push({
            severity: 'error',
            code: 'XB_PARAMETER_INVALID',
            message: `Block '${node.id}' (${node.type}) parameter '${name}' = ${JSON.stringify(raw)} is not a valid value: ${result.reason}`,
            elementId: node.id,
          });
        }
        continue;
      }
      if (result.value === raw) continue;
      parameters ??= { ...(node.parameters as Record<string, XBParameterValue>) };
      parameters[name] = result.value as XBParameterValue;
    }
    if (!parameters) return node;
    changed = true;
    return { ...node, parameters };
  });
  return { model: changed ? { ...model, nodes } : model, diagnostics };
};
