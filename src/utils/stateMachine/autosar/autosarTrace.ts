import type { SemanticModel } from '../smSemanticModel';

/** Version of the AUTOSAR generator; bump on every change of the generated output. */
export const AUTOSAR_GENERATOR_VERSION = '2.0.0';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source).sort().reduce<Record<string, unknown>>((target, key) => {
      if (source[key] !== undefined) target[key] = canonicalize(source[key]);
      return target;
    }, {});
  }
  return value;
};

/**
 * Deterministic 64-bit FNV-1a hash (16 lower-case hex digits) of the canonical
 * JSON (sorted keys, no timestamps) of the validated semantic model. It changes
 * whenever anything that influences the generated code changes.
 */
export const modelFingerprint = (ir: SemanticModel): string => {
  const text = JSON.stringify(canonicalize(ir));
  const bytes = new TextEncoder().encode(text);
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
};

/** The two traceability lines every deliverable carries. */
export const traceLines = (fingerprint: string): [string, string] => [
  `ADIA-AUTOSAR-GENERATOR: ${AUTOSAR_GENERATOR_VERSION}`,
  `ADIA-FINGERPRINT: ${fingerprint}`,
];

export const traceComment = (fingerprint: string): string[] => {
  const [generator, print] = traceLines(fingerprint);
  return [`/* ${generator} */`, `/* ${print} */`];
};
