/**
 * WP-40: validation of the text typed in a V-Lab numeric parameter field.
 *
 * The WP-08 parameter schema (VLAB_LIBRARY: min / max / exclusiveMin / exclusiveMax / nonZero) and `parseNumeric` are the ONLY
 * source of validity. There is no global "positive integer" coercion: 0, fractions, negatives (where the bounds allow them) and
 * scientific notation (1e-3, -2.5E+4) are accepted; anything else yields an error message, never a silent revert or default.
 */
import { VLAB_LIBRARY, type VLabParamSpec } from '../../utils/vlabLibrary';
import { boundViolation, parseNumeric } from '../../engine/vlab/vlabParams';

let specIndex: Map<string, Record<string, VLabParamSpec>> | null = null;

/** The library schema of one parameter of a block type (undefined for a parameter the library does not list). */
export function getParamSpec(blockType: string, key: string): VLabParamSpec | undefined {
  if (!specIndex) {
    specIndex = new Map();
    for (const d of VLAB_LIBRARY) for (const b of d.blocks) specIndex.set(b.id, b.params ?? {});
  }
  return specIndex.get(blockType)?.[key];
}

export type ParamTextResult = { ok: true; value: number } | { ok: false; error: string };

/** Validate the text of a numeric parameter against its schema. */
export function validateParamText(text: string, spec?: Pick<VLabParamSpec, 'min' | 'max' | 'exclusiveMin' | 'exclusiveMax' | 'nonZero'> & { unit?: string }): ParamTextResult {
  const parsed = parseNumeric(text);
  if (parsed.kind === 'missing') return { ok: false, error: 'Enter a number (for example 0.5, -2 or 1e-3).' };
  if (parsed.kind === 'invalid') return { ok: false, error: `"${text.trim()}" is not a number (for example 0.5, -2 or 1e-3).` };
  if (spec) {
    const bad = boundViolation(parsed.value, spec);
    if (bad) return { ok: false, error: `${parsed.value}${spec.unit ? ` ${spec.unit}` : ''} is out of range: must be ${bad}.` };
  }
  return { ok: true, value: parsed.value };
}
