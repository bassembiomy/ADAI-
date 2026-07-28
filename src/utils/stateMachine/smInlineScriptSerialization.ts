const INLINE_SCRIPT_ESCAPE: Readonly<Record<string, string>> = Object.freeze({
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
});

export const serializeInlineScriptJson = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Inline script payload must be JSON serializable.');
  }
  return serialized.replace(
    /[<>&\u2028\u2029]/g,
    character => INLINE_SCRIPT_ESCAPE[character],
  );
};
