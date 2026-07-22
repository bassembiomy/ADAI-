/**
 * pointerShield.ts
 * Implements REQ-PF-01 (Protocol NO_POINTER_STRIP)
 * Enforces ADIA_Instance_t* pass-by-pointer semantics and transforms instance. to instance->
 */

export function sanitizePointers(cCode: string): string {
  if (!cCode) return cCode;

  // 1. Convert any ADIA_Instance_t parameter that lacks an asterisk to ADIA_Instance_t*
  let output = cCode.replace(/\b(const\s+)?ADIA_Instance_t(?!\s*\*)\s+([A-Za-z0-9_]+)\b/g, '$1ADIA_Instance_t* $2');

  // 2. Find parameter name for ADIA_Instance_t* param
  const paramMatch = /\bADIA_Instance_t\*\s+([A-Za-z0-9_]+)\b/.exec(output);
  if (paramMatch) {
    const paramName = paramMatch[1];
    // Replace paramName.field with paramName->field throughout the code
    const dotRegex = new RegExp(`\\b${paramName}\\.([A-Za-z0-9_]+)`, 'g');
    output = output.replace(dotRegex, `${paramName}->$1`);
  }

  return output;
}
