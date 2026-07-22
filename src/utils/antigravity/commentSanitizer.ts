/**
 * commentSanitizer.ts
 * Implements REQ-PF-02 (Protocol COMMENT_SHIELD)
 * Normalizes malformed block comments (/ text / or unclosed /* text) into valid C block comments (/* text *\/)
 */

export function sanitizeComments(cCode: string): string {
  if (!cCode) return cCode;

  let output = cCode;

  // 1. Replace single-slash block comments: / comment text / -> /* comment text */
  output = output.replace(/(^|\s)\/([^*\n/][^\n/]*)\/(\s|$)/g, (_match, p1, p2, p3) => `${p1}/* ${p2.trim()} */${p3}`);

  // 2. Fix unclosed /* comments by appending */ before code statement keywords
  const lines = output.split('\n');
  let insideBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('/*') && !line.includes('*/')) {
      insideBlock = true;
    } else if (insideBlock) {
      if (line.includes('*/')) {
        insideBlock = false;
      } else if (line.trim().startsWith('void') || line.trim().startsWith('typedef') || line.trim().startsWith('SM_') || line.trim() === '}') {
        // Auto-close previous comment line before code definition begins
        lines[i - 1] = lines[i - 1] + ' */';
        insideBlock = false;
      }
    }
  }

  return lines.join('\n');
}
